import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { AuthMessageType, writeAuthentication } from "@hocuspocus/common";
import { Hocuspocus, Server, MessageType } from "@hocuspocus/server";
import {
  createDecoder,
  readVarString,
  readVarUint,
} from "lib0/decoding";
import {
  createEncoder,
  toUint8Array,
  writeVarString,
  writeVarUint,
} from "lib0/encoding";
import {
  authenticateCollaborationConnection,
  createCollaborationAuthenticateHook,
  isAllowedCollaborationOrigin,
  isValidCollaborationDocumentName,
} from "../src/collaboration/auth";
import { loadCollaborationServerConfig } from "../src/collaboration/config";

const documentId = "c" + "x".repeat(24);
const allowedOrigins = new Set(["https://collab.example.test"]);
type TestWebSocket = {
  on(event: "open", listener: () => void): TestWebSocket;
  once(event: "message", listener: (data: Uint8Array) => void): TestWebSocket;
  once(event: "error", listener: (error: Error) => void): TestWebSocket;
  send(data: Uint8Array): void;
  close(): void;
};
const WebSocketConstructor = createRequire(import.meta.url)("ws") as new (
  address: string | URL,
  protocols: undefined,
  options: { headers: Record<string, string> },
) => TestWebSocket;

test("document-name validation accepts generated CUIDs and rejects arbitrary names", () => {
  assert.equal(isValidCollaborationDocumentName(documentId), true);
  assert.equal(isValidCollaborationDocumentName("../secret"), false);
  assert.equal(isValidCollaborationDocumentName("c" + "a".repeat(23)), false);
});

test("origin policy requires an exact configured origin", () => {
  assert.equal(
    isAllowedCollaborationOrigin("https://collab.example.test", allowedOrigins),
    true,
  );
  assert.equal(
    isAllowedCollaborationOrigin("https://other.example.test", allowedOrigins),
    false,
  );
  assert.equal(isAllowedCollaborationOrigin(undefined, allowedOrigins), false);
});

test("authentication rejects invalid documents and origins before ticket consumption", async () => {
  let consumeCalls = 0;
  const consumeTicket = async () => {
    consumeCalls += 1;
    return { documentId, userId: "user-1", role: "EDITOR" as const };
  };
  const policy = { allowedOrigins, consumeTicket };

  assert.equal(
    await authenticateCollaborationConnection(
      { documentName: "../secret", token: "opaque", origin: [...allowedOrigins][0] },
      policy,
    ),
    null,
  );
  assert.equal(
    await authenticateCollaborationConnection(
      { documentName: documentId, token: "opaque", origin: "https://attacker.test" },
      policy,
    ),
    null,
  );
  assert.equal(consumeCalls, 0);
});

test("authentication rejects missing, mismatched, and non-editor ticket access", async () => {
  const outcomes = [
    null,
    { documentId: "c" + "b".repeat(24), userId: "user-1", role: "EDITOR" as const },
    { documentId, userId: "user-1", role: "VIEWER" },
  ];
  for (const outcome of outcomes) {
    assert.equal(
      await authenticateCollaborationConnection(
        {
          documentName: documentId,
          token: "opaque",
          origin: "https://collab.example.test",
        },
        {
          allowedOrigins,
          consumeTicket: async () => outcome,
        },
      ),
      null,
    );
  }
});

test("authentication accepts only an eligible ticket for the exact document", async () => {
  let consumed: [string, string] | undefined;
  const access = await authenticateCollaborationConnection(
    {
      documentName: documentId,
      token: "opaque",
      origin: "https://collab.example.test",
    },
    {
      allowedOrigins,
      consumeTicket: async (token, requestedDocumentId) => {
        consumed = [token, requestedDocumentId];
        return { documentId, userId: "user-1", role: "OWNER" };
      },
    },
  );
  assert.deepEqual(consumed, ["opaque", documentId]);
  assert.deepEqual(access, { documentId, userId: "user-1", role: "OWNER" });
});

