import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateDocumentDialog } from "../src/app/create-document-dialog";
import { PublicLanding } from "../src/app/public-landing";

test("public landing page presents implemented workspace features and auth calls to action", () => {
  const markup = renderToStaticMarkup(
    <PublicLanding onSignIn={() => {}} onGetStarted={() => {}} />,
  );

  assert.match(markup, /Create your workspace/);
  assert.match(markup, /Sign in/);
  assert.match(markup, /A home for each project/);
  assert.match(markup, /Feedback in context/);
  assert.match(markup, /Find the work again/);
  assert.match(markup, /Questions, answered/);
  assert.match(markup, /Owner/);
  assert.match(markup, /Commenter/);
  assert.match(markup, /Public navigation on mobile/);
  assert.doesNotMatch(markup, /Saved versions|Version history|live cursors/i);
  assert.match(markup, /src="\/collabry-logo\.png"/);
  assert.match(markup, /src="\/collabry-symbol\.png"/);
  assert.match(markup, /class="landing-image-wall"/);
  assert.match(markup, /\/landing-wall\/violet-sculpture\.svg/);
  assert.match(markup, /Illustrative product preview/);
  assert.match(markup, /alt="Collabry"/);
  assert.doesNotMatch(markup, /fake statistics|customer logos|testimonials/i);
});

test("Collabry logo assets and App Router icon use the same original document mark", () => {
  const logo = readFileSync(new URL("../public/collabry-logo.svg", import.meta.url), "utf8");
  const mark = readFileSync(new URL("../public/collabry-mark.svg", import.meta.url), "utf8");
  const icon = readFileSync(new URL("../src/app/icon.svg", import.meta.url), "utf8");
  const uploadedMark = readFileSync(new URL("../public/collabry-symbol.png", import.meta.url));
  const favicon = readFileSync(new URL("../src/app/favicon.ico", import.meta.url));
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

  assert.match(logo, /Collabry/);
  assert.match(mark, /#36B987/);
  assert.match(icon, /#36B987/);
  assert.match(logo, /#10285F/);
  assert.deepEqual(
    Array.from(uploadedMark.subarray(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.match(layout, /applicationName: "Collabry"/);
  assert.match(layout, /Collabry/);
  assert.equal(favicon.readUInt16LE(0), 0);
  assert.equal(favicon.readUInt16LE(2), 1);
  assert.deepEqual(
    Array.from({ length: favicon.readUInt16LE(4) }, (_, index) => {
      const width = favicon.readUInt8(6 + index * 16);
      return width === 0 ? 256 : width;
    }),
    [16, 32, 48],
  );
});

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

test("registration explains the enforced password byte limit", () => {
  const dashboard = readFileSync(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /no more than 72 UTF-8 bytes/);
  assert.match(dashboard, /aria-describedby=\{authMode === "register" \? "password-help"/);
});

test("auth refresh keeps the existing API flow and adds an accessible password toggle", () => {
  const dashboard = readFileSync(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );
  const illustration = readFileSync(
    new URL("../public/auth-atmosphere.svg", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /authMode === "login"\s*\? "\/api\/auth\/login"\s*:\s*"\/api\/auth\/register"/);
  assert.match(dashboard, /type=\{passwordVisible \? "text" : "password"\}/);
  assert.match(dashboard, /aria-label=\{passwordVisible \? "Hide password" : "Show password"\}/);
  assert.match(dashboard, /className="auth-screen/);
  assert.match(dashboard, /className="dashboard-app/);
  assert.match(illustration, /linearGradient/);
  assert.match(illustration, /#B7A0FF/);
});

test("dashboard sidebar keeps its destinations and supports hover, keyboard, and touch layouts", () => {
  const dashboard = readFileSync(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /<CollabryMark className="dashboard-brand-mark"/);
  assert.match(dashboard, /href="#overview"[\s\S]*?aria-label="Overview"/);
  assert.match(dashboard, /href="#workspaces"[\s\S]*?aria-label="Your spaces"/);
  assert.match(dashboard, /href="#recent-documents"[\s\S]*?aria-label="Recent documents"/);
  assert.match(styles, /\.dashboard-sidebar:hover,[\s\S]*?\.dashboard-sidebar:focus-within/);
  assert.match(styles, /@media \(min-width: 1024px\) and \(hover: none\)/);
  assert.match(styles, /\.dashboard-sidebar,\s*\.dashboard-nav-item\s*\{\s*transition-duration: 0\.01ms;/);
});

test("dashboard uses distinct accents for its real stats and recent documents", () => {
  const dashboard = readFileSync(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /value: workspaces\.length/);
  assert.match(dashboard, /value: authorizedDocuments\.length/);
  assert.match(dashboard, /value: recentDocuments\.length/);
  assert.match(dashboard, /dashboard-stat-violet/);
  assert.match(dashboard, /dashboard-stat-cyan/);
  assert.match(dashboard, /dashboard-stat-coral/);
  assert.match(dashboard, /dashboard-recent-card-\$\{index % 3\}/);
  assert.match(dashboard, /dashboard-create-workspace/);
  assert.match(styles, /\.dashboard-recent-card-0[\s\S]*?\.dashboard-recent-card-1[\s\S]*?\.dashboard-recent-card-2/);
});

test("document access controls do not imply sharing or invitations", () => {
  const editor = readFileSync(
    new URL("../src/app/documents/[documentId]/document-editor.tsx", import.meta.url),
    "utf8",
  );

  assert.match(editor, /aria-label="View workspace access"/);
  assert.match(editor, /<span>Access<\/span>/);
  assert.doesNotMatch(editor, /Share \/ Access|Share and access/);
});
