import { loadEnvConfig } from "@next/env";
import { Server } from "@hocuspocus/server";
import { isCollaborationOperationallyEnabled } from "@/collaboration/feature-flag";
import { loadCollaborationServerConfig } from "@/collaboration/config";
import { collaborationPersistenceRepository } from "@/collaboration/persistence";
import { createCollaborationRedis } from "@/collaboration/redis-extension";
import { createCollaborationServerHooks } from "@/collaboration/server-hooks";
import {
  consumeCollaborationTicket,
  isCollaborationConnectionAuthorized,
} from "@/lib/session-core";

loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development");

async function startCollaborationServer() {
  const config = loadCollaborationServerConfig(process.env);
  const enabled = isCollaborationOperationallyEnabled(
    process.env.NEXT_PUBLIC_COLLABORATION_ENABLED,
    process.env.NODE_ENV,
  );
  const redis = enabled && config.redisUrl
    ? createCollaborationRedis(config.redisUrl)
    : null;

  try {
    if (redis) await redis.waitUntilReady();
    const server = new Server({
      address: config.address,
      port: config.port,
      quiet: true,
      extensions: redis ? [redis.extension] : [],
      ...createCollaborationServerHooks({
        enabled: process.env.NEXT_PUBLIC_COLLABORATION_ENABLED,
        nodeEnvironment: process.env.NODE_ENV,
        allowedOrigins: config.allowedOrigins,
        consumeTicket: consumeCollaborationTicket,
        persistenceRepository: collaborationPersistenceRepository,
        isConnectionAuthorized: isCollaborationConnectionAuthorized,
        redisAvailability: redis?.availability,
      }),
    });

    await server.listen(config.port);
    console.info(
      `Collaboration WebSocket server listening on ${server.webSocketURL}`,
    );
  } catch (error) {
    await redis?.destroy();
    throw error;
  }
}

void startCollaborationServer().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown startup failure.";
  console.error(`Collaboration server failed to start: ${message}`);
  process.exitCode = 1;
});
