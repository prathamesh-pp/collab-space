import assert from "node:assert/strict";
import test from "node:test";
import { canComment, canEdit } from "../src/lib/permissions";

test("edit access is limited to owners and editors", () => {
  assert.equal(canEdit("OWNER"), true);
  assert.equal(canEdit("EDITOR"), true);
  assert.equal(canEdit("COMMENTER"), false);
  assert.equal(canEdit("VIEWER"), false);
  assert.equal(canEdit("unknown"), false);
});

test("comment access includes editors, commenters, and owners", () => {
  assert.equal(canComment("OWNER"), true);
  assert.equal(canComment("EDITOR"), true);
  assert.equal(canComment("COMMENTER"), true);
  assert.equal(canComment("VIEWER"), false);
});