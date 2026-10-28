import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import type { Configuration } from "@hocuspocus/server";
import { applyUpdate, encodeStateAsUpdate, Doc } from "yjs";
import {
  collaborationSchema,
  COLLABORATION_FRAGMENT,
} from "@/collaboration/tiptap-schema";
import {
  parseDocumentContent,
  type DocumentContent,
} from "@/lib/document-content";
import { prisma } from "@/lib/db";

const EMPTY_DOCUMENT_CONTENT: DocumentContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type PersistedDocument = {
  content: unknown | null;
  contentRevision: number;
  yState: Uint8Array | null;
};

export type CollaborationPersistenceRepository = {
  findDocument(documentId: string): Promise<PersistedDocument | null>;
  initializeYStateIfNull(
    documentId: string,
    expectedContentRevision: number,
    state: Uint8Array,
  ): Promise<boolean>;
  saveYState(documentId: string, state: Uint8Array): Promise<void>;
};

export class InvalidDocumentContentError extends Error {
  constructor() {
    super("Stored document content is invalid and cannot be seeded for collaboration.");
    this.name = "InvalidDocumentContentError";
  }
}

export class CollaborationDocumentNotFoundError extends Error {
  constructor() {
    super("Document was not found during collaboration persistence.");
    this.name = "CollaborationDocumentNotFoundError";
  }
}

export class CollaborationInitializationConflictError extends Error {
  constructor() {
    super("Document Yjs state changed during collaboration initialization.");
    this.name = "CollaborationInitializationConflictError";
  }
}

export class InvalidYStateError extends Error {
  constructor() {
    super("Stored Yjs state is invalid.");
    this.name = "InvalidYStateError";
  }
}

export class CollaborationPersistenceError extends Error {
  constructor() {
    super("Collaboration persistence operation failed.");
    this.name = "CollaborationPersistenceError";
  }
}

export type CollaborationPersistenceOperation = "load" | "store";

export type CollaborationPersistenceFailure = {
  operation: CollaborationPersistenceOperation;
  occurredAt: string;
};

export class CollaborationPersistenceHealth {
  private lastFailure: CollaborationPersistenceFailure | null = null;

  reportFailure(operation: CollaborationPersistenceOperation): void {
    this.lastFailure = { operation, occurredAt: new Date().toISOString() };
  }

  getLastFailure(): CollaborationPersistenceFailure | null {
    return this.lastFailure ? { ...this.lastFailure } : null;
  }
}

export const collaborationPersistenceHealth =
  new CollaborationPersistenceHealth();

function yDocFromState(state: Uint8Array): Doc {
  const document = new Doc();
  try {
    applyUpdate(document, state);
    return document;
  } catch {
    document.destroy();
    throw new InvalidYStateError();
  }
}

export function documentContentFromYState(state: Uint8Array): DocumentContent {
  const document = yDocFromState(state);
  try {
    const content = parseDocumentContent(
      yDocToProsemirrorJSON(document, COLLABORATION_FRAGMENT),
    );
    if (!content) throw new InvalidYStateError();
    return content;
  } catch (error) {
    if (error instanceof InvalidYStateError) throw error;
    throw new InvalidYStateError();
  } finally {
    document.destroy();
  }
}

function yDocFromContent(value: unknown | null): Doc {
  const content = value === null
    ? EMPTY_DOCUMENT_CONTENT
    : parseDocumentContent(value);
  if (!content) throw new InvalidDocumentContentError();

  return prosemirrorJSONToYDoc(
    collaborationSchema,
    content,
    COLLABORATION_FRAGMENT,
  );
}

export async function loadOrInitializeYDoc(
  documentId: string,
  repository: CollaborationPersistenceRepository,
): Promise<Doc> {
  const record = await repository.findDocument(documentId);
  if (!record) throw new CollaborationDocumentNotFoundError();
  if (record.yState) return yDocFromState(record.yState);

  let candidate = record;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const seededDocument = yDocFromContent(candidate.content);
    const initialState = encodeStateAsUpdate(seededDocument);
    const initialized = await repository.initializeYStateIfNull(
      documentId,
      candidate.contentRevision,
      initialState,
    );
    if (initialized) return seededDocument;

    const winningRecord = await repository.findDocument(documentId);
    if (!winningRecord) throw new CollaborationDocumentNotFoundError();
    if (winningRecord.yState) return yDocFromState(winningRecord.yState);
    if (attempt === 1) throw new CollaborationInitializationConflictError();
    candidate = winningRecord;
  }

  throw new CollaborationInitializationConflictError();
}

export function createPrismaCollaborationPersistenceRepository():
  CollaborationPersistenceRepository {
  return {
    async findDocument(documentId) {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { content: true, contentRevision: true, yState: true },
      });
      return document
        ? {
            content: document.content,
            contentRevision: document.contentRevision,
            yState: document.yState,
          }
        : null;
    },
    async initializeYStateIfNull(documentId, expectedContentRevision, state) {
      const result = await prisma.document.updateMany({
        where: {
          id: documentId,
          yState: null,
          contentRevision: expectedContentRevision,
        },
        data: { yState: Buffer.from(state) },
      });
      return result.count === 1;
    },
    async saveYState(documentId, state) {
      const result = await prisma.document.updateMany({
        where: { id: documentId },
        data: { yState: Buffer.from(state) },
      });
      if (result.count !== 1) throw new CollaborationDocumentNotFoundError();
    },
  };
}

export function createCollaborationPersistenceHooks(
  repository: CollaborationPersistenceRepository,
  health = collaborationPersistenceHealth,
): Pick<Configuration, "onLoadDocument" | "onStoreDocument"> {
  return {
    async onLoadDocument({ document, documentName }) {
      let loadedDocument: Doc | null = null;
      try {
        loadedDocument = await loadOrInitializeYDoc(documentName, repository);
        applyUpdate(document, encodeStateAsUpdate(loadedDocument));
      } catch (error) {
        health.reportFailure("load");
        if (
          error instanceof InvalidDocumentContentError ||
          error instanceof InvalidYStateError ||
          error instanceof CollaborationDocumentNotFoundError ||
          error instanceof CollaborationInitializationConflictError ||
          error instanceof CollaborationPersistenceError
        ) {
          throw error;
        }
        throw new CollaborationPersistenceError();
      } finally {
        loadedDocument?.destroy();
      }
    },
    async onStoreDocument({ document, documentName }) {
      try {
        await repository.saveYState(
          documentName,
          encodeStateAsUpdate(document),
        );
      } catch (error) {
        health.reportFailure("store");
        if (error instanceof CollaborationPersistenceError) throw error;
        if (error instanceof CollaborationDocumentNotFoundError) throw error;
        throw new CollaborationPersistenceError();
      }
    },
  };
}

export const collaborationPersistenceRepository =
  createPrismaCollaborationPersistenceRepository();
