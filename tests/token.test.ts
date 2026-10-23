import assert from "node:assert/strict";
import test from "node:test";
import { hashToken } from "../src/lib/token";

test("token hashes are stable and do not expose the original token", () => {
  const token = "high-entropy-session-token";
  const hash = hashToken(token);

  assert.equal(hash, hashToken(token));
  assert.notEqual(hash, token);
  assert.equal(hash.length, 64);
});