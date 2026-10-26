import assert from "node:assert/strict";
import test from "node:test";
import { isPasswordWithinLimit } from "../src/lib/password";

test("passwords are limited by UTF-8 byte length", () => {
  assert.equal(isPasswordWithinLimit("a".repeat(72)), true);
  assert.equal(isPasswordWithinLimit("a".repeat(73)), false);
  assert.equal(isPasswordWithinLimit("😀".repeat(18)), true);
  assert.equal(isPasswordWithinLimit("😀".repeat(19)), false);
});
