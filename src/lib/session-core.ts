import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  consumeCollaborationTicketWith,
  type CollaborationTicketRepository,
} from "@/lib/collaboration-ticket";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/token";

export const SESSION_COOKIE = "collab_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const TICKET_DURATION_MS = 1000 * 60;

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  return { token, expiresAt };
}

export async function findSession(token: string) {
  return prisma.session.findFirst({
    where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function revokeSession(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function createCollaborationTicket(
  sessionId: string,
  documentId: string,
) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TICKET_DURATION_MS);

  const ticket = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: sessionId, expiresAt: { gt: now } },
      select: { userId: true },
    });
    if (!session) return null;

    return tx.collaborationTicket.create({
      data: {
        tokenHash: hashToken(token),
        userId: session.userId,
        sessionId,
        documentId,
        expiresAt,
      },
      select: { expiresAt: true },
    });
  });

  return ticket ? { token, expiresAt: ticket.expiresAt } : null;
}

export async function consumeCollaborationTicket(
  token: string,
  requestedDocumentId: string,
) {
  const repository: CollaborationTicketRepository = {
    transaction: (callback) =>
      prisma.$transaction(
        (tx) =>
          callback({
            findTicket: async (tokenHash, now) => {
              const ticket = await tx.collaborationTicket.findFirst({
                where: {
                  tokenHash,
                  expiresAt: { gt: now },
                  consumedAt: null,
                  sessionId: { not: null },
                },
                select: {
                  id: true,
                  documentId: true,
                  userId: true,
                  sessionId: true,
                  expiresAt: true,
                  consumedAt: true,
                  session: {
                    select: { id: true, userId: true, expiresAt: true },
                  },
                  document: { select: { workspaceId: true } },
                },
              });
              if (!ticket) return null;

              return {
                ...ticket,
                workspaceId: ticket.document.workspaceId,
              };
            },
            findMembership: async (workspaceId, userId) => {
              const membership = await tx.workspaceMember.findUnique({
                where: { workspaceId_userId: { workspaceId, userId } },
                select: { role: true },
              });
              return membership?.role ?? null;
            },
            consumeTicket: async (id, tokenHash, sessionId, now) => {
              const result = await tx.collaborationTicket.updateMany({
                where: {
                  id,
                  tokenHash,
                  sessionId,
                  consumedAt: null,
                  expiresAt: { gt: now },
                },
                data: { consumedAt: now },
              });
              return result.count === 1;
            },
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
  };

  return consumeCollaborationTicketWith(
    token,
    requestedDocumentId,
    repository,
  );
}