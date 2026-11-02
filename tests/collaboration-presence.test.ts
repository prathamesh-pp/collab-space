import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { Server } from "@hocuspocus/server";
import { Doc } from "yjs";
import {
  getPresenceColor,
  getPresenceInitials,
  getRemotePresenceUsers,
} from "../src/collaboration/presence-identity";
import { createCollaborationPresenceHooks } from "../src/collaboration/presence";

const docOne = "c" + "p".repeat(24);
const docTwo = "c" + "q".repeat(24);
const origin = "http://localhost:3000";
const identities = new Map([
  ["ada-ticket", { userId: "user-ada", userName: "Ada Lovelace" }],
  ["grace-ticket", { userId: "user-grace", userName: "Grace Hopper" }],
]);

const WebSocketConstructor = createRequire(import.meta.url)("ws") as new (
  address: string | URL,
  options?: { headers: Record<string, string> },
) => { on(event: string, listener: (...args: unknown[]) => void): void; readyState: number; close(): void };

class TestWebSocket extends WebSocketConstructor {
  constructor(address: string | URL) {
    super(address, { headers: { Origin: origin } });
  }
}

function createClient(url: string, documentId: string, token: string) {
  const document = new Doc();
  const websocket = new HocuspocusProviderWebsocket({
    url,
    WebSocketPolyfill: TestWebSocket,
    maxAttempts: 1,
  });
  const connectionFailures: unknown[] = [];
  const connect = websocket.connect.bind(websocket);
  websocket.connect = () => {
    const pending = connect();
    void pending.catch((error: unknown) => connectionFailures.push(error));
    return pending;
  };
  let rejectAuthentication!: () => void;
  const authenticationFailed = new Promise<void>((resolve) => { rejectAuthentication = resolve; });
  const provider = new HocuspocusProvider({
    name: documentId,
    document,
    websocketProvider: websocket,
    token,
    onAuthenticationFailed: () => {
      rejectAuthentication();
      websocket.disconnect();
    },
  });
  provider.attach();
  let destroyed = false;
  return {
    document,
    provider,
    websocket,
    authenticationFailed,
    connectionFailures,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      websocket.disconnect();
      provider.destroy();
      websocket.destroy();
      document.destroy();
    },
  };
}

async function closeClient(client: ReturnType<typeof createClient>) {
  const socket = client.websocket.webSocket;
  const closed = !socket || socket.readyState === 3
    ? Promise.resolve()
    : new Promise<void>((resolve) => socket.addEventListener("close", () => resolve(), { once: true }));
  client.destroy();
  await closed;
}

