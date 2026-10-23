import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/token";

export const SESSION_COOKIE = "collab_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const TICKET_DURATION_MS = 1000 * 60 * 5;

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

export async function createCollaborationTicket(userId: string, documentId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TICKET_DURATION_MS);

  await prisma.collaborationTicket.create({
    data: { tokenHash: hashToken(token), userId, documentId, expiresAt },
  });

  return { token, expiresAt };
}