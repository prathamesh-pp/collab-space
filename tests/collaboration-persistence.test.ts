import assert from "node:assert/strict";
import test from "node:test";
import { Document, Hocuspocus } from "@hocuspocus/server";
import type {
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from "@hocuspocus/server";
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import {
  applyUpdate,
  encodeStateAsUpdate,
  Doc,
} from "yjs";
import {
  collaborationSchema,
  COLLABORATION_FRAGMENT,
} from "../src/collaboration/tiptap-schema";
import {
  CollaborationPersistenceError,
  CollaborationPersistenceHealth,
  createCollaborationPersistenceHooks,
  InvalidDocumentContentError,
  InvalidYStateError,
  loadOrInitializeYDoc,
  type CollaborationPersistenceRepository,
  type PersistedDocument,
} from "../src/collaboration/persistence";

const documentId = "c" + "x".repeat(24);
const content = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Existing JSON content" }],
    },
  ],
};

function createRepository(
  initial: PersistedDocument | null,
  onInitialize: (revision: number, state: Uint8Array) => boolean = () => true,
) {
  let record = initial;
  let initializeCalls = 0;
  let savedState: Uint8Array | null = null;
  const repository: CollaborationPersistenceRepository = {
    async findDocument() {
      return record;
    },
    async initializeYStateIfNull(_id, revision, state) {
      initializeCalls += 1;
      const won = onInitialize(revision, state);
      if (won && record) record = { ...record, yState: state };
      return won;
    },
    async saveYState(_id, state) {
      savedState = state;
    },
  };

  return {
    repository,
    getRecord: () => record,
    getInitializeCalls: () => initializeCalls,
    getSavedState: () => savedState,
  };
}

test("binary Yjs state is loaded without reseeding", async () => {
  const originalDoc = prosemirrorJSONToYDoc(
    collaborationSchema,
    content,
    COLLABORATION_FRAGMENT,
  );
  const binaryState = encodeStateAsUpdate(originalDoc);
  const mocked = createRepository({
    content: null,
    contentRevision: 0,
    yState: binaryState,
  });

  const loaded = await loadOrInitializeYDoc(documentId, mocked.repository);

  assert.deepEqual(
    yDocToProsemirrorJSON(loaded, COLLABORATION_FRAGMENT),
    content,
  );
  assert.equal(mocked.getInitializeCalls(), 0);
});

test("validated TipTap JSON is seeded as binary Yjs state", async () => {
  const mocked = createRepository({ content, contentRevision: 4, yState: null });

  const seeded = await loadOrInitializeYDoc(documentId, mocked.repository);

  assert.deepEqual(
    yDocToProsemirrorJSON(seeded, COLLABORATION_FRAGMENT),
    content,
  );
  assert.ok(seeded.getXmlFragment(COLLABORATION_FRAGMENT).length > 0);
  assert.equal(seeded.getXmlFragment("prosemirror").length, 0);
  assert.ok(mocked.getRecord()?.yState instanceof Uint8Array);
  assert.notDeepEqual(mocked.getRecord()?.yState, content);
  const restored = new Doc();
  applyUpdate(restored, mocked.getRecord()!.yState!);
  assert.deepEqual(
    yDocToProsemirrorJSON(restored, COLLABORATION_FRAGMENT),
    content,
  );
});

test("malformed binary Yjs state fails without JSON fallback or initialization", async () => {
  const mocked = createRepository({
    content,
    contentRevision: 4,
    yState: new Uint8Array([0xff]),
  });

  await assert.rejects(
    loadOrInitializeYDoc(documentId, mocked.repository),
    InvalidYStateError,
  );
  assert.equal(mocked.getInitializeCalls(), 0);
  assert.deepEqual(mocked.getRecord()?.yState, new Uint8Array([0xff]));
});

test("invalid existing JSON is rejected without writing Yjs state", async () => {
  const mocked = createRepository({
    content: { type: "doc", content: [{ type: "unsupportedNode" }] },
    contentRevision: 0,
    yState: null,
  });

  await assert.rejects(
    loadOrInitializeYDoc(documentId, mocked.repository),
    InvalidDocumentContentError,
  );
  assert.equal(mocked.getInitializeCalls(), 0);
  assert.equal(mocked.getRecord()?.yState, null);
});

test("concurrent initializers use compare-and-set and load the winning state", async () => {
  const state: { value: Uint8Array | null } = { value: null };
  let initialReads = 0;
  let releaseInitialReads!: () => void;
  const initialReadBarrier = new Promise<void>((resolve) => {
    releaseInitialReads = resolve;
  });
  let compareAndSetCalls = 0;
  const repository: CollaborationPersistenceRepository = {
    async findDocument() {
      if (initialReads < 2) {
        initialReads += 1;
        if (initialReads === 2) releaseInitialReads();
        await initialReadBarrier;
        return { content, contentRevision: 0, yState: null };
      }
      return { content, contentRevision: 0, yState: state.value };
    },
    async initializeYStateIfNull(_id, _revision, candidate) {
      compareAndSetCalls += 1;
      if (state.value !== null) return false;
      state.value = candidate;
      return true;
    },
    async saveYState() {},
  };

  const [first, second] = await Promise.all([
    loadOrInitializeYDoc(documentId, repository),
    loadOrInitializeYDoc(documentId, repository),
  ]);

  assert.equal(compareAndSetCalls, 2);
  assert.deepEqual(
    yDocToProsemirrorJSON(first, COLLABORATION_FRAGMENT),
    content,
  );
  assert.deepEqual(
    yDocToProsemirrorJSON(second, COLLABORATION_FRAGMENT),
    content,
  );
  assert.ok(state.value instanceof Uint8Array);
});

