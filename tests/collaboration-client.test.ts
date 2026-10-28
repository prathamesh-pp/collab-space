import assert from "node:assert/strict";
import test from "node:test";
import { Doc } from "yjs";
import {
  createCollaborationClient,
  requestCollaborationTicket,
  type CollaborationProviderConfiguration,
} from "../src/collaboration/client";
import { createCollaborativeEditorExtensions } from "../src/collaboration/editor-extensions";
import {
  isClientCollaborationConfigured,
  isCollaborationFeatureEnabled,
  isCollaborationOperationallyEnabled,
  selectDocumentEditorMode,
} from "../src/collaboration/feature-flag";
import { COLLABORATION_FRAGMENT } from "../src/collaboration/tiptap-schema";

const documentId = "c" + "x".repeat(24);
const ticketOne = "A".repeat(43);
const ticketTwo = "B".repeat(43);

class TrackedDoc extends Doc {
  destroyed = false;

  override destroy(): void {
    this.destroyed = true;
    super.destroy();
  }
}

test("collaboration requires an explicit opt-in and respects the disabled production flag", () => {
  assert.equal(isCollaborationFeatureEnabled(undefined, "development"), false);
  assert.equal(isCollaborationFeatureEnabled("false", "development"), false);
  assert.equal(isCollaborationFeatureEnabled("true", "production"), true);
  assert.equal(isCollaborationFeatureEnabled("false", "production"), false);
  assert.equal(isCollaborationFeatureEnabled("true", "test"), false);
  assert.equal(isCollaborationFeatureEnabled("true", "staging"), false);
  assert.equal(isCollaborationFeatureEnabled("true", undefined), false);
  assert.equal(isCollaborationFeatureEnabled("true", "development"), true);
  assert.equal(
    isCollaborationOperationallyEnabled("true", "development"),
    true,
  );
  assert.equal(selectDocumentEditorMode(false, "OWNER"), "legacy");
  assert.equal(selectDocumentEditorMode(true, "OWNER"), "collaborative");
  assert.equal(selectDocumentEditorMode(true, "EDITOR"), "collaborative");
  assert.equal(selectDocumentEditorMode(true, "COMMENTER"), "legacy");
  assert.equal(selectDocumentEditorMode(true, "VIEWER"), "legacy");
  assert.equal(selectDocumentEditorMode(true, null), "legacy");
  assert.equal(isCollaborationOperationallyEnabled("true", "production"), true);
  assert.equal(isCollaborationOperationallyEnabled("false", "production"), false);
  assert.equal(isClientCollaborationConfigured("true", "development", undefined), false);
  assert.equal(isClientCollaborationConfigured("true", "development", "not-a-websocket"), false);
  assert.equal(isClientCollaborationConfigured("true", "development", "ws://localhost:1234"), true);
  assert.equal(isClientCollaborationConfigured("false", "production", "wss://collab.example.test"), false);
  for (const role of ["OWNER", "EDITOR"] as const) {
    assert.equal(
      selectDocumentEditorMode(
        isClientCollaborationConfigured("true", "development", undefined),
        role,
      ),
      "legacy",
    );
  }
});

test("collaboration provider configuration requests a fresh in-memory ticket per handshake", async () => {
  const document = new TrackedDoc();
  let providerDestroyed = false;
  let configuration: CollaborationProviderConfiguration | undefined;
  let requestCount = 0;
  const client = createCollaborationClient(
    {
      documentId,
      url: "ws://localhost:1234",
      callbacks: {
        onStatus() {},
        onSynced() {},
        onAuthenticationFailed() {},
      },
    },
    {
      createDocument: () => document,
      createProvider: (providerConfiguration) => {
        configuration = providerConfiguration;
        return { destroy: () => { providerDestroyed = true; } };
      },
      fetcher: async () => {
        requestCount += 1;
        return Response.json({
          ticket: requestCount === 1 ? ticketOne : ticketTwo,
        });
      },
    },
  );

  assert.equal(configuration?.url, "ws://localhost:1234");
  assert.equal(configuration?.name, documentId);
  assert.equal(configuration?.document, document);
  assert.equal(typeof configuration?.token, "function");
  const tokenCallback = configuration?.token;
  assert.equal(typeof tokenCallback, "function");
  if (typeof tokenCallback !== "function") {
    throw new Error("Provider token callback was not configured.");
  }
  assert.equal(await tokenCallback(), ticketOne);
  assert.equal(await tokenCallback(), ticketTwo);
  assert.equal(requestCount, 2);

  client.destroy();
  client.destroy();
  assert.equal(providerDestroyed, true);
  assert.equal(document.destroyed, true);
});

test("collaborative extensions use the shared fragment and disable StarterKit history", () => {
  const document = new Doc();
  const provider = { destroy() {} };
  const extensions = createCollaborativeEditorExtensions(provider, document);
  const collaboration = extensions.find(
    (extension) => extension.name === "collaboration",
  );

  assert.ok(collaboration);
  assert.ok("field" in collaboration.options);
  assert.equal(collaboration.options.field, COLLABORATION_FRAGMENT);
  assert.ok("undoRedo" in extensions[0].options);
  assert.equal(extensions[0].options.undoRedo, false);
  document.destroy();
});

test("ticket request is same-origin, non-cacheable, and does not expose server errors", async () => {
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  const ticket = await requestCollaborationTicket(
    documentId,
    async (url, init) => {
      requestedUrl = String(url);
      requestInit = init;
      return Response.json({ ticket: ticketOne });
    },
  );
  assert.equal(ticket, ticketOne);
  assert.equal(
    requestedUrl,
    `/api/documents/${documentId}/collaboration-ticket`,
  );
  assert.equal(requestInit?.method, "POST");
  assert.equal(requestInit?.credentials, "same-origin");
  assert.equal(requestInit?.cache, "no-store");

  await assert.rejects(
    requestCollaborationTicket(documentId, async () =>
      new Response("sensitive server detail", { status: 403 }),
    ),
    (error: Error) => {
      assert.equal(
        error.message,
        "Could not authenticate collaboration connection.",
      );
      assert.equal(error.message.includes("sensitive"), false);
      return true;
    },
  );
  await assert.rejects(
    requestCollaborationTicket(documentId, async () =>
      Response.json({ ticket: "not-a-ticket" }),
    ),
    /Could not authenticate collaboration connection/,
  );
  await assert.rejects(
    requestCollaborationTicket(documentId, async () => {
      throw new Error("internal credential detail");
    }),
    (error: Error) => {
      assert.equal(error.message.includes("credential"), false);
      return true;
    },
  );
});

test("provider authentication failure callback is forwarded without ticket details", () => {
  let configuration: CollaborationProviderConfiguration | undefined;
  let failed = 0;
  const document = new Doc();
  const client = createCollaborationClient(
    {
      documentId,
      url: "ws://localhost:1234",
      callbacks: {
        onStatus() {},
        onSynced() {},
        onAuthenticationFailed() {
          failed += 1;
        },
      },
    },
    {
      createDocument: () => document,
      createProvider: (providerConfiguration) => {
        configuration = providerConfiguration;
        return { destroy() {} };
      },
      fetcher: async () => Response.json({ ticket: ticketOne }),
    },
  );

  configuration?.onAuthenticationFailed();
  assert.equal(failed, 1);
  client.destroy();
});
