import "server-only";

import { prisma } from "@/lib/db";
import type { CommentRepository } from "@/lib/comments-core";

export const commentRepository: CommentRepository = {
  findDocumentWorkspace: (documentId) =>
    prisma.document.findUnique({
      where: { id: documentId },
      select: { workspaceId: true },
    }),
  findMembershipRole: async (workspaceId, userId) => {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  },
  listComments: (documentId) =>
    prisma.comment
      .findMany({
        where: { documentId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          userId: true,
          text: true,
          resolvedAt: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      })
      .then((comments) => comments.reverse()),
  createComment: (documentId, userId, text) =>
    prisma.comment.create({
      data: { documentId, userId, text },
      select: {
        id: true,
        userId: true,
        text: true,
        resolvedAt: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
  findComment: async (commentId) => {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        documentId: true,
        userId: true,
      },
    });
    if (!comment) return null;
    return {
      id: comment.id,
      documentId: comment.documentId,
      userId: comment.userId,
    };
  },
  setCommentResolved: (commentId, resolved) =>
    prisma.comment.update({
      where: { id: commentId },
      data: { resolvedAt: resolved ? new Date() : null },
      select: { id: true, resolvedAt: true },
    }),
  deleteComment: async (commentId) => {
    await prisma.comment.delete({ where: { id: commentId } });
  },
};
