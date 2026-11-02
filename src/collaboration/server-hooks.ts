import type { Configuration } from "@hocuspocus/server";
import {
  createCollaborationAuthenticateHook,
  type CollaborationTicketConsumer,
} from "@/collaboration/auth";
import { isCollaborationOperationallyEnabled } from "@/collaboration/feature-flag";
import {
  createCollaborationPersistenceHooks,
  type CollaborationPersistenceRepository,
} from "@/collaboration/persistence";
import { createCollaborationPresenceHooks } from "@/collaboration/presence";
import {
  createCollaborationRevocationHooks,
  type CollaborationAuthorizationChecker,
} from "@/collaboration/revocation";
import type { createRedisAvailabilityHooks } from "@/collaboration/redis-coordination";

type RedisAvailability = ReturnType<typeof createRedisAvailabilityHooks>;

export type CollaborationServerHooks = Pick<
  Configuration,
  | "onAuthenticate"
  | "onLoadDocument"
  | "onStoreDocument"
  | "beforeHandleMessage"
  | "debounce"
  | "connected"
  | "onDisconnect"
>;

export function createCollaborationServerHooks({
  enabled,
  nodeEnvironment,
  allowedOrigins,
  consumeTicket,
  persistenceRepository,
  isConnectionAuthorized,
  authorizationLeaseMs,
  redisAvailability,
}: {
  enabled: string | undefined;
  nodeEnvironment: string | undefined;
  allowedOrigins: ReadonlySet<string>;
  consumeTicket: CollaborationTicketConsumer;
  persistenceRepository: CollaborationPersistenceRepository;
  isConnectionAuthorized: CollaborationAuthorizationChecker;
  authorizationLeaseMs?: number;
  redisAvailability?: RedisAvailability;
}): CollaborationServerHooks {
  if (!isCollaborationOperationallyEnabled(enabled, nodeEnvironment)) {
    return {
      debounce: 0,
      onAuthenticate: async () => {
        throw new Error("Collaboration is disabled.");
      },
    };
  }

  const persistenceHooks = createCollaborationPersistenceHooks(persistenceRepository);
  const presenceHooks = createCollaborationPresenceHooks();
  const revocationHooks = createCollaborationRevocationHooks(
    isConnectionAuthorized,
    authorizationLeaseMs,
  );
  const authenticate = createCollaborationAuthenticateHook(allowedOrigins, consumeTicket);

  return {
    onAuthenticate: async (payload) => {
      redisAvailability?.assertReady();
      return authenticate(payload);
    },
    connected: async (payload) => {
      await revocationHooks.connected?.(payload);
      if (redisAvailability && payload.connection.webSocket.readyState === 1) {
        redisAvailability.connected(`${payload.socketId}:${payload.documentName}`, payload.connection);
      }
    },
    onDisconnect: async (payload) => {
      await revocationHooks.onDisconnect?.(payload);
      if (redisAvailability) {
        redisAvailability.disconnected(`${payload.socketId}:${payload.documentName}`);
      }
    },
    // Store each update in the update path so persistence failures are surfaced
    // to the client before the update is acknowledged.
    debounce: 0,
    onLoadDocument: async (payload) => {
      await persistenceHooks.onLoadDocument?.(payload);
      await presenceHooks.onLoadDocument?.(payload);
    },
    onStoreDocument: persistenceHooks.onStoreDocument,
    beforeHandleMessage: async (payload) => {
      await revocationHooks.beforeHandleMessage?.(payload);
      redisAvailability?.assertReady();
      await presenceHooks.beforeHandleMessage?.(payload);
    },
  };
}
