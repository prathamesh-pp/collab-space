import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { DocumentContent } from "@/lib/document-content";

export type DocumentSaveSnapshot = {
  contentRevision: number;
  yState: Uint8Array | null;
};

export type DocumentContentSaveRepository = {
  findSnapshot(documentId: string): Promise<DocumentSaveSnapshot | null>;
  saveIfUnchanged(input: {
    documentId: string;
    expectedRevision: number;
    expectedYState: Uint8Array | null;
    content: DocumentContent;
  }): Promise<boolean>;
};

export type DocumentContentSaveResult =
  | { status: 200; body: { contentRevision: number; contentStateVersion: null } }
  | { status: 404; body: { error: string } }
  | { status: 409; body: { error: string; contentRevision: number } };

export function getDocumentStateVersion(yState: Uint8Array | null): string | null {
  return yState
    ? createHash("sha256").update(yState).digest("hex")
    : null;
}

function conflict(revision: number, hasYState: boolean): DocumentContentSaveResult {
  return {
    status: 409,
    body: {
      error: hasYState
        ? "The document changed in another editor. Reload before editing further."
        : "A newer version exists. Reload before editing further.",
      contentRevision: revision,
    },
  };
}

export async function saveDocumentContentWith(
  repository: DocumentContentSaveRepository,
  documentId: string,
  content: DocumentContent,
  expectedRevision: number,
  expectedStateVersion: string | null,
): Promise<DocumentContentSaveResult> {
  const current = await repository.findSnapshot(documentId);
  if (!current) return { status: 404, body: { error: "Document not found." } };

  const stateVersion = getDocumentStateVersion(current.yState);
  if (
    current.contentRevision !== expectedRevision ||
    stateVersion !== expectedStateVersion
  ) {
    return conflict(current.contentRevision, current.yState !== null);
  }

  const saved = await repository.saveIfUnchanged({
    documentId,
    expectedRevision,
    expectedYState: current.yState,
    content,
  });
  if (!saved) {
    const latest = await repository.findSnapshot(documentId);
    if (!latest) return { status: 404, body: { error: "Document not found." } };
    return conflict(latest.contentRevision, latest.yState !== null);
  }

  return {
    status: 200,
    body: {
      contentRevision: expectedRevision + 1,
      contentStateVersion: null,
    },
  };
}

export function createPrismaDocumentContentSaveRepository(): DocumentContentSaveRepository {
  return {
    async findSnapshot(documentId) {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { contentRevision: true, yState: true },
      });
      return document
        ? { contentRevision: document.contentRevision, yState: document.yState }
        : null;
    },
    async saveIfUnchanged({ documentId, expectedRevision, expectedYState, content }) {
      const result = await prisma.document.updateMany({
        where: {
          id: documentId,
          contentRevision: expectedRevision,
          yState: expectedYState === null
            ? null
            : { equals: Buffer.from(expectedYState) },
        },
        data: {
          content: content as Prisma.InputJsonValue,
          contentRevision: { increment: 1 },
          yState: null,
        },
      });
      return result.count === 1;
    },
  };
}
