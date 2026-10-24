import { z } from "zod";
import {
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "@/lib/workspace-members-core";
import { workspaceMembersRepository } from "@/lib/workspace-members-repository";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";

const roleSchema = z.object({ role: z.unknown() }).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; userId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);

    const parsed = roleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError("Provide a valid workspace member role.", 400);
    }

    const { workspaceId, userId } = await params;
    const result = await updateWorkspaceMemberRole(
      workspaceMembersRepository,
      workspaceId,
      user.id,
      userId,
      parsed.data.role,
    );
    return Response.json(result.body, { status: result.status });
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; userId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);

    const { workspaceId, userId } = await params;
    const result = await removeWorkspaceMember(
      workspaceMembersRepository,
      workspaceId,
      user.id,
      userId,
    );
    return Response.json(result.body, { status: result.status });
  });
}
