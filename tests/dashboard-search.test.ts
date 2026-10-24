import assert from "node:assert/strict";
import test from "node:test";
import { searchDashboard } from "../src/lib/dashboard-search";

const authorizedWorkspaces = [
  {
    id: "workspace-1",
    name: "Product Design",
    documents: [
      { id: "document-1", title: "Launch Plan" },
      { id: "document-2", title: "Meeting Notes" },
    ],
  },
  {
    id: "workspace-2",
    name: "Research",
    documents: [{ id: "document-3", title: "User Interviews" }],
  },
];

test("dashboard search matches workspace names and document titles case-insensitively", () => {
  const result = searchDashboard(authorizedWorkspaces, "lAuNcH", "all");
  assert.deepEqual(result.workspaces, []);
  assert.deepEqual(result.documents.map((document) => document.id), ["document-1"]);

  const workspaceResult = searchDashboard(authorizedWorkspaces, "PRODUCT", "all");
  assert.deepEqual(workspaceResult.workspaces.map((workspace) => workspace.id), [
    "workspace-1",
  ]);
});

test("workspace and document filters only return their selected result type", () => {
  const workspaces = searchDashboard(authorizedWorkspaces, "plan", "workspaces");
  assert.deepEqual(workspaces.workspaces, []);
  assert.deepEqual(workspaces.documents, []);

  const documents = searchDashboard(authorizedWorkspaces, "plan", "documents");
  assert.deepEqual(documents.workspaces, []);
  assert.deepEqual(documents.documents.map((document) => document.id), [
    "document-1",
  ]);
});

test("empty search results remain empty and blank document search lists available documents", () => {
  const noMatches = searchDashboard(authorizedWorkspaces, "missing", "all");
  assert.deepEqual(noMatches, { workspaces: [], documents: [] });

  const allDocuments = searchDashboard(authorizedWorkspaces, "", "documents");
  assert.deepEqual(
    allDocuments.documents.map((document) => document.id),
    ["document-1", "document-2", "document-3"],
  );
});

test("search only includes authorized workspace data supplied by the caller", () => {
  const visibleToCurrentUser = [authorizedWorkspaces[1]];
  const result = searchDashboard(visibleToCurrentUser, "", "documents");

  assert.deepEqual(result.workspaces, []);
  assert.deepEqual(result.documents.map((document) => document.id), ["document-3"]);
  assert.equal(
    result.documents.some((document) => document.id === "document-1"),
    false,
  );
});
