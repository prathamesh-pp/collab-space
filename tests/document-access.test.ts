import assert from "node:assert/strict";
import test from "node:test";
import { getRoleAccessDescription } from "../src/lib/document-access";
import { canComment, canEdit } from "../src/lib/permissions";

test("workspace roles describe their effective document permissions", () => {
  assert.deepEqual(getRoleAccessDescription("OWNER"), {
    label: "Owner",
    permissions: "Can edit this document and manage workspace members.",
  });
  assert.equal(canEdit("OWNER"), true);
  assert.deepEqual(getRoleAccessDescription("EDITOR"), {
    label: "Editor",
    permissions: "Can edit this document.",
  });
  assert.equal(canEdit("EDITOR"), true);
  assert.deepEqual(getRoleAccessDescription("COMMENTER"), {
    label: "Commenter",
    permissions: "Can read and comment, but cannot edit this document.",
  });
  assert.equal(canComment("COMMENTER"), true);
  assert.equal(canEdit("COMMENTER"), false);
  assert.deepEqual(getRoleAccessDescription("VIEWER"), {
    label: "Viewer",
    permissions: "Can read this document only.",
  });
  assert.equal(canComment("VIEWER"), false);
  assert.equal(canEdit("VIEWER"), false);
});
