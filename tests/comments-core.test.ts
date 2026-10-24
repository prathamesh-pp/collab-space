import assert from "node:assert/strict";
import test from "node:test";
import {
  createDocumentComment,
  deleteDocumentComment,
  listDocumentComments,
  setDocumentCommentResolved,
  type CommentRecord,
  type CommentRepository,
} from "../src/lib/comments-core";

const timestamp = new Date("2026-10-24T10:00:00.000Z");

function record(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: "comment-1",
    userId: "author-1",
    text: "A useful note",
    resolvedAt: null,
    createdAt: timestamp,
    user: { name: "Ada" },
    ...overrides,
  };
}

class MemoryComments implements CommentRepository {
  role: string | null = "EDITOR";
  documentExists = true;
  rows = [record()];
  lastCreated: { documentId: string; userId: string; text: string } | null = null;
  lastResolved: boolean | null = null;
  deleted: string[] = [];

  async findDocumentWorkspace(documentId: string) {
    return this.documentExists && documentId === "document-1"
      ? { workspaceId: "workspace-1" }
      : null;
  }

  async findMembershipRole(workspaceId: string, userId: string) {
    return workspaceId === "workspace-1" && userId !== "outsider"
      ? this.role
      : null;
  }

  async listComments() {
    return this.rows;
  }

  async createComment(documentId: string, userId: string, text: string) {
    this.lastCreated = { documentId, userId, text };
    const created = record({ id: "comment-new", userId, text });
    this.rows.push(created);
    return created;
  }

  async findComment(commentId: string) {
    const comment = this.rows.find((row) => row.id === commentId);
    return comment
      ? {
          id: comment.id,
          documentId: "document-1",
          userId: comment.userId,
        }
      : null;
  }

  async setCommentResolved(commentId: string, resolved: boolean) {
    this.lastResolved = resolved;
    const comment = this.rows.find((row) => row.id === commentId);
    assert.ok(comment);
    comment.resolvedAt = resolved ? timestamp : null;
    return { id: commentId, resolvedAt: comment.resolvedAt };
  }

  async deleteComment(commentId: string) {
    this.deleted.push(commentId);
    this.rows = this.rows.filter((comment) => comment.id !== commentId);
  }
}

test("members can list comments, including viewers, without exposing author IDs", async () => {
  const repository = new MemoryComments();
  repository.role = "VIEWER";

  const result = await listDocumentComments(repository, "document-1", "viewer-1");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    comments: [{
      id: "comment-1",
      text: "A useful note",
      resolvedAt: null,
      createdAt: timestamp,
      author: "Ada",
      isOwnComment: false,
    }],
  });
});

test("nonmembers and missing documents cannot list comments", async () => {
  const repository = new MemoryComments();

  assert.equal(
    (await listDocumentComments(repository, "document-1", "outsider")).status,
    404,
  );
  repository.documentExists = false;
  assert.deepEqual(
    await listDocumentComments(repository, "missing", "editor-1"),
    { status: 404, body: { error: "Document not found." } },
  );
});

test("owners, editors, and commenters can create trimmed comments", async () => {
  const repository = new MemoryComments();
  for (const role of ["OWNER", "EDITOR", "COMMENTER"]) {
    repository.role = role;
    const result = await createDocumentComment(
      repository,
      "document-1",
      "writer-1",
      { text: "  Please review this.  " },
    );
    assert.equal(result.status, 201);
  }

  assert.deepEqual(repository.lastCreated, {
    documentId: "document-1",
    userId: "writer-1",
    text: "Please review this.",
  });
});

test("viewers cannot create comments and comment text is bounded and strict", async () => {
  const repository = new MemoryComments();
  repository.role = "VIEWER";
  assert.equal(
    (await createDocumentComment(repository, "document-1", "viewer-1", {
      text: "hello",
    })).status,
    403,
  );

  repository.role = "EDITOR";
  for (const body of [
    { text: "   " },
    { text: "x".repeat(2001) },
    { text: "valid", extra: true },
    null,
  ]) {
    assert.equal(
      (await createDocumentComment(repository, "document-1", "editor-1", body)).status,
      400,
    );
  }
  assert.equal(repository.lastCreated, null);
});

test("commenters can resolve and unresolve comments while viewers cannot", async () => {
  const repository = new MemoryComments();
  repository.role = "COMMENTER";

  assert.equal(
    (await setDocumentCommentResolved(
      repository,
      "document-1",
      "comment-1",
      "commenter-1",
      { resolved: true },
    )).status,
    200,
  );
  assert.equal(repository.lastResolved, true);

  assert.equal(
    (await setDocumentCommentResolved(
      repository,
      "document-1",
      "comment-1",
      "commenter-1",
      { resolved: false },
    )).status,
    200,
  );
  assert.equal(repository.lastResolved, false);

  repository.role = "VIEWER";
  assert.equal(
    (await setDocumentCommentResolved(
      repository,
      "document-1",
      "comment-1",
      "viewer-1",
      { resolved: true },
    )).status,
    403,
  );
  repository.role = "COMMENTER";
  assert.equal(
    (await setDocumentCommentResolved(
      repository,
      "document-1",
      "comment-1",
      "commenter-1",
      { resolved: "true" },
    )).status,
    400,
  );
});

test("users can delete only their own comments and membership is required", async () => {
  const repository = new MemoryComments();

  assert.equal(
    (
      await deleteDocumentComment(
        repository,
        "another-document",
        "comment-1",
        "author-1",
      )
    ).status,
    404,
  );
  assert.deepEqual(repository.deleted, []);

  assert.equal(
    (await deleteDocumentComment(repository, "document-1", "comment-1", "other-user")).status,
    403,
  );
  assert.deepEqual(repository.deleted, []);

  assert.equal(
    (await deleteDocumentComment(repository, "document-1", "comment-1", "author-1")).status,
    200,
  );
  assert.deepEqual(repository.deleted, ["comment-1"]);

  assert.equal(
    (await deleteDocumentComment(repository, "document-1", "missing", "author-1")).status,
    404,
  );
  repository.role = null;
  assert.equal(
    (await deleteDocumentComment(repository, "document-1", "comment-1", "author-1")).status,
    404,
  );
});
