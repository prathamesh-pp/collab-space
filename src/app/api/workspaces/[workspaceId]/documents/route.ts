import { z } from "zod";
import { canEdit, getWorkspaceMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";

const schema = z.object({ title: z.string().trim().min(1).max(120).optional() });

export async function GET(_request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  return withApiErrors(async () => {
  const user = await getApiUser();
  if (!user) return jsonError("Sign in to continue.", 401);
  const { workspaceId } = await params;
  const membership = await getWorkspaceMembership(user.id, workspaceId);
  if (!membership) return jsonError("Workspace not found.", 404);

  const documents = await prisma.document.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
  return Response.json({ documents, role: membership.role });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  return withApiErrors(async () => {
  const user = await getApiUser();
  if (!user) return jsonError("Sign in to continue.", 401);
  const { workspaceId } = await params;
  const membership = await getWorkspaceMembership(user.id, workspaceId);
  if (!membership) return jsonError("Workspace not found.", 404);
  if (!canEdit(membership.role)) return jsonError("You do not have permission to create documents.", 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Document title must be 1 to 120 characters.", 400);
  const document = await prisma.document.create({ data: { workspaceId, title: parsed.data.title ?? "Untitled" } });
  return Response.json({ document }, { status: 201 });
  });
}