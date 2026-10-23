import { z } from "zod";
import { prisma } from "@/lib/db";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";

const schema = z.object({ name: z.string().trim().min(2).max(60) });

export async function GET() {
  return withApiErrors(async () => {
  const user = await getApiUser();
  if (!user) return jsonError("Sign in to continue.", 401);

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    include: {
      members: { where: { userId: user.id }, select: { role: true } },
      documents: { orderBy: { updatedAt: "desc" }, select: { id: true, title: true, updatedAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json({ workspaces });
  });
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
  const user = await getApiUser();
  if (!user) return jsonError("Sign in to continue.", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Workspace name must be between 2 and 60 characters.", 400);

  const workspace = await prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({ data: { name: parsed.data.name, createdById: user.id } });
    await tx.workspaceMember.create({ data: { workspaceId: created.id, userId: user.id, role: "OWNER" } });
    const document = await tx.document.create({ data: { workspaceId: created.id, title: "Untitled" } });
    return { ...created, documents: [document] };
  });
  return Response.json({ workspace }, { status: 201 });
  });
}