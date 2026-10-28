import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { Server } from "@hocuspocus/server";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import { Doc, XmlElement, XmlText } from "yjs";
import { COLLABORATION_FRAGMENT } from "../src/collaboration/tiptap-schema";
import { createCollaborationPersistenceHooks, type CollaborationPersistenceRepository, type PersistedDocument } from "../src/collaboration/persistence";

const documentId = "c" + "x".repeat(24);
const initialContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Persisted before collaboration" }] }],
};
const origin = "http://localhost:3000";

const WebSocketConstructor = createRequire(import.meta.url)("ws") as new (
  address: string | URL,
  options?: { headers: Record<string, string> },
) => object;

class TestWebSocket extends WebSocketConstructor {
  constructor(address: string | URL) {
    super(address, { headers: { Origin: origin } });
  }
}

function createRepository() {
  let record: PersistedDocument = {
    content: initialContent,
    contentRevision: 1,
    yState: null,
  };
  const repository: CollaborationPersistenceRepository = {
    async findDocument() { return record; },
    async initializeYStateIfNull(_id, revision, state) {
      if (record.yState || revision !== record.contentRevision) return false;
      record = { ...record, yState: state };
      return true;
    },
    async saveYState(_id, state) { record = { ...record, yState: state }; },
  };
  return { repository, getRecord: () => record };
}

async function waitForSync(provider: HocuspocusProvider) {
  if (provider.synced) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for Yjs sync.")), 3_000);
    provider.on("synced", ({ state }: { state: boolean }) => {
      if (!state) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

function createClient(url: string, token: string) {
  const document = new Doc();
  const websocket = new HocuspocusProviderWebsocket({
    url,
    WebSocketPolyfill: TestWebSocket,
  });
  const provider = new HocuspocusProvider({
    name: documentId,
    document,
    websocketProvider: websocket,
    token,
  });
  provider.attach();
  return {
    document,
    provider,
    destroy() {
      provider.destroy();
      websocket.destroy();
      document.destroy();
    },
  };
}

test("two authorized clients synchronize edits and reconnect from persisted Yjs state", async (t) => {
  const storage = createRepository();
  const hooks = createCollaborationPersistenceHooks(storage.repository);
  const server = new Server({
    address: "127.0.0.1",
    port: 0,
    quiet: true,
    stopOnSignals: false,
    debounce: 0,
    onAuthenticate: async ({ documentName, token, requestHeaders, connectionConfig }) => {
      if (documentName !== documentId || token !== "valid-ticket" || requestHeaders.origin !== origin) {
        throw new Error("Collaboration authentication denied.");
      }
      connectionConfig.readOnly = false;
      return { userId: "editor", role: "EDITOR" };
    },
    ...hooks,
  });
  await server.listen();
  t.after(async () => { await server.destroy(); });

  const first = createClient(server.webSocketURL, "valid-ticket");
  const second = createClient(server.webSocketURL, "valid-ticket");
  t.after(() => { first.destroy(); second.destroy(); });
  await Promise.all([waitForSync(first.provider), waitForSync(second.provider)]);
  assert.deepEqual(
    yDocToProsemirrorJSON(first.document, COLLABORATION_FRAGMENT),
    initialContent,
  );

  const paragraph = new XmlElement("paragraph");
  const text = new XmlText();
  text.insert(0, "Live update");
  paragraph.insert(0, [text]);
  first.document.getXmlFragment(COLLABORATION_FRAGMENT).insert(1, [paragraph]);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for the second client update.")), 3_000);
    const check = () => {
      const json = yDocToProsemirrorJSON(second.document, COLLABORATION_FRAGMENT);
      const text = JSON.stringify(json);
      if (text.includes("Live update")) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
  assert.ok(storage.getRecord().yState instanceof Uint8Array);

  first.destroy();
  second.destroy();
  const reconnected = createClient(server.webSocketURL, "valid-ticket");
  t.after(() => reconnected.destroy());
  await waitForSync(reconnected.provider);
  assert.deepEqual(
    yDocToProsemirrorJSON(reconnected.document, COLLABORATION_FRAGMENT),
    {
      type: "doc",
      content: [
        ...initialContent.content,
        { type: "paragraph", content: [{ type: "text", text: "Live update" }] },
      ],
    },
  );
});
