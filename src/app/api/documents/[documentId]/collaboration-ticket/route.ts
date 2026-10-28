import { canEdit, getWorkspaceMembership, getCurrentSession } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/collaboration-ticket";
import { createCollaborationTicket } from "@/lib/session-core";
import { prisma } from "@/lib/db";
import { jsonError, withApiErrors } from "@/lib/http";
import { isClientCollaborationConfigured } from "@/collaboration/feature-flag";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  return withApiErrors(async () => {
    if (!isClientCollaborationConfigured(
      process.env.NEXT_PUBLIC_COLLABORATION_ENABLED,
      process.env.NODE_ENV,
      process.env.NEXT_PUBLIC_COLLABORATION_URL,
    )) {
      return jsonError("Collaborative editing is not enabled.", 503);
    }
    if (!isSameOriginRequest(request)) {
      return jsonError("Requests must come from this origin.", 403);
    }

    const session = await getCurrentSession();
    if (!session) return jsonError("Sign in to continue.", 401);

    const { documentId } = await params;
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { workspaceId: true },
    });
    if (!document) return jsonError("Document not found.", 404);

    const membership = await getWorkspaceMembership(
      session.user.id,
      document.workspaceId,
    );
    if (!membership) return jsonError("Document not found.", 404);
    if (!canEdit(membership.role)) {
      return jsonError("You do not have permission to collaborate on this document.", 403);
    }

    const ticket = await createCollaborationTicket(session.id, documentId);
    if (!ticket) return jsonError("Your session has expired. Sign in again.", 401);

    return Response.json(
      { ticket: ticket.token, expiresAt: ticket.expiresAt },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
