import assert from "node:assert/strict";
import test from "node:test";
import { parseDocumentContent, type DocumentContent } from "../src/lib/document-content";
import {
  getDocumentStateVersion,
  saveDocumentContentWith,
  type DocumentContentSaveRepository,
} from "../src/lib/document-content-save";

const paragraph = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }],
});

function memorySaveRepository(initial: {
  contentRevision: number;
  yState: Uint8Array | null;
}) {
  let snapshot = initial;
  let savedContent: DocumentContent = paragraph("Initial content");
  const repository: DocumentContentSaveRepository = {
    async findSnapshot() {
      return snapshot;
    },
    async saveIfUnchanged(input) {
      if (
        snapshot.contentRevision !== input.expectedRevision ||
        getDocumentStateVersion(snapshot.yState) !== getDocumentStateVersion(input.expectedYState)
      ) return false;
      savedContent = input.content;
      snapshot = {
        contentRevision: snapshot.contentRevision + 1,
        yState: null,
      };
      return true;
    },
  };
  return {
    repository,
    getSnapshot: () => snapshot,
    getSavedContent: () => savedContent,
  };
}

test("document content accepts the editor's supported rich-text nodes", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "A heading", marks: [{ type: "bold" }] }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "A list item" }] }],
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 1, type: null },
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };

  assert.deepEqual(parseDocumentContent(content), content);
});

test("a freshly opened Yjs-backed document saves through the legacy editor without a false conflict", async () => {
  const yState = new Uint8Array([1, 4, 9]);
  const storage = memorySaveRepository({ contentRevision: 7, yState });
  const expectedStateVersion = getDocumentStateVersion(yState);
  assert.ok(expectedStateVersion);

  const result = await saveDocumentContentWith(
    storage.repository,
    "document-1",
    paragraph("The owner can continue typing"),
    7,
    expectedStateVersion,
  );

  assert.deepEqual(result, {
    status: 200,
    body: { contentRevision: 8, contentStateVersion: null },
  });
  assert.deepEqual(storage.getSavedContent(), paragraph("The owner can continue typing"));
  assert.deepEqual(storage.getSnapshot(), { contentRevision: 8, yState: null });
});

test("a concurrent content update remains a conflict and is not overwritten", async () => {
  const storage = memorySaveRepository({ contentRevision: 3, yState: null });
  const first = await saveDocumentContentWith(
    storage.repository,
    "document-1",
    paragraph("First editor update"),
    3,
    null,
  );
  const second = await saveDocumentContentWith(
    storage.repository,
    "document-1",
    paragraph("Stale second editor update"),
    3,
    null,
  );

  assert.equal(first.status, 200);
  assert.deepEqual(second, {
    status: 409,
    body: {
      error: "A newer version exists. Reload before editing further.",
      contentRevision: 4,
    },
  });
  assert.deepEqual(storage.getSavedContent(), paragraph("First editor update"));
});

test("document content rejects unsupported nodes and attributes", () => {
  assert.equal(
    parseDocumentContent({
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://example.test/image" } }],
    }),
    null,
  );
  assert.equal(
    parseDocumentContent({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "unsafe", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }],
      }],
    }),
    null,
  );
  assert.equal(
    parseDocumentContent({
      type: "doc",
      content: [{
        type: "orderedList",
        attrs: { type: ["1"] },
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      }],
    }),
    null,
  );
});

test("document content rejects excessive nesting and text size", () => {
  let nested: unknown = { type: "paragraph" };
  for (let index = 0; index < 40; index += 1) {
    nested = {
      type: "bulletList",
      content: [{ type: "listItem", content: [nested] }],
    };
  }

  assert.equal(parseDocumentContent({ type: "doc", content: [nested] }), null);
  assert.equal(
    parseDocumentContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(300_001) }] }],
    }),
    null,
  );
});
