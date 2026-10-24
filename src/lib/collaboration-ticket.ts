import { Prisma } from "@prisma/client";
import { canEdit } from "@/lib/permissions";
import { hashToken } from "@/lib/token";

export type CollaborationTicketRecord = {
  id: string;
  documentId: string;
  userId: string;
  sessionId: string | null;
  workspaceId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  } | null;
  role?: string | null;
};

export type CollaborationTicketTransaction = {
  findTicket(
    tokenHash: string,
    now: Date,
  ): Promise<CollaborationTicketRecord | null>;
  findMembership(workspaceId: string, userId: string): Promise<string | null>;
  consumeTicket(
    id: string,
    tokenHash: string,
    sessionId: string,
    now: Date,
  ): Promise<boolean>;
};

export type CollaborationTicketRepository = {
  transaction<T>(
    callback: (transaction: CollaborationTicketTransaction) => Promise<T>,
  ): Promise<T>;
};

export function authorizeCollaborationTicket(
  ticket: CollaborationTicketRecord,
  requestedDocumentId: string,
  now: Date,
): { documentId: string; userId: string; role: "OWNER" | "EDITOR" } | null {
  const role = ticket.role ?? "";
  if (
    ticket.consumedAt ||
    ticket.expiresAt <= now ||
    ticket.documentId !== requestedDocumentId ||
    !ticket.sessionId ||
    !ticket.session ||
    ticket.session.id !== ticket.sessionId ||
    ticket.session.userId !== ticket.userId ||
    ticket.session.expiresAt <= now ||
    !canEdit(role)
  ) {
    return null;
  }

  return {
    documentId: ticket.documentId,
    userId: ticket.userId,
    role,
  };
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export async function consumeCollaborationTicketWith(
  token: string,
  requestedDocumentId: string,
  repository: CollaborationTicketRepository,
  now = new Date(),
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const tokenHash = hashToken(token);
  try {
    return await repository.transaction(async (transaction) => {
      const ticket = await transaction.findTicket(tokenHash, now);
      if (!ticket) return null;

      const membershipRole = await transaction.findMembership(
        ticket.workspaceId,
        ticket.userId,
      );
      const access = authorizeCollaborationTicket(
        { ...ticket, role: membershipRole },
        requestedDocumentId,
        now,
      );
      if (!access || !ticket.sessionId) return null;

      const consumed = await transaction.consumeTicket(
        ticket.id,
        tokenHash,
        ticket.sessionId,
        now,
      );
      return consumed ? access : null;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return null;
    }
    throw error;
  }
}
