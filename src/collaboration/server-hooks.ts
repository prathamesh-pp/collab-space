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

export type CollaborationServerHooks = Pick<
  Configuration,
  "onAuthenticate" | "onLoadDocument" | "onStoreDocument"
>;

export function createCollaborationServerHooks({
  enabled,
  nodeEnvironment,
  allowedOrigins,
  consumeTicket,
  persistenceRepository,
}: {
  enabled: string | undefined;
  nodeEnvironment: string | undefined;
  allowedOrigins: ReadonlySet<string>;
  consumeTicket: CollaborationTicketConsumer;
  persistenceRepository: CollaborationPersistenceRepository;
}): CollaborationServerHooks {
  if (!isCollaborationOperationallyEnabled(enabled, nodeEnvironment)) {
    return {
      onAuthenticate: async () => {
        throw new Error("Collaboration is disabled.");
      },
    };
  }

  return {
    onAuthenticate: createCollaborationAuthenticateHook(
      allowedOrigins,
      consumeTicket,
    ),
    ...createCollaborationPersistenceHooks(persistenceRepository),
  };
}
