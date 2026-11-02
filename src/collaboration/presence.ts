import { MessageType } from "@hocuspocus/server";
import type { Configuration, Document } from "@hocuspocus/server";
import { createDecoder, readVarString, readVarUint, readVarUint8Array } from "lib0/decoding";
import { createEncoder, toUint8Array, writeVarString, writeVarUint } from "lib0/encoding";
import { applyAwarenessUpdate } from "y-protocols/awareness";
import { getPresenceColor } from "@/collaboration/presence-identity";

type PresenceConnectionContext = {
  userId: string;
  userName: string;
};

function isPresenceContext(value: unknown): value is PresenceConnectionContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  return typeof context.userId === "string" && typeof context.userName === "string";
}

function encodeTrustedAwarenessUpdate(
  document: Document,
  clientId: number,
  state: Record<string, unknown>,
) {
  const metadata = document.awareness.meta.get(clientId);
  if (!metadata) return null;
  const encoder = createEncoder();
  writeVarUint(encoder, 1);
  writeVarUint(encoder, clientId);
  writeVarUint(encoder, metadata.clock + 1);
  writeVarString(encoder, JSON.stringify(state));
  return toUint8Array(encoder);
}

export type CollaborationPresenceHooks = Pick<
  Configuration,
  "onLoadDocument" | "beforeHandleMessage"
>;

export function createCollaborationPresenceHooks(): CollaborationPresenceHooks {
  const ownersByDocument = new WeakMap<Document, Map<number, string>>();
  const socketsByDocument = new WeakMap<Document, Map<string, Set<number>>>();

  return {
    async onLoadDocument({ document }) {
      if (ownersByDocument.has(document)) return;
      const owners = new Map<number, string>();
      const clientIdsBySocket = new Map<string, Set<number>>();
      ownersByDocument.set(document, owners);
      socketsByDocument.set(document, clientIdsBySocket);

      document.awareness.on("update", (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        if (origin === null || typeof origin !== "object") {
          for (const clientId of removed) owners.delete(clientId);
          return;
        }
        const connection = document.getConnections().find(({ webSocket }) => webSocket === origin);
        if (!connection || !isPresenceContext(connection.context)) return;
        const { userId, userName } = connection.context;
        const trustedUser = {
          name: userName.trim().slice(0, 80) || "Collaborator",
          color: getPresenceColor(userId),
        };
        const socketIds = clientIdsBySocket.get(connection.socketId) ?? new Set<number>();

        for (const clientId of removed) {
          if (owners.get(clientId) === connection.socketId) {
            owners.delete(clientId);
            socketIds.delete(clientId);
          }
        }

        for (const clientId of [...added, ...updated]) {
          const owner = owners.get(clientId);
          if (owner && owner !== connection.socketId) {
            connection.close();
            connection.webSocket.terminate();
            continue;
          }
          if (!owner && document.getClients(connection.webSocket).has(clientId)) {
            owners.set(clientId, connection.socketId);
            socketIds.add(clientId);
          }
          if (owners.get(clientId) !== connection.socketId) continue;

          const currentState = document.awareness.getStates().get(clientId);
          if (!currentState) continue;
          const currentUser = currentState.user as Record<string, unknown> | undefined;
          if (currentUser?.name === trustedUser.name && currentUser.color === trustedUser.color) continue;
          const encoded = encodeTrustedAwarenessUpdate(document, clientId, {
            ...currentState,
            user: trustedUser,
          });
          if (encoded) applyAwarenessUpdate(document.awareness, encoded, origin);
        }

        clientIdsBySocket.set(connection.socketId, socketIds);
      });
    },

    async beforeHandleMessage({ connection, update }) {
      const owners = ownersByDocument.get(connection.document);
      if (!owners) return;
      const decoder = createDecoder(update);
      const documentName = readVarString(decoder);
      if (documentName !== connection.document.name || readVarUint(decoder) !== MessageType.Awareness) return;
      const awarenessUpdate = createDecoder(readVarUint8Array(decoder));
      const count = readVarUint(awarenessUpdate);
      const owned = socketsByDocument.get(connection.document)?.get(connection.socketId) ?? new Set<number>();
      for (let index = 0; index < count; index += 1) {
        const clientId = readVarUint(awarenessUpdate);
        const clock = readVarUint(awarenessUpdate);
        const state = JSON.parse(readVarString(awarenessUpdate)) as unknown;
        const owner = owners.get(clientId);
        if ((owner && owner !== connection.socketId) || (!owner && owned.size > 0)) {
          const currentState = connection.document.awareness.getStates().get(clientId);
          const currentClock = connection.document.awareness.meta.get(clientId)?.clock;
          const isHarmlessReplay = (state === null && !currentState) ||
            (currentClock !== undefined && (
              clock < currentClock || (clock === currentClock && state !== null)
            ));
          if (isHarmlessReplay) continue;
          throw new Error("Collaboration presence identity is invalid.");
        }
      }
    },
  };
}
