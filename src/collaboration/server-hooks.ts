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
  "onAuthenticate" | "onLoadDocument" | "onStoreDocument" | "debounce"
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
      debounce: 0,
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
    // Store each update in the update path so persistence failures are surfaced
    // to the client before the update is acknowledged.
    debounce: 0,
    ...createCollaborationPersistenceHooks(persistenceRepository),
  };
}
