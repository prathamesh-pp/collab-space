import assert from "node:assert/strict";
import test from "node:test";
import { Hocuspocus } from "@hocuspocus/server";
import { createCollaborationServerHooks } from "../src/collaboration/server-hooks";
import type { CollaborationPersistenceRepository } from "../src/collaboration/persistence";

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
      return { documentId, userId: "user-1", role: "EDITOR" };
    },
    persistenceRepository,
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
