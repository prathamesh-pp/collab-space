import { z } from "zod";

export const assignableWorkspaceRoleSchema = z.enum([
  "EDITOR",
  "COMMENTER",
  "VIEWER",
]);

export type AssignableWorkspaceRole = z.infer<
  typeof assignableWorkspaceRoleSchema
>;

export type WorkspaceMemberRecord = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
};

export type WorkspaceMemberTransaction = {
  findRole(workspaceId: string, userId: string): Promise<string | null>;
  findMember(workspaceId: string, userId: string): Promise<{
    userId: string;
    role: string;
  } | null>;
  countOwners(workspaceId: string): Promise<number>;
  updateRole(
    workspaceId: string,
    userId: string,
    role: AssignableWorkspaceRole,
  ): Promise<void>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
};

export type WorkspaceMembersRepository = {
  findWorkspace(workspaceId: string): Promise<{
    id: string;
    name: string;
  } | null>;
  findRole(workspaceId: string, userId: string): Promise<string | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]>;
  transaction<T>(
    callback: (transaction: WorkspaceMemberTransaction) => Promise<T>,
  ): Promise<T>;
};

export type WorkspaceMembersResult = {
  status: number;
  body: Record<string, unknown>;
};

function failure(status: number, error: string): WorkspaceMembersResult {
  return { status, body: { error } };
}

export async function listWorkspaceMembers(
  repository: WorkspaceMembersRepository,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMembersResult> {
  const workspace = await repository.findWorkspace(workspaceId);
  if (!workspace) return failure(404, "Workspace not found.");

  const actorRole = await repository.findRole(workspaceId, userId);
  if (!actorRole) return failure(404, "Workspace not found.");

  const members = await repository.listMembers(workspaceId);
  return {
    status: 200,
    body: {
      workspace: { id: workspace.id, name: workspace.name },
      role: actorRole,
      members: members.map(({ id, userId: memberUserId, name, email, role, createdAt }) => ({
        id,
        userId: memberUserId,
        name,
        email,
        role,
        createdAt,
      })),
    },
  };
}

export async function updateWorkspaceMemberRole(
  repository: WorkspaceMembersRepository,
  workspaceId: string,
  actorId: string,
  targetUserId: string,
  requestedRole: unknown,
): Promise<WorkspaceMembersResult> {
  const parsed = assignableWorkspaceRoleSchema.safeParse(requestedRole);
  if (!parsed.success) {
    return failure(400, "Choose an editor, commenter, or viewer role.");
  }

  return repository.transaction(async (transaction) => {
    const actorRole = await transaction.findRole(workspaceId, actorId);
    if (!actorRole) return failure(404, "Workspace not found.");
    if (actorRole !== "OWNER") {
      return failure(403, "Only workspace owners can manage members.");
    }

    const target = await transaction.findMember(workspaceId, targetUserId);
    if (!target) return failure(404, "Workspace member not found.");

    if (target.role === "OWNER") {
      const ownerCount = await transaction.countOwners(workspaceId);
      if (ownerCount <= 1) {
        return failure(409, "A workspace must have at least one owner.");
      }
    }

    await transaction.updateRole(workspaceId, targetUserId, parsed.data);
    return { status: 200, body: { userId: targetUserId, role: parsed.data } };
  });
}

export async function removeWorkspaceMember(
  repository: WorkspaceMembersRepository,
  workspaceId: string,
  actorId: string,
  targetUserId: string,
): Promise<WorkspaceMembersResult> {
  return repository.transaction(async (transaction) => {
    const actorRole = await transaction.findRole(workspaceId, actorId);
    if (!actorRole) return failure(404, "Workspace not found.");
    if (actorRole !== "OWNER") {
      return failure(403, "Only workspace owners can manage members.");
    }

    const target = await transaction.findMember(workspaceId, targetUserId);
    if (!target) return failure(404, "Workspace member not found.");

    if (target.role === "OWNER") {
      const ownerCount = await transaction.countOwners(workspaceId);
      if (ownerCount <= 1) {
        return failure(409, "A workspace must have at least one owner.");
      }
    }

    await transaction.removeMember(workspaceId, targetUserId);
    return { status: 200, body: { userId: targetUserId, removed: true } };
  });
}
