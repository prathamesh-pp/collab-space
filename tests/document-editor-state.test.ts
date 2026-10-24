import assert from "node:assert/strict";
import test from "node:test";
import { syncDocumentEditorEditability } from "../src/lib/document-editor-state";

test("revision conflicts disable TipTap editing until the document is reloaded", () => {
  const calls: boolean[] = [];
  const editor = { setEditable: (editable: boolean) => calls.push(editable) };

  syncDocumentEditorEditability(editor, true, "conflict");
  syncDocumentEditorEditability(editor, true, "saved");
  syncDocumentEditorEditability(editor, false, "saved");
  syncDocumentEditorEditability(null, true, "conflict");

  assert.deepEqual(calls, [false, true, false]);
});
