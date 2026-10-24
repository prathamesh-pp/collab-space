import { loadEnvConfig } from "@next/env";
import { Server } from "@hocuspocus/server";
import { loadCollaborationServerConfig } from "@/collaboration/config";
import { collaborationPersistenceRepository } from "@/collaboration/persistence";
import { createCollaborationServerHooks } from "@/collaboration/server-hooks";
import { consumeCollaborationTicket } from "@/lib/session-core";

loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development");

async function startCollaborationServer() {
  const config = loadCollaborationServerConfig(process.env);
  const server = new Server({
    address: config.address,
    port: config.port,
    quiet: true,
    ...createCollaborationServerHooks({
      enabled: process.env.NEXT_PUBLIC_COLLABORATION_ENABLED,
      nodeEnvironment: process.env.NODE_ENV,
      allowedOrigins: config.allowedOrigins,
      consumeTicket: consumeCollaborationTicket,
      persistenceRepository: collaborationPersistenceRepository,
    }),
  });

  await server.listen(config.port);
  console.info(
    `Collaboration WebSocket server listening on ${server.webSocketURL}`,
  );
}

void startCollaborationServer().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown startup failure.";
  console.error(`Collaboration server failed to start: ${message}`);
  process.exitCode = 1;
});