test("JSON content revision changes are retried before the seed is committed", async () => {
  const latestContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Newer JSON content" }],
      },
    ],
  };
  let reads = 0;
  const attemptedRevisions: number[] = [];
  let savedState: Uint8Array | null = null;
  const repository: CollaborationPersistenceRepository = {
    async findDocument() {
      reads += 1;
      return reads === 1
        ? { content, contentRevision: 0, yState: null }
        : { content: latestContent, contentRevision: 1, yState: savedState };
    },
    async initializeYStateIfNull(_id, revision, state) {
      attemptedRevisions.push(revision);
      if (revision === 0) return false;
      savedState = state;
      return true;
    },
    async saveYState() {},
  };

  const seeded = await loadOrInitializeYDoc(documentId, repository);

  assert.deepEqual(attemptedRevisions, [0, 1]);
  assert.deepEqual(
    yDocToProsemirrorJSON(seeded, COLLABORATION_FRAGMENT),
    latestContent,
  );
});

test("Hocuspocus persistence hooks store only an encoded Yjs update", async () => {
  const mocked = createRepository({
    content: null,
    contentRevision: 0,
    yState: null,
  });
  const hooks = createCollaborationPersistenceHooks(mocked.repository);
  const document = new Document(documentId);
  const source = prosemirrorJSONToYDoc(
    collaborationSchema,
    content,
    COLLABORATION_FRAGMENT,
  );
  applyUpdate(document, encodeStateAsUpdate(source));

  await hooks.onStoreDocument?.({
    document,
    documentName: documentId,
    clientsCount: 0,
    context: {},
    instance: new Hocuspocus(),
    requestHeaders: {},
    requestParameters: new URLSearchParams(),
    socketId: "test",
  });

  const storedState = mocked.getSavedState();
  assert.ok(storedState instanceof Uint8Array);
  assert.notDeepEqual(storedState, content);
  const restored = new Doc();
  applyUpdate(restored, storedState);
  assert.deepEqual(
    yDocToProsemirrorJSON(restored, COLLABORATION_FRAGMENT),
    content,
  );
  document.destroy();
  source.destroy();
  restored.destroy();
});

test("persistence hooks reject with sanitized errors", async () => {
  const databaseError = new Error(
    "database password and internal host must not be exposed",
  );
  const repository: CollaborationPersistenceRepository = {
    async findDocument() {
      throw databaseError;
    },
    async initializeYStateIfNull() {
      throw databaseError;
    },
    async saveYState() {
      throw databaseError;
    },
  };
  const health = new CollaborationPersistenceHealth();
  const monitoredHooks = createCollaborationPersistenceHooks(repository, health);
  const storeDocument = new Document(documentId);
  const instance = new Hocuspocus();
  const loadDocument = monitoredHooks.onLoadDocument;
  const storeDocumentHook = monitoredHooks.onStoreDocument;
  assert.ok(loadDocument);
  assert.ok(storeDocumentHook);
  const loadPayload: onLoadDocumentPayload = {
    context: {},
    documentName: documentId,
    document: storeDocument,
    instance,
    requestHeaders: {},
    requestParameters: new URLSearchParams(),
    socketId: "test",
    connectionConfig: { isAuthenticated: true, readOnly: false },
  };

  await assert.rejects(
    loadDocument(loadPayload),
    (error: unknown) => {
      assert.ok(error instanceof CollaborationPersistenceError);
      assert.equal(error.message.includes("password"), false);
      assert.equal(error.message.includes("host"), false);
      assert.equal("cause" in error, false);
      return true;
    },
  );
  assert.equal(health.getLastFailure()?.operation, "load");
  const storePayload: onStoreDocumentPayload = {
    document: storeDocument,
    documentName: documentId,
    clientsCount: 0,
    context: {},
    instance,
    requestHeaders: {},
    requestParameters: new URLSearchParams(),
    socketId: "test",
  };
  await assert.rejects(
    storeDocumentHook(storePayload),
    (error: unknown) => {
      assert.ok(error instanceof CollaborationPersistenceError);
      assert.equal(error.message.includes("password"), false);
      assert.equal(error.message.includes("host"), false);
      assert.equal("cause" in error, false);
      return true;
    },
  );
  assert.equal(health.getLastFailure()?.operation, "store");
  assert.doesNotMatch(
    JSON.stringify(health.getLastFailure()),
    /password|host|database/i,
  );
  storeDocument.destroy();
  instance.configuration.extensions = [];
});
