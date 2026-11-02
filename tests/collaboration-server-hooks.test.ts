import assert from "node:assert/strict";
import test from "node:test";
import { Hocuspocus } from "@hocuspocus/server";
import { createCollaborationServerHooks } from "../src/collaboration/server-hooks";
import { createCollaborationRevocationHooks } from "../src/collaboration/revocation";
import type { CollaborationPersistenceRepository } from "../src/collaboration/persistence";
import { createRedisAvailabilityHooks } from "../src/collaboration/redis-coordination";

const documentId = "c" + "x".repeat(24);

const persistenceRepository: CollaborationPersistenceRepository = {
  async findDocument() {
    throw new Error("Persistence must not be activated.");
  },
  async initializeYStateIfNull() {
    throw new Error("Persistence must not be activated.");
  },
  async saveYState() {
    throw new Error("Persistence must not be activated.");
  },
};

function createHooks(enabled: string | undefined, nodeEnvironment: string | undefined) {
  let consumeCalls = 0;
  const hooks = createCollaborationServerHooks({
    enabled,
    nodeEnvironment,
    allowedOrigins: new Set(["http://localhost:3000"]),
    consumeTicket: async () => {
      consumeCalls += 1;
      return {
        documentId,
        userId: "user-1",
        userName: "Ada Lovelace",
        sessionId: "session-1",
        workspaceId: "workspace-1",
        role: "EDITOR",
      };
    },
    persistenceRepository,
    isConnectionAuthorized: async () => true,
  });

  return { hooks, getConsumeCalls: () => consumeCalls };
}

test("collaboration stays disabled unless explicitly enabled", async (context) => {
  const configurations: Array<[string | undefined, string | undefined]> = [
    ["false", "production"],
    ["true", "test"],
    ["true", "staging"],
    ["true", undefined],
    [undefined, "development"],
    ["false", "development"],
  ];

  for (const [enabled, nodeEnvironment] of configurations) {
    await context.test(`${nodeEnvironment ?? "missing NODE_ENV"} / ${enabled ?? "missing flag"}`, async () => {
      const { hooks, getConsumeCalls } = createHooks(enabled, nodeEnvironment);
      assert.equal(hooks.onLoadDocument, undefined);
      assert.equal(hooks.onStoreDocument, undefined);
      assert.ok(hooks.onAuthenticate);
      await assert.rejects(
        hooks.onAuthenticate?.({
          context: {},
          documentName: documentId,
          instance: new Hocuspocus(),
          requestHeaders: { origin: "http://localhost:3000" },
          requestParameters: new URLSearchParams(),
          request: {} as never,
          socketId: "test",
          token: "ticket",
          connectionConfig: { isAuthenticated: false, readOnly: true },
        }),
        /Collaboration is disabled/,
      );
      assert.equal(getConsumeCalls(), 0);
    });
  }

  const { hooks } = createHooks("true", "development");
  assert.equal(typeof hooks.onLoadDocument, "function");
  assert.equal(typeof hooks.onStoreDocument, "function");
  assert.equal(hooks.debounce, 0);
});

test("live authorization revalidation fails closed without logging sensitive details", async () => {
  const loggedMessages: string[] = [];
  const originalConsoleError = console.error;
  let closeEvent: { code: number; reason: string } | undefined;
  let socketTerminated = false;
  console.error = (...messages: unknown[]) => {
    loggedMessages.push(messages.map(String).join(" "));
  };

  const hooks = createCollaborationRevocationHooks(async () => {
    throw new Error("database URL and collaboration ticket secret");
  });

  try {
    await hooks.connected?.({
      context: {
        documentId,
        userId: "user-1",
        sessionId: "session-id",
        workspaceId: "workspace-id",
      },
      documentName: documentId,
      socketId: "socket-id",
      connection: {
        close(event: { code: number; reason: string }) {
          closeEvent = event;
        },
        webSocket: {
          terminate() {
            socketTerminated = true;
          },
        },
      } as never,
    } as never);
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(closeEvent, { code: 4403, reason: "Forbidden" });
  assert.equal(socketTerminated, true);
  assert.deepEqual(loggedMessages, ["Collaboration authorization revalidation failed."]);
  assert.doesNotMatch(loggedMessages.join(" "), /database URL|ticket secret|session-id/);
});

test("Redis outage blocks ticket consumption before a connection is authenticated", async () => {
  let consumeCalls = 0;
  const availability = createRedisAvailabilityHooks({
    isReady: () => false,
    closeUnavailableConnection: () => {},
  });
  const hooks = createCollaborationServerHooks({
    enabled: "true",
    nodeEnvironment: "development",
    allowedOrigins: new Set(["http://localhost:3000"]),
    consumeTicket: async () => {
      consumeCalls += 1;
      return null;
    },
    persistenceRepository,
    isConnectionAuthorized: async () => true,
    redisAvailability: availability,
    authorizationLeaseMs: 60_000,
  });

  const authenticate = hooks.onAuthenticate;
  assert.ok(authenticate);
  await assert.rejects(
    authenticate({
      context: {},
      documentName: documentId,
      instance: new Hocuspocus(),
      requestHeaders: { origin: "http://localhost:3000" },
      requestParameters: new URLSearchParams(),
      request: {} as never,
      socketId: "test",
      token: "single-use-ticket",
      connectionConfig: { isAuthenticated: false, readOnly: true },
    }),
    /coordination is unavailable/,
  );
  assert.equal(consumeCalls, 0);

  const beforeHandleMessage = hooks.beforeHandleMessage;
  assert.ok(beforeHandleMessage);
  await assert.rejects(
    beforeHandleMessage({
      context: {
        documentId,
        userId: "user-1",
        sessionId: "session-1",
        workspaceId: "workspace-1",
      },
      documentName: documentId,
      instance: new Hocuspocus(),
      requestHeaders: {},
      requestParameters: new URLSearchParams(),
      clientsCount: 1,
      update: new Uint8Array(),
      socketId: "socket-1",
      document: {} as never,
      connection: {
        close() {},
        webSocket: { terminate() {} },
        socketId: "socket-1",
      } as never,
    }),
    /coordination is unavailable/,
  );
  const disconnect = hooks.onDisconnect;
  assert.ok(disconnect);
  await disconnect({
    documentName: documentId,
    socketId: "socket-1",
  } as never);
});
