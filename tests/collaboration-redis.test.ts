import assert from "node:assert/strict";
import test from "node:test";
import { IncomingMessage, MessageType } from "@hocuspocus/server";
import type { onAwarenessUpdatePayload } from "@hocuspocus/server";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { Doc } from "yjs";
import { createRedisAwarenessUpdateHandler } from "../src/collaboration/redis-extension";
import { createRedisAvailabilityHooks } from "../src/collaboration/redis-coordination";

test("last-connection awareness removals publish through Redis after Hocuspocus drops the connection", async () => {
  const localDocument = new Doc();
  const localAwareness = new Awareness(localDocument);
  localAwareness.setLocalStateField("user", { name: "Bob" });
  const clientId = localDocument.clientID;

  const remoteDocument = new Doc();
  const remoteAwareness = new Awareness(remoteDocument);
  applyAwarenessUpdate(remoteAwareness, encodeAwarenessUpdate(localAwareness, [clientId]), "initial");
  assert.equal(remoteAwareness.getStates().has(clientId), true);
  localAwareness.setLocalState(null);

  const messagePrefix = Buffer.from([1, 0x61]);
  let publishedChannel: string | undefined;
  let publishedMessage: Buffer | undefined;
  let originalCalls = 0;
  let unavailableCalls = 0;
  const extension = {
    configuration: { prefix: "collabry" },
    messagePrefix,
    pub: {
      async publish(channel: string, message: Buffer) {
        publishedChannel = channel;
        publishedMessage = Buffer.from(message);
        return 1;
      },
    },
    async onAwarenessUpdate() {
      originalCalls += 1;
      return 1;
    },
  } as unknown as Parameters<typeof createRedisAwarenessUpdateHandler>[0];
  const onAwarenessUpdate = createRedisAwarenessUpdateHandler(extension, () => {
    unavailableCalls += 1;
  });
  const payload = {
    documentName: "test-document",
    awareness: localAwareness,
    added: [],
    updated: [],
    removed: [clientId],
    document: { connections: new Map() },
  } as unknown as onAwarenessUpdatePayload;

  try {
    await onAwarenessUpdate(payload);

    assert.equal(publishedChannel, "collabry:test-document");
    assert.ok(publishedMessage);
    assert.equal(publishedMessage.subarray(0, messagePrefix.length).equals(messagePrefix), true);
    assert.equal(originalCalls, 0, "the official zero-connection guard must be bypassed for removals");
    assert.equal(unavailableCalls, 0);

    const message = new IncomingMessage(publishedMessage.subarray(messagePrefix.length));
    assert.equal(message.readVarString(), "test-document");
    assert.equal(message.readVarUint(), MessageType.Awareness);
    applyAwarenessUpdate(remoteAwareness, message.readVarUint8Array(), "redis");
    assert.equal(remoteAwareness.getStates().has(clientId), false, "the Redis frame must clear peer awareness");
  } finally {
    localDocument.destroy();
    remoteDocument.destroy();
  }
});

test("ordinary awareness updates keep the official Redis extension path", async () => {
  let originalCalls = 0;
  let unavailableCalls = 0;
  const extension = {
    configuration: { prefix: "collabry" },
    messagePrefix: Buffer.from([1, 0x61]),
    pub: { async publish() { assert.fail("ordinary updates must use the official extension hook"); } },
    async onAwarenessUpdate() {
      originalCalls += 1;
      return 7;
    },
  } as unknown as Parameters<typeof createRedisAwarenessUpdateHandler>[0];
  const onAwarenessUpdate = createRedisAwarenessUpdateHandler(extension, () => {
    unavailableCalls += 1;
  });
  const payload = {
    documentName: "test-document",
    awareness: {} as onAwarenessUpdatePayload["awareness"],
    added: [123],
    updated: [],
    removed: [],
    document: { connections: new Map([["active", {}]]) },
  } as unknown as onAwarenessUpdatePayload;

  assert.equal(await onAwarenessUpdate(payload), 7);
  assert.equal(originalCalls, 1);
  assert.equal(unavailableCalls, 0);
});

function makeConnection() {
  let closed = false;
  let terminated = false;
  return {
    connection: {
      close() { closed = true; },
      webSocket: { terminate() { terminated = true; } },
    },
    isClosed: () => closed,
    isTerminated: () => terminated,
  };
}

test("Redis availability rejects writes and new connections while coordination is down", () => {
  let ready = false;
  const closed: ReturnType<typeof makeConnection>[] = [];
  const availability = createRedisAvailabilityHooks({
    isReady: () => ready,
    closeUnavailableConnection(connection) {
      const target = connections.find((candidate) => candidate.connection === connection);
      if (target) closed.push(target);
      connection.close();
      connection.webSocket.terminate();
    },
  });
  const connections = [makeConnection()];

  assert.throws(() => availability.assertReady(), /coordination is unavailable/);
  assert.throws(() => availability.connected("unhealthy", connections[0].connection), /coordination is unavailable/);
  assert.equal(connections[0].isClosed(), true);
  assert.equal(connections[0].isTerminated(), true);

  ready = true;
  availability.assertReady();
  const active = makeConnection();
  connections.push(active);
  availability.connected("active", active.connection);

  ready = false;
  availability.closeAll();
  assert.equal(active.isClosed(), true);
  assert.equal(active.isTerminated(), true);
  assert.equal(closed.length, 2);

  ready = true;
  availability.assertReady();
  const recovered = makeConnection();
  connections.push(recovered);
  availability.connected("recovered", recovered.connection);
  availability.disconnected("recovered");
  ready = false;
  availability.closeAll();
  assert.equal(recovered.isClosed(), false, "disconnected sockets are not retained for later outage cleanup");
});
