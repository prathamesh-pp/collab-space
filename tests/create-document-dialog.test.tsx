import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateDocumentDialog } from "../src/app/create-document-dialog";

test("document creation uses an accessible in-app dialog and labeled title form", () => {
  const markup = renderToStaticMarkup(
    <CreateDocumentDialog
      workspaceName="Product Design"
      onClose={() => {}}
      onCreate={async () => {}}
    />,
  );

  assert.match(markup, /<dialog[^>]*aria-labelledby="create-document-title"/);
  assert.match(markup, /<label[^>]*for="document-title"/);
  assert.match(markup, /<input[^>]*id="document-title"/);
  assert.match(markup, /Create document/);
  assert.match(markup, /In Product Design/);
  assert.doesNotMatch(markup, /window\.prompt/);
});

test("dashboard document creation does not use an unsupported native prompt", () => {
  const dashboard = readFileSync(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(dashboard, /\bwindow\.prompt\s*\(/);
  assert.match(dashboard, /setDocumentWorkspace\(workspace\)/);
});
