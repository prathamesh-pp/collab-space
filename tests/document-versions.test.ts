import assert from "node:assert/strict";
import test from "node:test";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { encodeStateAsUpdate } from "yjs";
import { collaborationSchema, COLLABORATION_FRAGMENT } from "../src/collaboration/tiptap-schema";
import {
  createDocumentVersion,
  getDocumentVersionContent,
  listDocumentVersions,
  restoreDocumentVersion,
  type DocumentVersionRepository,
} from "../src/lib/document-versions";

const content = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }],
});

function yState(text: string) {
  const document = prosemirrorJSONToYDoc(collaborationSchema, content(text), COLLABORATION_FRAGMENT);
  const state = encodeStateAsUpdate(document);
  document.destroy();
  return state;
}

function createMemoryRepository() {
  const documents = new Map<string, { workspaceId: string; content: unknown; contentRevision: number; yState: Uint8Array | null }>([
    ["doc-1", { workspaceId: "space-1", content: content("stale JSON"), contentRevision: 2, yState: yState("current") }],
    ["doc-2", { workspaceId: "space-1", content: content("other document"), contentRevision: 1, yState: null }],
  ]);
  const roles = new Map([["user-1", "OWNER"], ["editor", "EDITOR"], ["commenter", "COMMENTER"], ["viewer", "VIEWER"]]);
  const versions: { id: string; documentId: string; userId: string; label: string; content: unknown; yState: Uint8Array | null; createdAt: Date; user: { name: string } }[] = [
    { id: "legacy-yjs", documentId: "doc-1", userId: "user-1", label: "Legacy binary snapshot", content: null, yState: new Uint8Array([9, 8, 7]), createdAt: new Date(0), user: { name: "Owner" } },
  ];
  let id = 0;
  const repository: DocumentVersionRepository = {
    async findDocument(documentId) {
      const document = documents.get(documentId);
      return document ? { workspaceId: document.workspaceId, content: document.content, contentRevision: document.contentRevision, yState: document.yState } : null;
    },
    async findMembershipRole(workspaceId, userId) {
      return workspaceId === "space-1" ? roles.get(userId) ?? null : null;
    },
    async listVersions(documentId) {
      return versions.filter((version) => version.documentId === documentId && version.content !== null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 100)
        .map(({ id: versionId, label, createdAt, user }) => ({ id: versionId, label, createdAt, user }));
    },
    async createVersion(input) {
      const version = { id: `version-${++id}`, ...input, yState: null, createdAt: new Date(id), user: { name: input.userId } };
      versions.push(version);
      const { id: versionId, label, createdAt, user } = version;
      return { id: versionId, label, createdAt, user };
    },
    async findVersion(documentId, versionId) {
      const version = versions.find((item) => item.id === versionId && item.documentId === documentId);
      return version ? { content: version.content } : null;
    },
    async restoreAtomically({ documentId, userId, content: restoredContent }) {
      const document = documents.get(documentId);
      if (!document) return null;
      const expectedRevision = document.contentRevision;
      const before = getDocumentVersionContent(document);
      // Model a concurrent write between the transaction read and compare-and-set.
      if (concurrentEdit) {
        concurrentEdit = false;
        document.content = content("concurrent edit");
        document.contentRevision += 1;
        document.yState = null;
      }
      if (document.contentRevision !== expectedRevision) return null;
      if (before !== null) {
        versions.push({
          id: `version-${++id}`, documentId, userId, label: "Before restore", content: before,
          yState: null, createdAt: new Date(id), user: { name: userId },
        });
      }
      document.content = restoredContent;
      document.contentRevision += 1;
      document.yState = null;
      return document.contentRevision;
    },
  };
  let concurrentEdit = false;
  return {
    repository,
    documents,
    versions,
    setConcurrentEdit() { concurrentEdit = true; },
  };
}

test("creates and lists a labeled JSON snapshot while preserving legacy Yjs snapshots", async () => {
  const memory = createMemoryRepository();
  const beforeYState = new Uint8Array(memory.documents.get("doc-1")!.yState!);
  const created = await createDocumentVersion(memory.repository, "doc-1", "user-1", "Before review");
  assert.equal(created.status, 201);
  const version = (created.body.version as { id: string });
  assert.equal(memory.versions.at(-1)?.label, "Before review");
  assert.deepEqual(memory.versions.at(-1)?.content, content("current"), "the snapshot must use persisted Yjs content instead of stale JSON");
  assert.equal(memory.versions.at(-1)?.yState, null);
  assert.deepEqual(memory.documents.get("doc-1")?.yState, beforeYState);

  const listed = await listDocumentVersions(memory.repository, "doc-1", "user-1");
  assert.equal(listed.status, 200);
  const rows = listed.body.versions as { id: string }[];
  assert.deepEqual(rows.map((row) => row.id), [version.id]);
  assert.deepEqual(memory.versions[0].yState, new Uint8Array([9, 8, 7]));
});

