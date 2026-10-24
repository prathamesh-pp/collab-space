import { z } from "zod";
import { canComment } from "@/lib/permissions";

const createCommentSchema = z.object({
  text: z.string().trim().min(1).max(2000),
}).strict();

const resolveCommentSchema = z.object({
  resolved: z.boolean(),
}).strict();

export type CommentRecord = {
  id: string;
  userId: string;
  text: string;
  resolvedAt: Date | null;
  createdAt: Date;
  user: { name: string };
};

export type CommentRepository = {
  findDocumentWorkspace(documentId: string): Promise<{ workspaceId: string } | null>;
  findMembershipRole(workspaceId: string, userId: string): Promise<string | null>;
  listComments(documentId: string): Promise<CommentRecord[]>;
  createComment(documentId: string, userId: string, text: string): Promise<CommentRecord>;
  findComment(commentId: string): Promise<{
    id: string;
    documentId: string;
    userId: string;
  } | null>;
  setCommentResolved(commentId: string, resolved: boolean): Promise<{
    id: string;
    resolvedAt: Date | null;
  }>;
  deleteComment(commentId: string): Promise<void>;
};

export type CommentResult = {
  status: number;
  body: Record<string, unknown>;
};

function failure(status: number, error: string): CommentResult {
  return { status, body: { error } };
}

async function authorizeDocument(
  repository: CommentRepository,
  documentId: string,
  userId: string,
) {
  const document = await repository.findDocumentWorkspace(documentId);
  if (!document) {
    return { ok: false as const, error: failure(404, "Document not found.") };
  }

  const role = await repository.findMembershipRole(document.workspaceId, userId);
  if (!role) {
    return { ok: false as const, error: failure(404, "Document not found.") };
  }
  return { ok: true as const, role };
}

async function authorizeComment(
  repository: CommentRepository,
  documentId: string,
  commentId: string,
  userId: string,
) {
  const comment = await repository.findComment(commentId);
  if (!comment) {
    return { ok: false as const, error: failure(404, "Comment not found.") };
  }
  if (comment.documentId !== documentId) {
    return { ok: false as const, error: failure(404, "Comment not found.") };
  }

  const access = await authorizeDocument(repository, documentId, userId);
  if (!access.ok) return access;
  return { ok: true as const, comment, role: access.role };
}

function publicComment(comment: CommentRecord, userId: string) {
  return {
    id: comment.id,
    text: comment.text,
    resolvedAt: comment.resolvedAt,
    createdAt: comment.createdAt,
    author: comment.user.name,
    isOwnComment: comment.userId === userId,
  };
}

export async function listDocumentComments(
  repository: CommentRepository,
  documentId: string,
  userId: string,
): Promise<CommentResult> {
  const access = await authorizeDocument(repository, documentId, userId);
  if (!access.ok) return access.error;

  const comments = await repository.listComments(documentId);
  return {
    status: 200,
    body: { comments: comments.map((comment) => publicComment(comment, userId)) },
  };
}

export async function createDocumentComment(
  repository: CommentRepository,
  documentId: string,
  userId: string,
  body: unknown,
): Promise<CommentResult> {
  const access = await authorizeDocument(repository, documentId, userId);
  if (!access.ok) return access.error;
  if (!canComment(access.role)) {
    return failure(403, "You do not have permission to comment on this document.");
  }

  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) return failure(400, "Comment must contain 1 to 2000 characters.");

  const comment = await repository.createComment(
    documentId,
    userId,
    parsed.data.text,
  );
  return { status: 201, body: { comment: publicComment(comment, userId) } };
}

export async function setDocumentCommentResolved(
  repository: CommentRepository,
  documentId: string,
  commentId: string,
  userId: string,
  body: unknown,
): Promise<CommentResult> {
  const access = await authorizeComment(repository, documentId, commentId, userId);
  if (!access.ok) return access.error;
  if (!canComment(access.role)) {
    return failure(403, "You do not have permission to resolve comments.");
  }

  const parsed = resolveCommentSchema.safeParse(body);
  if (!parsed.success) return failure(400, "Provide a valid resolved value.");

  const comment = await repository.setCommentResolved(
    commentId,
    parsed.data.resolved,
  );
  return { status: 200, body: { comment } };
}

export async function deleteDocumentComment(
  repository: CommentRepository,
  documentId: string,
  commentId: string,
  userId: string,
): Promise<CommentResult> {
  const access = await authorizeComment(repository, documentId, commentId, userId);
  if (!access.ok) return access.error;
  if (access.comment.userId !== userId) {
    return failure(403, "You can only delete your own comments.");
  }

  await repository.deleteComment(commentId);
  return { status: 200, body: { ok: true } };
}
