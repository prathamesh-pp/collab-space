import assert from "node:assert/strict";
import test from "node:test";
import {
  getRecentDocuments,
  normalizeRecentDocuments,
  parseRecentDocuments,
  recordRecentDocument,
} from "../src/lib/recent-documents";

test("recent documents deduplicate by id and keep the newest open time", () => {
  const records = normalizeRecentDocuments([
    { documentId: "doc-a", openedAt: 100 },
    { documentId: "doc-b", openedAt: 200 },
    { documentId: "doc-a", openedAt: 300 },
  ]);

  assert.deepEqual(records, [
    { documentId: "doc-a", openedAt: 300 },
    { documentId: "doc-b", openedAt: 200 },
  ]);
});

test("opening a document moves it to the newest position without duplication", () => {
  const records = recordRecentDocument(
    [
      { documentId: "doc-a", openedAt: 100 },
      { documentId: "doc-b", openedAt: 200 },
    ],
    "doc-a",
    300,
  );

  assert.deepEqual(records, [
    { documentId: "doc-a", openedAt: 300 },
    { documentId: "doc-b", openedAt: 200 },
  ]);
});

test("recent documents are sorted newest-first and limited", () => {
  const records = normalizeRecentDocuments(
    Array.from({ length: 12 }, (_, index) => ({
      documentId: `doc-${index}`,
      openedAt: index,
    })),
    5,
  );

  assert.equal(records.length, 5);
  assert.deepEqual(
    records.map((record) => record.openedAt),
    [11, 10, 9, 8, 7],
  );
});

test("unavailable documents are ignored and an empty authorized set returns no recents", () => {
  const records = [
    { documentId: "removed-doc", openedAt: 20 },
    { documentId: "available-doc", openedAt: 10 },
  ];
  const available = [
    {
      id: "available-doc",
      title: "Available",
      workspaceId: "workspace",
      workspaceName: "Team",
    },
  ];

  assert.deepEqual(getRecentDocuments(records, available), [
    {
      documentId: "available-doc",
      openedAt: 10,
      document: available[0],
    },
  ]);
  assert.deepEqual(getRecentDocuments(records, []), []);
});

test("stored records are safely parsed and malformed storage becomes an empty list", () => {
  assert.deepEqual(
    parseRecentDocuments(
      JSON.stringify([{ documentId: "doc-a", openedAt: 123 }]),
    ),
    [{ documentId: "doc-a", openedAt: 123 }],
  );
  assert.deepEqual(parseRecentDocuments("not-json"), []);
  assert.deepEqual(parseRecentDocuments(null), []);
});
