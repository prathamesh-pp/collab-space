import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getDocumentVersionContent, type DocumentVersionRepository } from "@/lib/document-versions";

class RestoreConflictError extends Error {}

export function createPrismaDocumentVersionRepository(
  client: PrismaClient = prisma,
): DocumentVersionRepository {
  return {
    async findDocument(documentId) {
      return client.document.findUnique({
        where: { id: documentId },
        select: { workspaceId: true, content: true, contentRevision: true, yState: true },
      });
    },
    async findMembershipRole(workspaceId, userId) {
      const membership = await client.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { role: true },
      });
      return membership?.role ?? null;
    },
    async listVersions(documentId) {
      return client.documentVersion.findMany({
        where: { documentId, content: { not: Prisma.DbNull } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, label: true, createdAt: true, user: { select: { name: true } } },
      });
    },
    async createVersion({ documentId, userId, label, content }) {
      return client.documentVersion.create({
        data: { documentId, userId, label, content: content as Prisma.InputJsonValue },
        select: { id: true, label: true, createdAt: true, user: { select: { name: true } } },
      });
    },
    async findVersion(documentId, versionId) {
      return client.documentVersion.findFirst({
        where: { id: versionId, documentId },
        select: { content: true },
      });
    },
    async restoreAtomically({ documentId, userId, content }) {
      try {
        return await client.$transaction(async (tx) => {
          const current = await tx.document.findUnique({
            where: { id: documentId },
            select: { content: true, contentRevision: true, yState: true },
          });
          if (!current) return null;

          const beforeContent = getDocumentVersionContent(current);
          if (beforeContent) {
            await tx.documentVersion.create({
              data: {
                documentId,
                userId,
                label: "Before restore",
                content: beforeContent as Prisma.InputJsonValue,
              },
            });
          }

          const result = await tx.document.updateMany({
            where: {
              id: documentId,
              contentRevision: current.contentRevision,
              // A collaboration update can change Yjs state without changing
              // the legacy JSON revision. Tie restore to both representations.
              yState: current.yState === null
                ? null
                : { equals: Buffer.from(current.yState) },
            },
            data: {
              content: content as Prisma.InputJsonValue,
              contentRevision: { increment: 1 },
              yState: null,
            },
          });
          if (result.count !== 1) throw new RestoreConflictError();
          return current.contentRevision + 1;
        });
      } catch (error) {
        if (error instanceof RestoreConflictError) return null;
        throw error;
      }
    },
  };
}
