import assert from "node:assert/strict";
import test from "node:test";
import {
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type WorkspaceMemberRecord,
  type WorkspaceMemberTransaction,
  type WorkspaceMembersRepository,
} from "../src/lib/workspace-members-core";

const createdAt = new Date("2026-10-24T10:00:00.000Z");

function member(
  userId: string,
  role: string,
  overrides: Partial<WorkspaceMemberRecord> = {},
): WorkspaceMemberRecord {
  return {
    id: `membership-${userId}`,
    userId,
    name: userId === "owner" ? "Ada Lovelace" : "Grace Hopper",
    email: `${userId}@example.test`,
    role,
    createdAt,
    ...overrides,
  };
}

class MemoryWorkspaceMembers implements WorkspaceMembersRepository {
  workspace: { id: string; name: string } | null = {
    id: "workspace-1",
    name: "Product",
  };
  members = [member("owner", "OWNER"), member("member", "EDITOR")];

  async findWorkspace(workspaceId: string) {
    return this.workspace?.id === workspaceId ? this.workspace : null;
  }

  async findRole(workspaceId: string, userId: string) {
    if (this.workspace?.id !== workspaceId) return null;
    return this.members.find((item) => item.userId === userId)?.role ?? null;
  }

  async listMembers(workspaceId: string) {
    return this.workspace?.id === workspaceId ? this.members : [];
  }

  async transaction<T>(
    callback: (transaction: WorkspaceMemberTransaction) => Promise<T>,
  ) {
    return callback({
      findRole: async (workspaceId, userId) => this.findRole(workspaceId, userId),
      findMember: async (workspaceId, userId) => {
        if (this.workspace?.id !== workspaceId) return null;
        const found = this.members.find((item) => item.userId === userId);
        return found ? { userId: found.userId, role: found.role } : null;
      },
      countOwners: async (workspaceId) =>
        this.workspace?.id === workspaceId
          ? this.members.filter((item) => item.role === "OWNER").length
          : 0,
      updateRole: async (workspaceId, userId, role) => {
        assert.equal(this.workspace?.id, workspaceId);
        const found = this.members.find((item) => item.userId === userId);
        assert.ok(found);
        found.role = role;
      },
      removeMember: async (workspaceId, userId) => {
        assert.equal(this.workspace?.id, workspaceId);
        this.members = this.members.filter((item) => item.userId !== userId);
      },
    });
  }
}

test("workspace members are visible to members and include public identity and roles", async () => {
  const repository = new MemoryWorkspaceMembers();
  const result = await listWorkspaceMembers(repository, "workspace-1", "member");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    workspace: { id: "workspace-1", name: "Product" },
    role: "EDITOR",
    members: repository.members,
  });
});

test("nonmembers and missing workspaces cannot view members", async () => {
  const repository = new MemoryWorkspaceMembers();
  assert.deepEqual(
    await listWorkspaceMembers(repository, "workspace-1", "outsider"),
    { status: 404, body: { error: "Workspace not found." } },
  );
  assert.equal(
    (await listWorkspaceMembers(repository, "missing", "owner")).status,
    404,
  );
});

test("only owners can update roles and OWNER cannot be granted", async () => {
  const repository = new MemoryWorkspaceMembers();

  assert.equal(
    (
      await updateWorkspaceMemberRole(
        repository,
        "workspace-1",
        "member",
        "owner",
        "VIEWER",
      )
    ).status,
    403,
  );
  assert.equal(repository.members[0].role, "OWNER");

  assert.equal(
    (
      await updateWorkspaceMemberRole(
        repository,
        "workspace-1",
        "owner",
        "member",
        "OWNER",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await updateWorkspaceMemberRole(
        repository,
        "workspace-1",
        "owner",
        "member",
        "INVALID",
      )
    ).status,
    400,
  );
});

test("owners can change member roles to supported non-owner roles", async () => {
  const repository = new MemoryWorkspaceMembers();

  for (const role of ["EDITOR", "COMMENTER", "VIEWER"] as const) {
    const result = await updateWorkspaceMemberRole(
      repository,
      "workspace-1",
      "owner",
      "member",
      role,
    );
    assert.equal(result.status, 200);
    assert.equal(repository.members[1].role, role);
  }
});

test("the last owner cannot be demoted or removed", async () => {
  const repository = new MemoryWorkspaceMembers();
  repository.members = [member("owner", "OWNER")];

  assert.deepEqual(
    await updateWorkspaceMemberRole(
      repository,
      "workspace-1",
      "owner",
      "owner",
      "EDITOR",
    ),
    {
      status: 409,
      body: { error: "A workspace must have at least one owner." },
    },
  );
  assert.equal(
    (
      await removeWorkspaceMember(
        repository,
        "workspace-1",
        "owner",
        "owner",
      )
    ).status,
    409,
  );
  assert.equal(repository.members.length, 1);
  assert.equal(repository.members[0].role, "OWNER");
});

test("an owner can demote or remove an owner when another owner remains", async () => {
  const repository = new MemoryWorkspaceMembers();
  repository.members.push(member("second-owner", "OWNER"));

  assert.equal(
    (
      await updateWorkspaceMemberRole(
        repository,
        "workspace-1",
        "owner",
        "second-owner",
        "EDITOR",
      )
    ).status,
    200,
  );
  repository.members.find((item) => item.userId === "second-owner")!.role = "OWNER";

  assert.equal(
    (
      await removeWorkspaceMember(
        repository,
        "workspace-1",
        "owner",
        "second-owner",
      )
    ).status,
    200,
  );
  assert.equal(repository.members.filter((item) => item.role === "OWNER").length, 1);
});

test("owners can remove non-owners and unknown targets are rejected", async () => {
  const repository = new MemoryWorkspaceMembers();

  assert.equal(
    (
      await removeWorkspaceMember(
        repository,
        "workspace-1",
        "owner",
        "member",
      )
    ).status,
    200,
  );
  assert.equal(repository.members.some((item) => item.userId === "member"), false);
  assert.equal(
    (
      await removeWorkspaceMember(
        repository,
        "workspace-1",
        "owner",
        "missing",
      )
    ).status,
    404,
  );
});
