import { Redis as HocuspocusRedis } from "@hocuspocus/extension-redis";
import type { RedisInstance } from "@hocuspocus/extension-redis";
import { OutgoingMessage } from "@hocuspocus/server";
import type { onAwarenessUpdatePayload } from "@hocuspocus/server";
import IORedis from "ioredis";
import { createRedisAvailabilityHooks } from "@/collaboration/redis-coordination";

const REDIS_STARTUP_TIMEOUT_MS = 10_000;

type RedisAwarenessPublisher = Pick<
  HocuspocusRedis,
  "configuration" | "messagePrefix" | "onAwarenessUpdate" | "pub"
>;

export function createRedisAwarenessUpdateHandler(
  extension: RedisAwarenessPublisher,
  onUnavailable: () => void,
) {
  const originalOnAwarenessUpdate = extension.onAwarenessUpdate.bind(extension);

  return async (payload: onAwarenessUpdatePayload) => {
    try {
      if (payload.document.connections.size === 0 && payload.removed.length > 0) {
        // Hocuspocus defers extension hooks until after removeConnection deletes
        // the last local connection. The Redis extension's zero-connection
        // guard would otherwise discard this removal and leave stale awareness
        // on other instances. Preserve its message framing and channel prefix.
        const changedClients = payload.added.concat(payload.updated, payload.removed);
        const message = new OutgoingMessage(payload.documentName)
          .createAwarenessUpdateMessage(payload.awareness, changedClients);
        const channel = `${extension.configuration.prefix}:${payload.documentName}`;
        const encodedMessage = Buffer.concat([
          extension.messagePrefix,
          Buffer.from(message.toUint8Array()),
        ]);
        return await extension.pub.publish(channel, encodedMessage);
      }

      return await originalOnAwarenessUpdate(payload);
    } catch {
      onUnavailable();
      console.error("Collaboration Redis presence synchronization failed; active connections were closed.");
      return undefined;
    }
  };
}

export function createCollaborationRedis(redisUrl: string) {
  const extension = new HocuspocusRedis({
    prefix: "collabry",
    lockTimeout: 5_000,
    disconnectDelay: 1_000,
    createClient: () => new IORedis(redisUrl, {
      connectionName: "collabry-hocuspocus",
      connectTimeout: 5_000,
      enableOfflineQueue: false,
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
      retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
    }),
  });

  let failedOperation = false;
  const isReady = () => !failedOperation && extension.pub.status === "ready" && extension.sub.status === "ready";
  const availability = createRedisAvailabilityHooks({
    isReady,
    closeUnavailableConnection(connection) {
      connection.close();
      connection.webSocket.terminate();
    },
  });

  const onUnavailable = () => {
    failedOperation = true;
    availability.unavailable();
  };
  const onReady = () => {
    if (extension.pub.status === "ready" && extension.sub.status === "ready") {
      failedOperation = false;
    }
  };
  const observe = (client: RedisInstance) => {
    client.on("close", onUnavailable);
    client.on("reconnecting", onUnavailable);
    client.on("end", onUnavailable);
    client.on("ready", onReady);
    // ioredis requires an error listener even when errors are deliberately
    // handled through readiness state and reconnect events.
    client.on("error", () => {
      if (!isReady()) onUnavailable();
    });
  };
  observe(extension.pub);
  observe(extension.sub);

  const originalAfterLoadDocument = extension.afterLoadDocument.bind(extension);
  extension.afterLoadDocument = async (payload) => {
    try {
      return await originalAfterLoadDocument(payload);
    } catch {
      onUnavailable();
      throw new Error("Collaboration coordination is unavailable.");
    }
  };

  const originalOnChange = extension.onChange.bind(extension);
  extension.onChange = async (payload) => {
    try {
      return await originalOnChange(payload);
    } catch {
      onUnavailable();
      console.error("Collaboration Redis synchronization failed; active connections were closed.");
    }
  };

  extension.onAwarenessUpdate = createRedisAwarenessUpdateHandler(extension, onUnavailable);

  return {
    extension,
    availability,
    isReady,
    async waitUntilReady(timeoutMs = REDIS_STARTUP_TIMEOUT_MS) {
      const deadline = Date.now() + timeoutMs;
      while (!isReady() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!isReady()) {
        throw new Error("Collaboration Redis did not become ready before startup timed out.");
      }
    },
    async destroy() {
      availability.closeAll();
      await extension.onDestroy();
    },
  };
}
