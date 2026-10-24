export const RECENT_DOCUMENT_LIMIT = 8;

export type RecentDocumentRecord = {
  documentId: string;
  openedAt: number;
};

export type AuthorizedRecentDocument = {
  id: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  updatedAt?: string;
};

export function normalizeRecentDocuments(
  records: RecentDocumentRecord[],
  limit = RECENT_DOCUMENT_LIMIT,
): RecentDocumentRecord[] {
  const newestByDocument = new Map<string, number>();

  for (const record of records) {
    if (
      typeof record.documentId !== "string" ||
      record.documentId.length === 0 ||
      !Number.isFinite(record.openedAt) ||
      record.openedAt < 0
    ) {
      continue;
    }

    const previousOpenedAt = newestByDocument.get(record.documentId) ?? -1;
    newestByDocument.set(
      record.documentId,
      Math.max(previousOpenedAt, record.openedAt),
    );
  }

  return [...newestByDocument.entries()]
    .map(([documentId, openedAt]) => ({ documentId, openedAt }))
    .sort(
      (a, b) =>
        b.openedAt - a.openedAt || a.documentId.localeCompare(b.documentId),
    )
    .slice(0, Math.max(0, limit));
}

export function recordRecentDocument(
  records: RecentDocumentRecord[],
  documentId: string,
  openedAt: number,
  limit = RECENT_DOCUMENT_LIMIT,
): RecentDocumentRecord[] {
  return normalizeRecentDocuments(
    [...records, { documentId, openedAt }],
    limit,
  );
}

export function parseRecentDocuments(
  serialized: string | null,
): RecentDocumentRecord[] {
  if (!serialized) return [];

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];

    return normalizeRecentDocuments(
      parsed.filter(
        (record): record is RecentDocumentRecord =>
          typeof record === "object" &&
          record !== null &&
          "documentId" in record &&
          typeof record.documentId === "string" &&
          "openedAt" in record &&
          typeof record.openedAt === "number",
      ),
    );
  } catch {
    return [];
  }
}

export function getRecentDocuments(
  records: RecentDocumentRecord[],
  authorizedDocuments: AuthorizedRecentDocument[],
  limit = RECENT_DOCUMENT_LIMIT,
): Array<RecentDocumentRecord & { document: AuthorizedRecentDocument }> {
  const documentsById = new Map(
    authorizedDocuments.map((document) => [document.id, document]),
  );

  return normalizeRecentDocuments(records, records.length)
    .flatMap((record) => {
      const document = documentsById.get(record.documentId);
      return document ? [{ ...record, document }] : [];
    })
    .slice(0, Math.max(0, limit));
}
