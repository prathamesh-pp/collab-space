import type { Connection } from "@hocuspocus/server";

type RedisConnection = Pick<Connection, "close" | "webSocket">;

/**
 * Fail closed while Redis pub/sub is unavailable. Existing connections are
 * closed on an outage so awareness cannot remain stale and clients reconnect
 * with fresh, single-use collaboration tickets after Redis recovers.
 */
export function createRedisAvailabilityHooks({
  isReady,
  closeUnavailableConnection,
}: {
  isReady: () => boolean;
  closeUnavailableConnection: (connection: RedisConnection) => void;
}) {
  const connections = new Map<string, RedisConnection>();

  function closeAll() {
    for (const connection of connections.values()) {
      closeUnavailableConnection(connection);
    }
    connections.clear();
  }

  return {
    assertReady() {
      if (!isReady()) throw new Error("Collaboration coordination is unavailable.");
    },
    connected(key: string, connection: RedisConnection) {
      if (!isReady()) {
        closeUnavailableConnection(connection);
        throw new Error("Collaboration coordination is unavailable.");
      }
      connections.set(key, connection);
    },
    disconnected(key: string) {
      connections.delete(key);
    },
    unavailable() {
      closeAll();
    },
    closeAll,
  };
}
