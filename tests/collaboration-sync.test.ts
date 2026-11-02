import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { Server } from "@hocuspocus/server";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import { Doc, XmlElement, XmlText } from "yjs";
import { COLLABORATION_FRAGMENT } from "../src/collaboration/tiptap-schema";
import { createCollaborationPersistenceHooks, type CollaborationPersistenceRepository, type PersistedDocument } from "../src/collaboration/persistence";
import { createCollaborationServerHooks } from "../src/collaboration/server-hooks";

const documentId = "c" + "x".repeat(24);
const initialContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Persisted before collaboration" }] }],
};
const origin = "http://localhost:3000";

const WebSocketConstructor = createRequire(import.meta.url)("ws") as new (
  address: string | URL,
  options?: { headers: Record<string, string> },
) => object;

class TestWebSocket extends WebSocketConstructor {
  constructor(address: string | URL) {
    super(address, { headers: { Origin: origin } });
  }
}

function createRepository() {
  let record: PersistedDocument = {
    content: initialContent,
    contentRevision: 1,
    yState: null,
  };
  const repository: CollaborationPersistenceRepository = {
    async findDocument() { return record; },
    async initializeYStateIfNull(_id, revision, state) {
      if (record.yState || revision !== record.contentRevision) return false;
      record = { ...record, yState: state };
      return true;
    },
    async saveYState(_id, state) { record = { ...record, yState: state }; },
  };
  return { repository, getRecord: () => record };
}

