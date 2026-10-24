import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
  type HocuspocusProviderConfiguration,
} from "@hocuspocus/provider";
import { Doc } from "yjs";

const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type CollaborationProviderLifecycle = {
  destroy(): void;
};

export type CollaborationProviderConfiguration = {
  url: string;
  name: string;
  document: Doc;
  token: NonNullable<HocuspocusProviderConfiguration["token"]>;
  onStatus(status: string): void;
  onSynced(synced: boolean): void;
  onAuthenticationFailed(): void;
};

export type CollaborationClientCallbacks = {
  onStatus(status: string): void;
  onSynced(synced: boolean): void;
  onAuthenticationFailed(): void;
};

export type CollaborationClientDependencies = {
  createDocument(): Doc;
  createProvider(
    configuration: CollaborationProviderConfiguration,
  ): CollaborationProviderLifecycle;
  fetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export async function requestCollaborationTicket(
  documentId: string,
  fetcher: CollaborationClientDependencies["fetcher"] = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(
      `/api/documents/${encodeURIComponent(documentId)}/collaboration-ticket`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      },
    );
  } catch {
    throw new Error("Could not authenticate collaboration connection.");
  }
  if (!response.ok) {
    throw new Error("Could not authenticate collaboration connection.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Could not authenticate collaboration connection.");
  }
  if (
    body === null ||
    typeof body !== "object" ||
    !("ticket" in body) ||
    typeof body.ticket !== "string" ||
    !TICKET_PATTERN.test(body.ticket)
  ) {
    throw new Error("Could not authenticate collaboration connection.");
  }
  return body.ticket;
}

const browserDependencies: CollaborationClientDependencies = {
  createDocument: () => new Doc(),
  createProvider: (configuration) => {
    const websocketProvider = new HocuspocusProviderWebsocket({
      url: configuration.url,
      onStatus: ({ status }) => configuration.onStatus(status),
    });
    let provider: HocuspocusProvider | null = null;
    try {
      provider = new HocuspocusProvider({
        name: configuration.name,
        document: configuration.document,
        websocketProvider,
        token: configuration.token,
        onSynced: ({ state }) => configuration.onSynced(state),
        onAuthenticationFailed: () =>
          configuration.onAuthenticationFailed(),
      });
      provider.attach();
    } catch (error) {
      try {
        provider?.destroy();
      } finally {
        websocketProvider.destroy();
      }
      throw error;
    }

    return {
      destroy() {
        try {
          provider?.destroy();
        } finally {
          websocketProvider.destroy();
        }
      },
    };
  },
  fetcher: (input, init) => fetch(input, init),
};

export function createCollaborationClient(
  {
    documentId,
    url,
    callbacks,
  }: {
    documentId: string;
    url: string;
    callbacks: CollaborationClientCallbacks;
  },
  dependencies: CollaborationClientDependencies = browserDependencies,
) {
  const document = dependencies.createDocument();
  let provider: CollaborationProviderLifecycle;
  try {
    provider = dependencies.createProvider({
      url,
      name: documentId,
      document,
      token: () => requestCollaborationTicket(documentId, dependencies.fetcher),
      onStatus: callbacks.onStatus,
      onSynced: callbacks.onSynced,
      onAuthenticationFailed: callbacks.onAuthenticationFailed,
    });
  } catch (error) {
    document.destroy();
    throw error;
  }

  let destroyed = false;
  return {
    document,
    provider,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        provider.destroy();
      } finally {
        document.destroy();
      }
    },
  };
}