async function waitForSync(client: ReturnType<typeof createClient>) {
  if (client.provider.synced) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for collaboration sync.")), 2_000);
    client.provider.on("synced", ({ state }: { state: boolean }) => {
      if (!state) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitFor(predicate: () => boolean, message: string) {
  const deadline = Date.now() + 2_000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(predicate(), message);
}

function remoteUsers(client: ReturnType<typeof createClient>) {
  const awareness = client.provider.awareness;
  assert.ok(awareness);
  return getRemotePresenceUsers(awareness.getStates(), client.document.clientID);
}

test("presence colors and initials are stable, readable, and deterministic", () => {
  assert.equal(getPresenceColor("user-ada"), getPresenceColor("user-ada"));
  assert.match(getPresenceColor("user-ada"), /^#[0-9a-f]{6}$/);
  assert.notEqual(getPresenceColor("user-ada"), getPresenceColor("user-grace"));
  assert.equal(getPresenceInitials("Ada Lovelace"), "AL");
  assert.equal(getPresenceInitials("Grace"), "GR");
  assert.equal(getPresenceInitials("  "), "?");

  const users = getRemotePresenceUsers(new Map([
    [1, { user: { name: "Self", color: "#112233" } }],
    [2, { user: { name: "Zoe", color: "#223344" } }],
    [3, { user: { name: "Amy", color: "#334455" } }],
    [4, { user: { name: "Untrusted state only" } }],
  ]), 1);
  assert.deepEqual(users.map(({ name }) => name), ["Amy", "Zoe"]);
  assert.equal(users.some((user) => user.name === "Self"), false);
});

test("real Hocuspocus awareness trusts authenticated identity and tracks join, leave, reconnect, and document scope", async (t) => {
  const presenceHooks = createCollaborationPresenceHooks();
  const server = new Server({
    address: "127.0.0.1",
    port: 0,
    quiet: true,
    stopOnSignals: false,
    unloadImmediately: true,
    onAuthenticate: async ({ token }) => {
      const identity = identities.get(String(token));
      if (!identity) throw new Error("Collaboration authentication denied.");
      return identity;
    },
    onLoadDocument: presenceHooks.onLoadDocument,
    beforeHandleMessage: presenceHooks.beforeHandleMessage,
  });
  await server.listen();

  const clients: ReturnType<typeof createClient>[] = [];
  t.after(async () => {
    await Promise.all(clients.map(closeClient));
    await server.destroy();
  });

  const ada = createClient(server.webSocketURL, docOne, "ada-ticket");
  const grace = createClient(server.webSocketURL, docOne, "grace-ticket");
  clients.push(ada, grace);
  await Promise.all([waitForSync(ada), waitForSync(grace)]);
  ada.provider.awareness?.setLocalStateField("user", { name: "Forged Ada", color: "#ff0000" });
  grace.provider.awareness?.setLocalStateField("user", { name: "Forged Grace", color: "#00ff00" });

  await waitFor(
    () => remoteUsers(ada).some((user) => user.name === "Grace Hopper") &&
      remoteUsers(grace).some((user) => user.name === "Ada Lovelace"),
    "authorized peers should receive server-authenticated names",
  );
  assert.deepEqual(remoteUsers(ada).map(({ name, color }) => ({ name, color })), [
    { name: "Grace Hopper", color: getPresenceColor("user-grace") },
  ]);
  assert.deepEqual(remoteUsers(grace).map(({ name, color }) => ({ name, color })), [
    { name: "Ada Lovelace", color: getPresenceColor("user-ada") },
  ]);

  const unauthorized = createClient(server.webSocketURL, docOne, "unauthorized-ticket");
  clients.push(unauthorized);
  await unauthorized.authenticationFailed;
  await waitFor(() => remoteUsers(ada).length === 1, "unauthorized connection must not publish presence");
  assert.equal(remoteUsers(ada).some(({ name }) => name.includes("unauthorized")), false);

  const graceClientId = grace.document.clientID;
  await closeClient(grace);
  await waitFor(
    () => remoteUsers(ada).every(({ clientId }) => clientId !== graceClientId),
    "leaving collaborator should be removed from remote awareness",
  );

  const graceReconnected = createClient(server.webSocketURL, docOne, "grace-ticket");
  clients.push(graceReconnected);
  await waitForSync(graceReconnected);
  graceReconnected.provider.awareness?.setLocalStateField("user", { name: "Wrong after reconnect", color: "#ffffff" });
  await waitFor(
    () => remoteUsers(ada).some(({ name }) => name === "Grace Hopper"),
    "reconnected collaborator should reappear with their verified identity",
  );

  const graceDocOneClientId = graceReconnected.document.clientID;
  await closeClient(graceReconnected);
  await waitFor(
    () => remoteUsers(ada).every(({ clientId }) => clientId !== graceDocOneClientId),
    "switching documents should remove the old document presence",
  );

  const graceDocTwo = createClient(server.webSocketURL, docTwo, "grace-ticket");
  const adaDocTwo = createClient(server.webSocketURL, docTwo, "ada-ticket");
  clients.push(graceDocTwo, adaDocTwo);
  await Promise.all([waitForSync(graceDocTwo), waitForSync(adaDocTwo)]);
  graceDocTwo.provider.awareness?.setLocalStateField("user", { name: "Forged", color: "#ffffff" });
  adaDocTwo.provider.awareness?.setLocalStateField("user", { name: "Forged", color: "#ffffff" });
  await waitFor(
    () => remoteUsers(graceDocTwo).some(({ name }) => name === "Ada Lovelace") &&
      remoteUsers(adaDocTwo).some(({ name }) => name === "Grace Hopper"),
    "presence should be isolated to the newly selected document",
  );
  assert.equal(remoteUsers(ada).length, 0, "document one must not retain document two collaborators");
});
