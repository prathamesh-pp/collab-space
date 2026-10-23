import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { findSession, SESSION_COOKIE } from "@/lib/session-core";
export { canComment, canEdit } from "@/lib/permissions";

export async function getCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? findSession(token) : null;
}

export async function getWorkspaceMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}

