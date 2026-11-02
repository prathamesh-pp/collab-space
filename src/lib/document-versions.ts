import { canEdit, type WorkspaceRole } from "@/lib/permissions";
import { parseDocumentContent, type DocumentContent } from "@/lib/document-content";
import { documentContentFromYState } from "@/collaboration/persistence";

export type VersionDocument = {
  workspaceId: string;
  content: unknown;
  contentRevision: number;
  yState?: Uint8Array | null;
};

export type DocumentVersionSummary = {
  id: string;
  label: string;
  createdAt: Date;
  user: { name: string };
};

export interface DocumentVersionRepository {
  findDocument(documentId: string): Promise<VersionDocument | null>;
  findMembershipRole(workspaceId: string, userId: string): Promise<string | null>;
  listVersions(documentId: string): Promise<DocumentVersionSummary[]>;
  createVersion(input: {
    documentId: string;
    userId: string;
    label: string;
    content: DocumentContent;
  }): Promise<DocumentVersionSummary>;
  findVersion(documentId: string, versionId: string): Promise<{ content: unknown } | null>;
  restoreAtomically(input: {
    documentId: string;
    userId: string;
    content: DocumentContent;
  }): Promise<number | null>;
}

export type DocumentVersionResult = {
  status: number;
  body: Record<string, unknown>;
};

function failure(status: number, error: string): DocumentVersionResult {
  return { status, body: { error } };
}

export function getDocumentVersionContent(
  document: Pick<VersionDocument, "content" | "yState">,
): DocumentContent | null {
  if (document.yState) {
    try {
      return documentContentFromYState(document.yState);
    } catch {
      return null;
    }
  }
  return parseDocumentContent(document.content);
}

async function authorize(
  repository: DocumentVersionRepository,
  documentId: string,
  userId: string,
  requireEdit: boolean,
) {
  const document = await repository.findDocument(documentId);
  if (!document) return { error: failure(404, "Document not found.") } as const;
  const role = await repository.findMembershipRole(document.workspaceId, userId);
  if (!role) return { error: failure(404, "Document not found.") } as const;
  if (requireEdit && !canEdit(role)) {
    return { error: failure(403, "You do not have permission to manage versions.") } as const;
  }
  return { document, role: role as WorkspaceRole } as const;
}

export async function listDocumentVersions(
  repository: DocumentVersionRepository,
  documentId: string,
  userId: string,
): Promise<DocumentVersionResult> {
  const access = await authorize(repository, documentId, userId, false);
  if ("error" in access && access.error) return access.error;
  return { status: 200, body: { versions: await repository.listVersions(documentId) } };
}

export async function createDocumentVersion(
  repository: DocumentVersionRepository,
  documentId: string,
  userId: string,
  label: string,
  allowJsonHistoryMutation = true,
): Promise<DocumentVersionResult> {
  const access = await authorize(repository, documentId, userId, true);
  if ("error" in access && access.error) return access.error;
  if (!allowJsonHistoryMutation) {
    return failure(409, "Version snapshots are unavailable while collaborative editing is enabled.");
  }
  const content = getDocumentVersionContent(access.document);
  if (!content) return failure(409, "This document has no restorable JSON content yet.");
  const version = await repository.createVersion({ documentId, userId, label, content });
  return { status: 201, body: { version } };
}

export async function restoreDocumentVersion(
  repository: DocumentVersionRepository,
  documentId: string,
  versionId: string,
  userId: string,
  allowJsonHistoryMutation = true,
): Promise<DocumentVersionResult> {
  const access = await authorize(repository, documentId, userId, true);
  if ("error" in access && access.error) return access.error;
  if (!allowJsonHistoryMutation) {
    return failure(409, "Version restoration is unavailable while collaborative editing is enabled.");
  }
  const version = await repository.findVersion(documentId, versionId);
  if (!version) return failure(404, "Version not found.");
  const content = parseDocumentContent(version.content);
  if (!content) return failure(409, "This version cannot be restored.");
  const contentRevision = await repository.restoreAtomically({ documentId, userId, content });
  if (contentRevision === null) {
    return failure(409, "The document changed during restore. Reload and try again.");
  }
  return { status: 200, body: { ok: true, contentRevision } };
}
