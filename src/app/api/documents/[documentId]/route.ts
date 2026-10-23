import { z } from "zod";
import { canEdit, getWorkspaceMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";
import { parseDocumentContent } from "@/lib/document-content";

const schema = z.object({ title: z.string().trim().min(1).max(120) });

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  return withApiErrors(async () => {
  const user = await getApiUser();
  if (!user) return jsonError("Sign in to continue.", 401);
  const { documentId } = await params;
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      content: true,
      contentRevision: true,
      createdAt: true,
      updatedAt: true,
      workspace: {
        select: {
          id: true,
          name: true,
          members: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!document) return jsonError("Document not found.", 404);
  const membership = await getWorkspaceMembership(user.id, document.workspaceId);
  if (!membership) return jsonError("Document not found.", 404);
  return Response.json({
    document: {
      ...document,
      content: parseDocumentContent(document.content),
    },
    role: membership.role,
  });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  return withApiErrors(async () => {
  const user = await getApiUser();
  if (!user) return jsonError("Sign in to continue.", 401);
  const { documentId } = await params;
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { workspaceId: true } });
  if (!document) return jsonError("Document not found.", 404);
  const membership = await getWorkspaceMembership(user.id, document.workspaceId);
  if (!membership) return jsonError("Document not found.", 404);
  if (!canEdit(membership.role)) return jsonError("You do not have permission to rename this document.", 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Document title must be 1 to 120 characters.", 400);
  const updated = await prisma.document.update({ where: { id: documentId }, data: { title: parsed.data.title } });
  return Response.json({ document: { id: updated.id, title: updated.title, updatedAt: updated.updatedAt } });
  });
}