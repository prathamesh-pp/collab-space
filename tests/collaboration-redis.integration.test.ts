import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { Server } from "@hocuspocus/server";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import { Doc, XmlElement, XmlText } from "yjs";
import { createCollaborationRedis } from "../src/collaboration/redis-extension";
import { createCollaborationServerHooks } from "../src/collaboration/server-hooks";
import {
  getPresenceColor,
  getRemotePresenceUsers,
} from "../src/collaboration/presence-identity";
import {
  documentContentFromYState,
  type CollaborationPersistenceRepository,
  type PersistedDocument,
} from "../src/collaboration/persistence";
import { COLLABORATION_FRAGMENT } from "../src/collaboration/tiptap-schema";
import {
  requireCollaborationTestDatabaseUrl,
  withSanitizedIntegrationErrors,
} from "./postgres-test-database";

const origin = "http://localhost:3000";
const initialContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Redis integration seed" }] }],
};

function requireLoopbackEndpoint(value: string | undefined, variableName: string, protocols: string[]) {
  if (!value) throw new Error(`${variableName} must point to a dedicated local test service.`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid test-service URL.`);
  }
  if (!protocols.includes(parsed.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new Error(`${variableName} must use a loopback test service; production endpoints are not allowed.`);
  }
  return { value, parsed };
}

const redisConfiguration = requireLoopbackEndpoint(
  process.env.COLLABORATION_TEST_REDIS_URL,
  "COLLABORATION_TEST_REDIS_URL",
  ["redis:", "rediss:"],
);
const databaseValue = process.env.COLLABORATION_TEST_DATABASE_URL;
const databaseConfiguration = databaseValue
  ? { value: requireCollaborationTestDatabaseUrl(databaseValue) }
  : null;

const documentId = `c${randomBytes(12).toString("hex")}`;
const members = new Map([
  ["user-alice", { name: "Alice Example", sessionId: "session-alice", sessionActive: true, role: "EDITOR" }],
  ["user-bob", { name: "Bob Example", sessionId: "session-bob", sessionActive: true, role: "EDITOR" }],
  ["user-carol", { name: "Carol Example", sessionId: "session-carol", sessionActive: true, role: "EDITOR" }],
]);
const tokens = new Map<string, { userId: string; consumed: boolean }>();

const WebSocketConstructor = createRequire(import.meta.url)("ws") as new (
  address: string | URL,
  options?: { headers: Record<string, string> },
) => {
  readyState: number;
  close(): void;
  terminate(): void;
  addEventListener(event: string, listener: () => void, options?: { once?: boolean }): void;
};

class TestWebSocket extends WebSocketConstructor {
  constructor(address: string | URL) {
    super(address, { headers: { Origin: origin } });
  }
}

function issueTicket(userId: string) {
  const token = randomUUID();
  tokens.set(token, { userId, consumed: false });
  return token;
}

function createMemoryRepository(id: string) {
  let record: PersistedDocument = {
    content: initialContent,
    contentRevision: 1,
    yState: null,
  };
  const repository: CollaborationPersistenceRepository = {
    async findDocument(requestedId) {
      return requestedId === id ? record : null;
    },
    async initializeYStateIfNull(requestedId, revision, state) {
      if (requestedId !== id || record.yState || revision !== record.contentRevision) return false;
      record = { ...record, yState: state };
      return true;
    },
    async saveYState(requestedId, state) {
      if (requestedId !== id) throw new Error("Test document not found.");
      record = { ...record, yState: state };
    },
  };
  return {
    repository,
    async readState() { return record.yState; },
    async destroy() {},
  };
}

async function createPostgresRepository(url: string, id: string) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = await withSanitizedIntegrationErrors("Redis collaboration fixture setup", async () =>
    new PrismaClient({ datasourceUrl: url }),
  );
  let userId: string | null = null;
  let workspaceId: string | null = null;
  try {
    await prisma.$connect();
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: `redis-it-${randomUUID()}@example.test`,
          name: "Redis Integration Test",
          passwordHash: "integration-test-only",
        },
      });
      userId = user.id;
      const workspace = await transaction.workspace.create({
        data: { name: "Redis integration fixture", createdById: user.id },
      });
      workspaceId = workspace.id;
      await transaction.document.create({
        data: {
          id,
          workspaceId: workspace.id,
          title: "Redis integration fixture",
          content: initialContent,
          contentRevision: 1,
        },
      });
    });

    const repository: CollaborationPersistenceRepository = {
      async findDocument(requestedId) {
        const document = await prisma.document.findUnique({
          where: { id: requestedId },
          select: { content: true, contentRevision: true, yState: true },
        });
        return document ?? null;
      },
      async initializeYStateIfNull(requestedId, revision, state) {
        const result = await prisma.document.updateMany({
          where: { id: requestedId, contentRevision: revision, yState: null },
          data: { yState: Buffer.from(state) },
        });
        return result.count === 1;
      },
      async saveYState(requestedId, state) {
        const result = await prisma.document.updateMany({
          where: { id: requestedId },
          data: { yState: Buffer.from(state) },
        });
        if (result.count !== 1) throw new Error("Test document not found.");
      },
    };

    return {
      repository,
      async readState() {
        const document = await prisma.document.findUnique({ where: { id }, select: { yState: true } });
        return document?.yState ?? null;
      },
      async destroy() {
        let cleanupFailed = false;
        try {
          if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
        } catch { cleanupFailed = true; }
        try {
          if (userId) await prisma.user.deleteMany({ where: { id: userId } });
        } catch { cleanupFailed = true; }
        try {
          await prisma.$disconnect();
        } catch { cleanupFailed = true; }
        if (cleanupFailed) {
          throw new Error("Dedicated test database fixture cleanup failed; connection details were suppressed.");
        }
      },
    };
  } catch {
    let disconnectFailed = false;
    try { await prisma.$disconnect(); } catch { disconnectFailed = true; }
    throw new Error(
      disconnectFailed
        ? "Dedicated test database setup and client cleanup failed; connection details were suppressed."
        : "Dedicated test database setup failed; connection details were suppressed.",
    );
  }
}

function createClient(url: string, name: string, token: string) {
  const document = new Doc();
  const websocket = new HocuspocusProviderWebsocket({
    url,
    WebSocketPolyfill: TestWebSocket,
    maxAttempts: 1,
  });
  const connect = websocket.connect.bind(websocket);
  websocket.connect = () => {
    const attempt = connect();
    void attempt.catch(() => {});
    return attempt;
  };
  let rejectAuthentication!: () => void;
  const authenticationFailed = new Promise<void>((resolve) => { rejectAuthentication = resolve; });
  const provider = new HocuspocusProvider({
    name,
    document,
    websocketProvider: websocket,
    token,
    onAuthenticationFailed: () => {
      rejectAuthentication();
      websocket.disconnect();
    },
    onClose: () => websocket.disconnect(),
  });
  provider.attach();
  return {
    document,
    provider,
    websocket,
    authenticationFailed,
    destroy() {
      websocket.disconnect();
      provider.destroy();
      websocket.destroy();
      document.destroy();
    },
  };
}

async function waitFor(predicate: () => boolean | Promise<boolean>, description: string, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate()) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(await predicate(), description);
}

async function waitForSync(client: ReturnType<typeof createClient>) {
  if (client.provider.synced) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        client.provider.on("synced", ({ state }: { state: boolean }) => {
          if (state) resolve();
        });
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Timed out waiting for Yjs synchronization.")), 8_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function waitForSocketClose(client: ReturnType<typeof createClient>) {
  const socket = client.websocket.webSocket;
  if (!socket || socket.readyState === 3) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for a WebSocket to close.")), 5_000);
    socket.addEventListener("close", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

async function closeClient(client: ReturnType<typeof createClient>) {
  const closed = waitForSocketClose(client);
  client.destroy();
  await closed;
}

async function destroyServer(server: Server) {
  try {
    server.hocuspocus.closeConnections();
    const deadline = Date.now() + 3_000;
    while (server.hocuspocus.getDocumentsCount() > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (server.hocuspocus.getDocumentsCount() > 0) {
      for (const document of [...server.hocuspocus.documents.values()]) {
        await server.hocuspocus.unloadDocument(document);
      }
    }
  } finally {
    await server.destroy();
  }
}

async function restoreRedisForCleanup(adapter: ReturnType<typeof createCollaborationRedis>) {
  for (const client of [adapter.extension.pub, adapter.extension.sub]) {
    if (client.status === "ready") continue;
    if (client.status === "end" || client.status === "close") {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          client.connect(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Redis cleanup reconnect timed out.")), 7_000);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
  }
  await waitFor(() => adapter.isReady(), "Redis must recover to clean up its test servers", 7_000);
}

function jsonContent(client: ReturnType<typeof createClient>) {
  return JSON.stringify(yDocToProsemirrorJSON(client.document, COLLABORATION_FRAGMENT));
}

function appendText(client: ReturnType<typeof createClient>, text: string) {
  const paragraph = new XmlElement("paragraph");
  const content = new XmlText();
  content.insert(0, text);
  paragraph.insert(0, [content]);
  const fragment = client.document.getXmlFragment(COLLABORATION_FRAGMENT);
  fragment.insert(fragment.length, [paragraph]);
}

function remoteNames(client: ReturnType<typeof createClient>) {
  const awareness = client.provider.awareness;
  assert.ok(awareness);
  return getRemotePresenceUsers(awareness.getStates(), client.document.clientID);
}

test(`two real Hocuspocus instances synchronize through Redis (${databaseConfiguration ? "PostgreSQL" : "in-memory"} persistence)`, async (t) => {
  const backend = databaseConfiguration
    ? await createPostgresRepository(databaseConfiguration.value, documentId)
    : createMemoryRepository(documentId);
  const adapters: ReturnType<typeof createCollaborationRedis>[] = [];
  const attachedAdapters = new Set<ReturnType<typeof createCollaborationRedis>>();
  const servers: Server[] = [];
  const clients: ReturnType<typeof createClient>[] = [];

  t.after(async () => {
    const cleanupErrors: Error[] = [];
    for (const adapter of adapters) {
      try { await restoreRedisForCleanup(adapter); } catch { cleanupErrors.push(new Error("Redis cleanup reconnection failed.")); }
    }
    for (const client of clients) {
      try {
        await closeClient(client);
      } catch {
        try { client.destroy(); } catch { /* continue cleaning other resources */ }
        cleanupErrors.push(new Error("WebSocket client cleanup failed."));
      }
    }
    for (const server of servers) {
      try { await destroyServer(server); } catch { cleanupErrors.push(new Error("Hocuspocus server cleanup failed.")); }
    }
    for (const adapter of adapters) {
      if (attachedAdapters.has(adapter)) continue;
      try { await adapter.destroy(); } catch { cleanupErrors.push(new Error("Redis client cleanup failed.")); }
    }
    try { await backend.destroy(); } catch { cleanupErrors.push(new Error("Persistence fixture cleanup failed.")); }
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, "One or more integration resources did not clean up correctly.");
    }
  });

  await withSanitizedIntegrationErrors("Redis collaboration verification", async () => {
  async function startServer() {
    const redis = createCollaborationRedis(redisConfiguration.value);
    adapters.push(redis);
    await redis.waitUntilReady();
    const hooks = createCollaborationServerHooks({
      enabled: "true",
      nodeEnvironment: "development",
      allowedOrigins: new Set([origin]),
      consumeTicket: async (token, requestedDocumentId) => {
        const ticket = tokens.get(token);
        if (!ticket || ticket.consumed || requestedDocumentId !== documentId) return null;
        const member = members.get(ticket.userId);
        if (!member?.sessionActive || (member.role !== "OWNER" && member.role !== "EDITOR")) return null;
        ticket.consumed = true;
        return {
          documentId,
          userId: ticket.userId,
          userName: member.name,
          sessionId: member.sessionId,
          workspaceId: "integration-test-workspace",
          role: member.role,
        };
      },
      isConnectionAuthorized: async ({ sessionId, userId }) => {
        const member = members.get(userId);
        return Boolean(member?.sessionActive && member.sessionId === sessionId && (member.role === "OWNER" || member.role === "EDITOR"));
      },
      persistenceRepository: backend.repository,
      authorizationLeaseMs: 200,
      redisAvailability: redis.availability,
    });
    const server = new Server({
      address: "127.0.0.1",
      port: 0,
      quiet: true,
      stopOnSignals: false,
      unloadImmediately: true,
      extensions: [redis.extension],
      ...hooks,
    });
    attachedAdapters.add(redis);
    servers.push(server);
    await server.listen();
    return { server, redis };
  }

  async function connect(server: Server, userId: string) {
    const client = createClient(server.webSocketURL, documentId, issueTicket(userId));
    clients.push(client);
    await waitForSync(client);
    return client;
  }

  const first = await startServer();
  const second = await startServer();
  assert.notEqual(first.server, second.server, "the test must use distinct Hocuspocus instances");

  let alice = await connect(first.server, "user-alice");
  const bob = await connect(second.server, "user-bob");
  await waitFor(
    () => first.server.hocuspocus.getConnectionsCount() === 1 && second.server.hocuspocus.getConnectionsCount() === 1,
    "each WebSocket client should connect to its assigned server instance",
  );

  alice.provider.awareness?.setLocalStateField("user", { name: "Forged Alice", color: "#ff0000" });
  bob.provider.awareness?.setLocalStateField("user", { name: "Forged Bob", color: "#00ff00" });
  await waitFor(
    () => remoteNames(alice).some((user) => user.name === "Bob Example") &&
      remoteNames(bob).some((user) => user.name === "Alice Example"),
    "trusted awareness should propagate across Redis to the other server",
  );
  assert.equal(remoteNames(alice).find((user) => user.name === "Bob Example")?.color, getPresenceColor("user-bob"));

  appendText(alice, " edit-from-instance-one");
  await waitFor(() => jsonContent(bob).includes("edit-from-instance-one"), "instance two should receive instance one's Yjs update");
  appendText(bob, " edit-from-instance-two");
  await waitFor(() => jsonContent(alice).includes("edit-from-instance-two"), "instance one should receive instance two's Yjs update");

  await closeClient(bob);
  await waitFor(
    () => remoteNames(alice).every((user) => user.name !== "Bob Example"),
    "disconnecting on instance two should remove its awareness from instance one",
  );
  let bobReconnected = await connect(second.server, "user-bob");
  bobReconnected.provider.awareness?.setLocalStateField("user", { name: "Bob again" });
  await waitFor(() => remoteNames(alice).some((user) => user.name === "Bob Example"), "a new authenticated ticket should restore presence");

  await waitFor(async () => {
    const state = await backend.readState();
    if (!state) return false;
    const content = JSON.stringify(documentContentFromYState(state));
    return content.includes("edit-from-instance-one") && content.includes("edit-from-instance-two");
  }, "PostgreSQL or the isolated persistence fixture should contain both edits");

  await Promise.all([closeClient(alice), closeClient(bobReconnected)]);
  await waitFor(
    () => first.server.hocuspocus.getDocumentsCount() === 0 && second.server.hocuspocus.getDocumentsCount() === 0,
    "both server instances should unload the document before persistence reload",
  );
  alice = await connect(first.server, "user-alice");
  bobReconnected = await connect(second.server, "user-bob");
  assert.match(jsonContent(alice), /edit-from-instance-one/);
  assert.match(jsonContent(alice), /edit-from-instance-two/);
  assert.match(jsonContent(bobReconnected), /edit-from-instance-one/);
  assert.match(jsonContent(bobReconnected), /edit-from-instance-two/);

  // Connect the same principal to both servers, then verify local authorization
  // leases revoke both active sockets after the role changes.
  const aliceSecond = await connect(second.server, "user-alice");
  const aliceSockets = [alice, aliceSecond].map((client) => waitForSocketClose(client));
  members.get("user-alice")!.role = "COMMENTER";
  await Promise.all(aliceSockets);
  assert.equal(first.server.hocuspocus.getConnectionsCount(), 0);
  assert.equal(second.server.hocuspocus.getConnectionsCount(), 1, "Bob should remain connected after Alice is demoted");
  members.get("user-alice")!.role = "EDITOR";

  const carolFirst = await connect(first.server, "user-carol");
  const carolSecond = await connect(second.server, "user-carol");
  const carolSockets = [carolFirst, carolSecond].map((client) => waitForSocketClose(client));
  members.get("user-carol")!.sessionActive = false;
  await Promise.all(carolSockets);
  members.get("user-carol")!.sessionActive = true;

  // Disconnect only the adapters' Redis clients. This leaves the dedicated
  // Redis service intact while exercising real socket loss and reconnection.
  const aliceOutage = await connect(first.server, "user-alice");
  const outageClients = [aliceOutage, bobReconnected];
  const outageSockets = outageClients.map((client) => waitForSocketClose(client));
  for (const adapter of [first.redis, second.redis]) {
    adapter.extension.pub.disconnect();
    adapter.extension.sub.disconnect();
  }
  await waitFor(
    () => [first.redis, second.redis].every((adapter) => !adapter.isReady()),
    "both server adapters should report Redis unavailable",
  );
  for (const adapter of [first.redis, second.redis]) {
    assert.throws(() => adapter.availability.assertReady(), /coordination is unavailable/);
  }
  await Promise.all(outageSockets);
  const rejectedDuringOutageFirst = createClient(
    first.server.webSocketURL,
    documentId,
    issueTicket("user-alice"),
  );
  const rejectedDuringOutageSecond = createClient(
    second.server.webSocketURL,
    documentId,
    issueTicket("user-bob"),
  );
  clients.push(rejectedDuringOutageFirst, rejectedDuringOutageSecond);
  await Promise.all([
    rejectedDuringOutageFirst.authenticationFailed,
    rejectedDuringOutageSecond.authenticationFailed,
  ]);

  for (const adapter of [first.redis, second.redis]) {
    await Promise.all([adapter.extension.pub.connect(), adapter.extension.sub.connect()]);
  }
  await waitFor(
    () => [first.redis, second.redis].every((adapter) => adapter.isReady()),
    "both server adapters should recover their Redis connections",
  );

  const aliceRecovered = await connect(first.server, "user-alice");
  const bobRecovered = await connect(second.server, "user-bob");
  aliceRecovered.provider.awareness?.setLocalStateField("user", { name: "Alice recovered" });
  bobRecovered.provider.awareness?.setLocalStateField("user", { name: "Bob recovered" });
  await waitFor(
    () => remoteNames(aliceRecovered).some((user) => user.name === "Bob Example") &&
      remoteNames(bobRecovered).some((user) => user.name === "Alice Example"),
    "fresh tickets should reconnect authorized users and restore cross-instance presence",
  );
  appendText(aliceRecovered, " edit-after-redis-recovery");
  await waitFor(
    () => jsonContent(bobRecovered).includes("edit-after-redis-recovery"),
    "Yjs updates should synchronize after Redis recovery",
  );

  const persisted = await backend.readState();
  assert.ok(persisted, "the document state should remain persisted");
  const persistedContent = JSON.stringify(documentContentFromYState(persisted));
  assert.match(persistedContent, /edit-from-instance-one/);
  assert.match(persistedContent, /edit-from-instance-two/);
  assert.match(persistedContent, /edit-after-redis-recovery/);
  });
});
