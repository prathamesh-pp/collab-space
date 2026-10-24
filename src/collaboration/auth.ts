import type { Configuration } from "@hocuspocus/server";

export type ConsumedCollaborationTicket = {
  documentId: string;
  userId: string;
  role: "OWNER" | "EDITOR";
};

type TicketConsumer = (
  token: string,
  documentId: string,
) => Promise<{
  documentId: string;
  userId: string;
  role: string;
} | null>;

export type CollaborationTicketConsumer = TicketConsumer;

export const DOCUMENT_NAME_PATTERN = /^c[a-z0-9]{24}$/;

export function createCollaborationAuthenticateHook(
  allowedOrigins: ReadonlySet<string>,
  consumeTicket: CollaborationTicketConsumer,
): NonNullable<Configuration["onAuthenticate"]> {
  return async ({
    connectionConfig,
    documentName,
    requestHeaders,
    token,
  }) => {
    let access: ConsumedCollaborationTicket | null;
    try {
      access = await authenticateCollaborationConnection(
        {
          documentName,
          token,
          origin: requestHeaders.origin,
        },
        { allowedOrigins, consumeTicket },
      );
    } catch {
      console.error("Collaboration ticket verification failed.");
      throw new Error("Collaboration authentication is temporarily unavailable.");
    }
    if (!access) {
      throw new Error("Collaboration authentication denied.");
    }

    connectionConfig.readOnly = false;
    return { userId: access.userId, role: access.role };
  };
}

export function isValidCollaborationDocumentName(name: string): boolean {
  return DOCUMENT_NAME_PATTERN.test(name);
}

export function isAllowedCollaborationOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  return origin !== undefined && allowedOrigins.has(origin);
}

export async function authenticateCollaborationConnection(
  input: {
    documentName: string;
    token: string;
    origin: string | undefined;
  },
  policy: {
    allowedOrigins: ReadonlySet<string>;
    consumeTicket: TicketConsumer;
  },
): Promise<ConsumedCollaborationTicket | null> {
  if (
    !isValidCollaborationDocumentName(input.documentName) ||
    !isAllowedCollaborationOrigin(input.origin, policy.allowedOrigins)
  ) {
    return null;
  }

  const access = await policy.consumeTicket(input.token, input.documentName);
  if (
    !access ||
    access.documentId !== input.documentName ||
    (access.role !== "OWNER" && access.role !== "EDITOR")
  ) {
    return null;
  }
  return {
    documentId: access.documentId,
    userId: access.userId,
    role: access.role,
  };
}
