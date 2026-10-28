import assert from "node:assert/strict";
import test from "node:test";
import { syncDocumentEditorEditability } from "../src/lib/document-editor-state";
import { canEdit } from "../src/lib/permissions";

test("revision conflicts disable TipTap editing until the document is reloaded", () => {
  const calls: boolean[] = [];
  const editor = { setEditable: (editable: boolean) => calls.push(editable) };

  syncDocumentEditorEditability(editor, true, "conflict");
  syncDocumentEditorEditability(editor, true, "saved");
  syncDocumentEditorEditability(editor, false, "saved");
  syncDocumentEditorEditability(null, true, "conflict");

  assert.deepEqual(calls, [false, true, false]);
});

test("normal document editing remains enabled for owners and editors and denied to read-only roles", () => {
  for (const [role, expected] of [
    ["OWNER", true],
    ["EDITOR", true],
    ["COMMENTER", false],
    ["VIEWER", false],
  ] as const) {
    const calls: boolean[] = [];
    syncDocumentEditorEditability(
      { setEditable: (editable) => calls.push(editable) },
      canEdit(role),
      "saved",
    );
    assert.deepEqual(calls, [expected]);
  }
});