test("unexpected ticket-consumption errors are sanitized and never authenticate", async () => {
  const connectionConfig = { isAuthenticated: false, readOnly: true };
  const loggedMessages: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...messages: unknown[]) => {
    loggedMessages.push(messages.map(String).join(" "));
  };
  const authenticate = createCollaborationAuthenticateHook(
    new Set(["https://collab.example.test"]),
    async () => {
      throw new Error("database password and ticket secret");
    },
  );

  try {
    await assert.rejects(
      authenticate({
        context: {},
        documentName: documentId,
        instance: new Hocuspocus(),
        requestHeaders: { origin: "https://collab.example.test" },
        requestParameters: new URLSearchParams(),
        request: {} as never,
        socketId: "test",
        token: "ticket-secret",
        connectionConfig,
      }),
      (error: Error) => {
        assert.equal(
          error.message,
          "Collaboration authentication is temporarily unavailable.",
        );
        assert.equal(error.message.includes("password"), false);
        assert.equal(error.message.includes("ticket-secret"), false);
        return true;
      },
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.deepEqual(connectionConfig, { isAuthenticated: false, readOnly: true });
  assert.deepEqual(loggedMessages, ["Collaboration ticket verification failed."]);
  assert.doesNotMatch(loggedMessages.join(" "), /password|ticket-secret/);
});

test("server configuration requires a valid port, database URL, and strict origins", () => {
  assert.deepEqual(
    loadCollaborationServerConfig({
      COLLABORATION_PORT: "1234",
      COLLABORATION_ALLOWED_ORIGINS:
        "http://localhost:3000,https://collab.example.test",
      DATABASE_URL: "postgresql://localhost/collab",
    }),
    {
      port: 1234,
      address: "127.0.0.1",
      allowedOrigins: new Set([
        "http://localhost:3000",
        "https://collab.example.test",
      ]),
    },
  );
  assert.throws(
    () =>
      loadCollaborationServerConfig({
        COLLABORATION_PORT: "70000",
        COLLABORATION_ALLOWED_ORIGINS: "https://collab.example.test",
        DATABASE_URL: "postgresql://localhost/collab",
      }),
    /COLLABORATION_PORT/,
  );
  assert.throws(
    () =>
      loadCollaborationServerConfig({
        COLLABORATION_PORT: "1234",
        COLLABORATION_ALLOWED_ORIGINS: "https://collab.example.test/path",
        DATABASE_URL: "postgresql://localhost/collab",
      }),
    /COLLABORATION_ALLOWED_ORIGINS/,
  );
});

test("real Hocuspocus connections reject origins and tickets before load or store hooks", async (t) => {
  const allowedOrigin = "https://collab.example.test";
  let consumeCalls = 0;
  let loadCalls = 0;
  let storeCalls = 0;
  const server = new Server({
    address: "127.0.0.1",
    port: 0,
    quiet: true,
    stopOnSignals: false,
    onAuthenticate: createCollaborationAuthenticateHook(
      new Set([allowedOrigin]),
      async (token) => {
        assert.equal(token, "invalid-ticket");
        consumeCalls += 1;
        return null;
      },
    ),
    onLoadDocument: async () => {
      loadCalls += 1;
    },
    onStoreDocument: async () => {
      storeCalls += 1;
    },
  });

  await server.listen();
  t.after(async () => {
    await server.destroy();
  });

  const cases = [
    { name: "c" + "a".repeat(24), origin: undefined },
    { name: "c" + "b".repeat(24), origin: "https://attacker.example.test" },
    { name: "c" + "d".repeat(24), origin: allowedOrigin },
  ];

  for (const scenario of cases) {
    const client = new WebSocketConstructor(
      server.webSocketURL,
      undefined,
      { headers: scenario.origin ? { Origin: scenario.origin } : {} },
    );
    const response = new Promise<Uint8Array>((resolve, reject) => {
      client.once("message", resolve);
      client.once("error", reject);
    });
    let timeout: NodeJS.Timeout | undefined;

    try {
      client.on("open", () => {
        const encoder = createEncoder();
        writeVarString(encoder, scenario.name);
        writeVarUint(encoder, MessageType.Auth);
        writeAuthentication(encoder, "invalid-ticket");
        client.send(toUint8Array(encoder));
      });
      const responseBytes = await Promise.race([
        response,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Timed out waiting for auth rejection.")),
            2_000,
          );
        }),
      ]);
      const decoder = createDecoder(responseBytes);
      assert.equal(readVarString(decoder), scenario.name);
      assert.equal(readVarUint(decoder), MessageType.Auth);
      assert.equal(readVarUint(decoder), AuthMessageType.PermissionDenied);
      assert.equal(readVarString(decoder), "permission-denied");
    } finally {
      if (timeout) clearTimeout(timeout);
      client.close();
    }
  }

  assert.equal(consumeCalls, 1, "only the allowed origin reaches ticket consumption");
  assert.equal(loadCalls, 0);
  assert.equal(storeCalls, 0);
});
