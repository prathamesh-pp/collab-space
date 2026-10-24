import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  WorkspaceMemberTransaction,
  WorkspaceMembersRepository,
} from "@/lib/workspace-members-core";

export const workspaceMembersRepository: WorkspaceMembersRepository = {
  findWorkspace: (workspaceId) =>
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    }),
  findRole: async (workspaceId, userId) => {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  },
  listMembers: (workspaceId) =>
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }).then((members) =>
      members.map(({ user, ...membership }) => ({
        ...membership,
        name: user.name,
        email: user.email,
      })),
    ),
  transaction: async <T>(
    callback: (transaction: WorkspaceMemberTransaction) => Promise<T>,
  ) =>
    prisma.$transaction(
      async (tx) =>
        callback({
          findRole: async (workspaceId, userId) => {
            const membership = await tx.workspaceMember.findUnique({
              where: { workspaceId_userId: { workspaceId, userId } },
              select: { role: true },
            });
            return membership?.role ?? null;
          },
          findMember: async (workspaceId, userId) => {
            const membership = await tx.workspaceMember.findUnique({
              where: { workspaceId_userId: { workspaceId, userId } },
              select: { userId: true, role: true },
            });
            return membership;
          },
          countOwners: (workspaceId) =>
            tx.workspaceMember.count({
              where: { workspaceId, role: "OWNER" },
            }),
          updateRole: async (workspaceId, userId, role) => {
            await tx.workspaceMember.update({
              where: { workspaceId_userId: { workspaceId, userId } },
              data: { role },
            });
          },
          removeMember: async (workspaceId, userId) => {
            await tx.workspaceMember.delete({
              where: { workspaceId_userId: { workspaceId, userId } },
            });
          },
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
};
