import assert from "node:assert/strict";
import test from "node:test";
import { parseDocumentContent } from "../src/lib/document-content";

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