test("restores an earlier snapshot, preserves the pre-restore JSON, and increments revision", async () => {
  const memory = createMemoryRepository();
  const snapshot = await createDocumentVersion(memory.repository, "doc-1", "user-1", "Original");
  memory.documents.get("doc-1")!.content = content("edited later");
  memory.documents.get("doc-1")!.contentRevision += 1;
  memory.documents.get("doc-1")!.yState = null;

  const result = await restoreDocumentVersion(
    memory.repository, "doc-1", (snapshot.body.version as { id: string }).id, "user-1",
  );
  assert.deepEqual(result, { status: 200, body: { ok: true, contentRevision: 4 } });
  assert.deepEqual(memory.documents.get("doc-1")?.content, content("current"));
  assert.equal(memory.documents.get("doc-1")?.yState, null);
  assert.equal(memory.versions.at(-1)?.label, "Before restore");
  assert.deepEqual(memory.versions.at(-1)?.content, content("edited later"));
  // Existing binary snapshots remain intact when the active document switches back to JSON.
  assert.deepEqual(memory.versions[0].yState, new Uint8Array([9, 8, 7]));
});

test("viewers and commenters cannot restore snapshots", async () => {
  const memory = createMemoryRepository();
  const snapshot = await createDocumentVersion(memory.repository, "doc-1", "user-1", "Saved");
  const versionId = (snapshot.body.version as { id: string }).id;
  for (const userId of ["viewer", "commenter"]) {
    const result = await restoreDocumentVersion(memory.repository, "doc-1", versionId, userId);
    assert.equal(result.status, 403);
  }
});

test("cannot restore a snapshot belonging to another document", async () => {
  const memory = createMemoryRepository();
  const snapshot = await createDocumentVersion(memory.repository, "doc-2", "user-1", "Other doc");
  const result = await restoreDocumentVersion(
    memory.repository, "doc-1", (snapshot.body.version as { id: string }).id, "user-1",
  );
  assert.equal(result.status, 404);
});

test("rejects malformed snapshots and refuses to snapshot malformed document content", async () => {
  const memory = createMemoryRepository();
  memory.versions.push({
    id: "malformed", documentId: "doc-1", userId: "user-1", label: "Broken",
    content: { type: "doc", content: [{ type: "script" }] }, yState: null,
    createdAt: new Date(), user: { name: "Owner" },
  });
  assert.equal((await restoreDocumentVersion(memory.repository, "doc-1", "malformed", "user-1")).status, 409);

  memory.documents.get("doc-1")!.content = { type: "doc", content: [{ type: "script" }] };
  memory.documents.get("doc-1")!.yState = null;
  assert.equal((await createDocumentVersion(memory.repository, "doc-1", "user-1", "Bad source")).status, 409);

  memory.documents.get("doc-1")!.content = content("valid but stale JSON");
  memory.documents.get("doc-1")!.yState = new Uint8Array([1, 2, 3]);
  assert.equal((await createDocumentVersion(memory.repository, "doc-1", "user-1", "Bad Yjs state")).status, 409);
});

test("version writes fail closed during live collaboration while authorization remains enforced", async () => {
  const memory = createMemoryRepository();
  const versionCount = memory.versions.length;
  const snapshot = await createDocumentVersion(memory.repository, "doc-1", "user-1", "Paused", false);
  assert.equal(snapshot.status, 409);
  assert.equal(memory.versions.length, versionCount);

  const restore = await restoreDocumentVersion(memory.repository, "doc-1", "legacy-yjs", "user-1", false);
  assert.equal(restore.status, 409);
  assert.equal(memory.versions.length, versionCount);

  const deniedViewer = await createDocumentVersion(memory.repository, "doc-1", "viewer", "Denied", false);
  assert.equal(deniedViewer.status, 403, "role authorization must run before the collaboration-state response");
});

test("returns 409 and creates no misleading pre-restore snapshot after a concurrent edit", async () => {
  const memory = createMemoryRepository();
  const snapshot = await createDocumentVersion(memory.repository, "doc-1", "user-1", "Saved");
  const beforeCount = memory.versions.length;
  memory.setConcurrentEdit();
  const result = await restoreDocumentVersion(
    memory.repository, "doc-1", (snapshot.body.version as { id: string }).id, "user-1",
  );
  assert.equal(result.status, 409);
  assert.equal(memory.versions.length, beforeCount);
  assert.deepEqual(memory.documents.get("doc-1")?.content, content("concurrent edit"));
});

test("reports missing documents and versions without changing data", async () => {
  const memory = createMemoryRepository();
  assert.equal((await listDocumentVersions(memory.repository, "missing", "user-1")).status, 404);
  assert.equal((await createDocumentVersion(memory.repository, "missing", "user-1", "No doc")).status, 404);
  assert.equal((await restoreDocumentVersion(memory.repository, "doc-1", "missing", "user-1")).status, 404);
});