async function waitForSync(provider: HocuspocusProvider) {
  if (provider.synced) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for Yjs sync.")), 3_000);
    provider.on("synced", ({ state }: { state: boolean }) => {
      if (!state) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

function createClient(url: string, token: string) {
  const document = new Doc();
  const websocket = new HocuspocusProviderWebsocket({
    url,
    WebSocketPolyfill: TestWebSocket,
    maxAttempts: 1,
  });
  const connectionFailures: unknown[] = [];
  const connect = websocket.connect.bind(websocket);
  websocket.connect = () => {
    const attempt = connect();
    // Observing the attempt prevents rejected retry promises after revocation
    // from becoming detached, while the assertions still verify socket outcomes.
    void attempt.catch((error: unknown) => connectionFailures.push(error));
    return attempt;
  };
  const provider = new HocuspocusProvider({
    name: documentId,
    document,
    websocketProvider: websocket,
    token,
    onAuthenticationFailed: () => websocket.disconnect(),
  });
  provider.attach();
  return {
    document,
    provider,
    websocket,
    connectionFailures,
    destroy() {
      // Stop the shared socket before detaching the provider so its close event
      // cannot schedule a reconnect while test teardown is underway.
      websocket.disconnect();
      provider.destroy();
      websocket.destroy();
      document.destroy();
    },
  };
}

function waitForSocketClose(socket: NonNullable<ReturnType<typeof createClient>["websocket"]["webSocket"]>) {
  if (socket.readyState === 3) return Promise.resolve();
  return new Promise<void>((resolve) => {
    socket.addEventListener("close", () => resolve(), { once: true });
  });
}

async function destroyServer(server: Server) {
  const deadline = Date.now() + 2_000;
  while (server.hocuspocus.getDocumentsCount() > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (server.hocuspocus.getDocumentsCount() > 0) {
    server.hocuspocus.closeConnections();
    for (const document of server.hocuspocus.documents.values()) {
      await server.hocuspocus.unloadDocument(document);
    }
  }
  await server.destroy();
}

async function closeClient(client: ReturnType<typeof createClient>) {
  const socket = client.websocket.webSocket;
  const closed = socket ? waitForSocketClose(socket) : Promise.resolve();
  client.destroy();
  await closed;
}

test("two authorized clients synchronize edits and reconnect from persisted Yjs state", async (t) => {
  const storage = createRepository();
  const hooks = createCollaborationPersistenceHooks(storage.repository);
  const server = new Server({
    address: "127.0.0.1",
    port: 0,
    quiet: true,
    stopOnSignals: false,
    debounce: 0,
    unloadImmediately: true,
    onAuthenticate: async ({ documentName, token, requestHeaders, connectionConfig }) => {
      if (documentName !== documentId || token !== "valid-ticket" || requestHeaders.origin !== origin) {
        throw new Error("Collaboration authentication denied.");
      }
      connectionConfig.readOnly = false;
      return { userId: "editor", userName: "Grace Hopper", role: "EDITOR" };
    },
    ...hooks,
  });
  await server.listen();
  const clients: ReturnType<typeof createClient>[] = [];
  t.after(async () => {
    try {
      await Promise.all(clients.map(closeClient));
    } finally {
      await destroyServer(server);
    }
  });

  const first = createClient(server.webSocketURL, "valid-ticket");
  const second = createClient(server.webSocketURL, "valid-ticket");
  clients.push(first, second);
  await Promise.all([waitForSync(first.provider), waitForSync(second.provider)]);
  assert.deepEqual(
    yDocToProsemirrorJSON(first.document, COLLABORATION_FRAGMENT),
    initialContent,
  );

  const paragraph = new XmlElement("paragraph");
  const text = new XmlText();
  text.insert(0, "Live update");
  paragraph.insert(0, [text]);
  first.document.getXmlFragment(COLLABORATION_FRAGMENT).insert(1, [paragraph]);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for the second client update.")), 3_000);
    const check = () => {
      const json = yDocToProsemirrorJSON(second.document, COLLABORATION_FRAGMENT);
      const text = JSON.stringify(json);
      if (text.includes("Live update")) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
  assert.ok(storage.getRecord().yState instanceof Uint8Array);

  await closeClient(first);
  await closeClient(second);
  const reconnected = createClient(server.webSocketURL, "valid-ticket");
  clients.push(reconnected);
  await waitForSync(reconnected.provider);
  assert.deepEqual(
    yDocToProsemirrorJSON(reconnected.document, COLLABORATION_FRAGMENT),
    {
      type: "doc",
      content: [
        ...initialContent.content,
        { type: "paragraph", content: [{ type: "text", text: "Live update" }] },
      ],
    },
  );
});

test("session, membership, and role revocation disconnect active clients while peers remain live", async (t) => {
  const storage = createRepository();
  const access = new Map([
    ["session-revoked", { userId: "user-session", sessionActive: true, member: true, role: "EDITOR", ticketUsed: false }],
    ["member-removed", { userId: "user-removed", sessionActive: true, member: true, role: "EDITOR", ticketUsed: false }],
    ["member-demoted", { userId: "user-demoted", sessionActive: true, member: true, role: "EDITOR", ticketUsed: false }],
    ["peer-one", { userId: "user-peer-one", sessionActive: true, member: true, role: "EDITOR", ticketUsed: false }],
    ["peer-two", { userId: "user-peer-two", sessionActive: true, member: true, role: "EDITOR", ticketUsed: false }],
  ]);
  const consumeTicket = async (token: string, requestedDocumentId: string) => {
    const identity = access.get(token);
    if (
      !identity ||
      requestedDocumentId !== documentId ||
      identity.ticketUsed ||
      !identity.sessionActive ||
      !identity.member ||
      (identity.role !== "OWNER" && identity.role !== "EDITOR")
    ) {
      return null;
    }
    identity.ticketUsed = true;
    return {
      documentId,
      userId: identity.userId,
      userName: identity.userId,
      sessionId: token,
      workspaceId: "workspace-1",
      role: identity.role,
    };
  };
  const hooks = createCollaborationServerHooks({
    enabled: "true",
    nodeEnvironment: "development",
    allowedOrigins: new Set([origin]),
    consumeTicket,
    isConnectionAuthorized: async ({ sessionId, userId, documentId: requestedDocumentId }) => {
      const identity = access.get(sessionId);
      return Boolean(
        identity &&
          requestedDocumentId === documentId &&
          identity.userId === userId &&
          identity.sessionActive &&
          identity.member &&
          (identity.role === "OWNER" || identity.role === "EDITOR"),
      );
    },
    authorizationLeaseMs: 1_000,
    persistenceRepository: storage.repository,
  });
  let disconnectCalls = 0;
  const server = new Server({
    address: "127.0.0.1",
    port: 0,
    quiet: true,
    stopOnSignals: false,
    unloadImmediately: true,
    ...hooks,
    onDisconnect: async (payload) => {
      disconnectCalls += 1;
      await hooks.onDisconnect?.(payload);
    },
  });
  await server.listen();

  const revokedBySession = createClient(server.webSocketURL, "session-revoked");
  const removedMember = createClient(server.webSocketURL, "member-removed");
  const demotedMember = createClient(server.webSocketURL, "member-demoted");
  const peerOne = createClient(server.webSocketURL, "peer-one");
  const peerTwo = createClient(server.webSocketURL, "peer-two");
  const clients = [revokedBySession, removedMember, demotedMember, peerOne, peerTwo];
  t.after(async () => {
    try {
      await Promise.all(clients.map(closeClient));
      const deadline = Date.now() + 2_000;
      while (disconnectCalls < clients.length && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(disconnectCalls, clients.length, "each test client should release its authorization lease");
    } finally {
      await destroyServer(server);
    }
  });
  await Promise.all(clients.map((client) => waitForSync(client.provider)));
  const revokedSockets = clients.slice(0, 3).map((client) => {
    const socket = client.websocket.webSocket;
    assert.ok(socket);
    return socket;
  });
  const closeRevokedSockets = revokedSockets.map(waitForSocketClose);
  const unaffectedSockets = clients.slice(3).map((client) => client.websocket.webSocket);

  access.get("session-revoked")!.sessionActive = false;
  access.get("member-removed")!.member = false;
  access.get("member-demoted")!.role = "COMMENTER";

  const closeDeadline = Date.now() + 3_000;
  while (server.hocuspocus.getConnectionsCount() !== 2 && Date.now() < closeDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(server.hocuspocus.getConnectionsCount(), 2, "revoked sockets should be removed from the live document");
  await Promise.all(closeRevokedSockets);
  assert.ok(revokedSockets.every((socket) => socket.readyState === 3));
  // Revoked clients must stop retrying with their now-invalid single-use tickets.
  clients.slice(0, 3).forEach((client) => client.websocket.disconnect());
  assert.ok(unaffectedSockets.every((socket) => socket?.readyState === 1));

  function appendText(client: ReturnType<typeof createClient>, textValue: string) {
    const paragraph = new XmlElement("paragraph");
    const text = new XmlText();
    text.insert(0, textValue);
    paragraph.insert(0, [text]);
    client.document.getXmlFragment(COLLABORATION_FRAGMENT).insert(
      client.document.getXmlFragment(COLLABORATION_FRAGMENT).length,
      [paragraph],
    );
  }

  appendText(revokedBySession, "revoked session write");
  appendText(removedMember, "removed member write");
  appendText(demotedMember, "demoted member write");
  appendText(peerOne, "unaffected peer update");

  const syncDeadline = Date.now() + 3_000;
  while (
    !JSON.stringify(yDocToProsemirrorJSON(peerTwo.document, COLLABORATION_FRAGMENT)).includes("unaffected peer update") &&
    Date.now() < syncDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const unaffectedContent = JSON.stringify(
    yDocToProsemirrorJSON(peerTwo.document, COLLABORATION_FRAGMENT),
  );
  assert.match(unaffectedContent, /unaffected peer update/);
  assert.doesNotMatch(unaffectedContent, /revoked session write|removed member write|demoted member write/);

  const revokedContent = clients.slice(0, 3).map((client) =>
    JSON.stringify(yDocToProsemirrorJSON(client.document, COLLABORATION_FRAGMENT)),
  ).join(" ");
  assert.doesNotMatch(revokedContent, /unaffected peer update/);

  appendText(peerTwo, "unaffected peer remains writable");
  const secondSyncDeadline = Date.now() + 3_000;
  while (
    !JSON.stringify(yDocToProsemirrorJSON(peerOne.document, COLLABORATION_FRAGMENT)).includes("unaffected peer remains writable") &&
    Date.now() < secondSyncDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.match(
    JSON.stringify(yDocToProsemirrorJSON(peerOne.document, COLLABORATION_FRAGMENT)),
    /unaffected peer remains writable/,
  );
});
