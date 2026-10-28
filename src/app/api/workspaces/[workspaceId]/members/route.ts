import { addWorkspaceMember, listWorkspaceMembers } from "@/lib/workspace-members-core";
import { workspaceMembersRepository } from "@/lib/workspace-members-repository";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);

    const { workspaceId } = await params;
    const result = await listWorkspaceMembers(
      workspaceMembersRepository,
      workspaceId,
      user.id,
    );
    return Response.json(result.body, { status: result.status });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);

    const body = await request.json().catch(() => null);
    const { workspaceId } = await params;
    const result = await addWorkspaceMember(
      workspaceMembersRepository,
      workspaceId,
      user.id,
      body?.email,
      body?.role,
    );
    return Response.json(result.body, { status: result.status });
  });
}
