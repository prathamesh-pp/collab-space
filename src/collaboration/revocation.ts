import { Forbidden } from "@hocuspocus/common";
import type { Configuration, Connection } from "@hocuspocus/server";

export const COLLABORATION_AUTHORIZATION_LEASE_MS = 1_000;
const AUTHORIZATION_CHECK_TIMEOUT_MS = 2_000;

export type CollaborationConnectionAuthorization = {
  documentId: string;
  userId: string;
  sessionId: string;
  workspaceId: string;
};

export type CollaborationAuthorizationChecker = (
  authorization: CollaborationConnectionAuthorization,
) => Promise<boolean>;

type Lease = {
  authorization: CollaborationConnectionAuthorization;
  connection: Connection;
  lastAuthorizedAt: number;
  check: Promise<boolean> | null;
  timer: ReturnType<typeof setInterval> | null;
  expirationTimer: ReturnType<typeof setTimeout> | null;
  active: boolean;
};

function getAuthorization(context: unknown): CollaborationConnectionAuthorization | null {
  if (context === null || typeof context !== "object") return null;
  const value = context as Record<string, unknown>;
  if (
    typeof value.documentId !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.sessionId !== "string" ||
    typeof value.workspaceId !== "string"
  ) {
    return null;
  }
  return {
    documentId: value.documentId,
    userId: value.userId,
    sessionId: value.sessionId,
    workspaceId: value.workspaceId,
  };
}

function connectionKey(socketId: string, documentName: string) {
  return `${socketId}:${documentName}`;
}

function terminateConnection(connection: Connection) {
  connection.close(Forbidden);
  connection.webSocket.terminate();
}

export function createCollaborationRevocationHooks(
  isAuthorized: CollaborationAuthorizationChecker,
  leaseMs = COLLABORATION_AUTHORIZATION_LEASE_MS,
): Pick<Configuration, "connected" | "beforeHandleMessage" | "onDisconnect"> {
  const leases = new Map<string, Lease>();

  function closeLease(lease: Lease) {
    if (!lease.active) return;
    lease.active = false;
    if (lease.timer) clearInterval(lease.timer);
    if (lease.expirationTimer) clearTimeout(lease.expirationTimer);
    lease.timer = null;
    lease.expirationTimer = null;
    terminateConnection(lease.connection);
  }

  async function validate(lease: Lease, force = false): Promise<boolean> {
    if (!lease.active) return false;
    if (
      !force &&
      Date.now() - lease.lastAuthorizedAt < leaseMs
    ) {
      return true;
    }
    if (lease.check) return lease.check;

    const checkStartedAt = Date.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    lease.check = Promise.race([
      isAuthorized(lease.authorization),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), AUTHORIZATION_CHECK_TIMEOUT_MS);
      }),
    ])
      .catch(() => {
        // Do not include request, token, or database details in collaboration logs.
        console.error("Collaboration authorization revalidation failed.");
        return false;
      })
      .then((authorized) => {
        if (!lease.active) return false;
        if (authorized && Date.now() - checkStartedAt < leaseMs) {
          lease.lastAuthorizedAt = checkStartedAt;
          if (lease.expirationTimer) clearTimeout(lease.expirationTimer);
          lease.expirationTimer = setTimeout(
            () => closeLease(lease),
            Math.max(0, checkStartedAt + leaseMs - Date.now()),
          );
          return true;
        }
        closeLease(lease);
        return false;
      })
      .finally(() => {
        if (timeout) clearTimeout(timeout);
        lease.check = null;
      });
    return lease.check;
  }

  return {
    async connected({ context, connection, documentName, socketId }) {
      const authorization = getAuthorization(context);
      if (!authorization || authorization.documentId !== documentName) {
        terminateConnection(connection);
        return;
      }

      const key = connectionKey(socketId, documentName);
      const prior = leases.get(key);
      if (prior?.connection === connection) {
        if (!(await validate(prior, true))) return;
        prior.timer = setInterval(() => {
          void validate(prior, true);
        }, Math.max(1, Math.floor(leaseMs / 2)));
        return;
      }
      if (prior) {
        prior.active = false;
        if (prior.timer) clearInterval(prior.timer);
        if (prior.expirationTimer) clearTimeout(prior.expirationTimer);
      }
      const lease: Lease = {
        authorization,
        connection,
        lastAuthorizedAt: 0,
        check: null,
        timer: null,
        expirationTimer: null,
        active: true,
      };
      leases.set(key, lease);

      if (!(await validate(lease, true))) return;

      lease.timer = setInterval(() => {
        void validate(lease, true);
      }, Math.max(1, Math.floor(leaseMs / 2)));
    },

    async beforeHandleMessage({ context, connection, documentName, socketId }) {
      const authorization = getAuthorization(context);
      if (!authorization || authorization.documentId !== documentName) {
        terminateConnection(connection);
        throw Forbidden;
      }

      const key = connectionKey(socketId, documentName);
      let lease = leases.get(key);
      if (!lease) {
        lease = {
          authorization,
          connection,
          lastAuthorizedAt: 0,
          check: null,
          timer: null,
          expirationTimer: null,
          active: true,
        };
        leases.set(key, lease);
      }

      if (!(await validate(lease))) throw Forbidden;
    },

    async onDisconnect({ documentName, socketId }) {
      const key = connectionKey(socketId, documentName);
      const lease = leases.get(key);
      if (lease) {
        lease.active = false;
        if (lease.timer) clearInterval(lease.timer);
        if (lease.expirationTimer) clearTimeout(lease.expirationTimer);
        lease.timer = null;
        lease.expirationTimer = null;
      }
      leases.delete(key);
    },
  };
}
