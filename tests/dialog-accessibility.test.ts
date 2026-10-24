import assert from "node:assert/strict";
import test from "node:test";
import { closeDialogOnEscape } from "../src/lib/dialog-accessibility";

test("Escape closes a dialog and prevents the browser default", () => {
  let closed = false;
  let prevented = false;

  const handled = closeDialogOnEscape(
    {
      key: "Escape",
      preventDefault: () => {
        prevented = true;
      },
    },
    () => {
      closed = true;
    },
  );

  assert.equal(handled, true);
  assert.equal(closed, true);
  assert.equal(prevented, true);
});

test("other dialog keys do not close or prevent the event", () => {
  let closed = false;
  let prevented = false;

  const handled = closeDialogOnEscape(
    { key: "Tab", preventDefault: () => { prevented = true; } },
    () => {
      closed = true;
    },
  );

  assert.equal(handled, false);
  assert.equal(closed, false);
  assert.equal(prevented, false);
});
