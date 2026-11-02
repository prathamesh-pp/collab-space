import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, Prisma } from "@prisma/client";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { encodeStateAsUpdate } from "yjs";
import {
  collaborationSchema,
  COLLABORATION_FRAGMENT,
} from "../src/collaboration/tiptap-schema";
import { createPrismaDocumentVersionRepository } from "../src/lib/document-versions-prisma";
import {
  createDocumentVersion,
  listDocumentVersions,
  restoreDocumentVersion,
} from "../src/lib/document-versions";
import {
  requireCollaborationTestDatabaseUrl,
  withSanitizedIntegrationErrors,
} from "./postgres-test-database";

const databaseUrl = requireCollaborationTestDatabaseUrl(process.env.COLLABORATION_TEST_DATABASE_URL);
const documentId = `c${randomBytes(12).toString("hex")}`;
const otherDocumentId = `c${randomBytes(12).toString("hex")}`;
const currentContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Persisted Yjs version source" }] }],
};
const newerContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Newer persisted Yjs content" }] }],
};
const legacyJson = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Stale JSON column" }] }],
};

function encodeContent(content: typeof currentContent) {
  const document = prosemirrorJSONToYDoc(
    collaborationSchema,
    content,
    COLLABORATION_FRAGMENT,
  );
  try {
    return Buffer.from(encodeStateAsUpdate(document));
  } finally {
    document.destroy();
  }
}

test("PostgreSQL JSON snapshots list and restore current Yjs content while retaining legacy snapshots", async (t) => {
  const prisma = await withSanitizedIntegrationErrors("PostgreSQL version-history fixture setup", async () =>
    new PrismaClient({ datasourceUrl: databaseUrl }),
  );
  let userId: string | null = null;
  let workspaceId: string | null = null;
  let fixtureUserId = "";
  const cleanupErrors: string[] = [];
  try {
    await prisma.$connect();
    const fixture = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: `versions-it-${randomUUID()}@example.test`,
          name: "Version Integration Test",
          passwordHash: "integration-test-only",
        },
        select: { id: true },
      });
      const workspace = await tx.workspace.create({
        data: { name: "Version integration fixture", createdById: user.id },
        select: { id: true },
      });
      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
      });
      await tx.document.createMany({
        data: [
          {
            id: documentId,
            workspaceId: workspace.id,
            title: "Version fixture",
            content: legacyJson,
            contentRevision: 0,
            yState: encodeContent(currentContent),
          },
          {
            id: otherDocumentId,
            workspaceId: workspace.id,
            title: "Other version fixture",
            content: currentContent,
            contentRevision: 0,
            yState: null,
          },
        ],
      });
      await tx.documentVersion.create({
        data: {
          documentId,
          userId: user.id,
          label: "Legacy binary snapshot",
          yState: Buffer.from([9, 8, 7]),
          content: Prisma.DbNull,
        },
      });
      return { userId: user.id, workspaceId: workspace.id };
    });
    fixtureUserId = fixture.userId;
    userId = fixture.userId;
    workspaceId = fixture.workspaceId;
  } catch {
    try { await prisma.$disconnect(); } catch { /* suppress connection details */ }
    throw new Error("Dedicated PostgreSQL version-history fixture setup failed; connection details were suppressed.");
  }

  t.after(async () => {
    try {
      if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    } catch { cleanupErrors.push("workspace fixture cleanup failed"); }
    try {
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    } catch { cleanupErrors.push("user fixture cleanup failed"); }
    try {
      await prisma.$disconnect();
    } catch { cleanupErrors.push("Prisma disconnect failed"); }
    if (cleanupErrors.length) {
      throw new Error("PostgreSQL fixture cleanup failed; connection details were suppressed.");
    }
  });

  await withSanitizedIntegrationErrors("PostgreSQL version-history verification", async () => {
    const ownerId = fixtureUserId;
    const repository = createPrismaDocumentVersionRepository(prisma);
    const created = await createDocumentVersion(repository, documentId, ownerId, "Saved Yjs state");
    assert.equal(created.status, 201);
    const versionId = (created.body.version as { id: string }).id;

    const stateBeforeRestore = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { content: true, yState: true },
    });
    assert.deepEqual(stateBeforeRestore.content, legacyJson, "snapshot creation leaves the old JSON column untouched");
    assert.ok(stateBeforeRestore.yState, "snapshot creation preserves binary Yjs state");

    const listed = await listDocumentVersions(repository, documentId, ownerId);
    assert.equal(listed.status, 200);
    const listedVersions = listed.body.versions as { id: string }[];
    assert.deepEqual(listedVersions.map(({ id }) => id), [versionId]);

    const otherDocumentVersion = await createDocumentVersion(repository, otherDocumentId, ownerId, "Other document");
    assert.equal(otherDocumentVersion.status, 201);
    assert.equal(
      (await restoreDocumentVersion(repository, documentId, (otherDocumentVersion.body.version as { id: string }).id, ownerId)).status,
      404,
    );

    await prisma.document.update({
      where: { id: documentId },
      data: {
        content: legacyJson,
        contentRevision: { increment: 1 },
        yState: encodeContent(newerContent),
      },
    });
    const restored = await restoreDocumentVersion(repository, documentId, versionId, ownerId);
    assert.equal(restored.status, 200);

    const finalDocument = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { content: true, contentRevision: true, yState: true },
    });
    assert.deepEqual(finalDocument.content, currentContent);
    assert.equal(finalDocument.contentRevision, 2);
    assert.equal(finalDocument.yState, null);

    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      select: { label: true, content: true, yState: true },
    });
    const legacyVersion = versions.find(({ label }) => label === "Legacy binary snapshot");
    assert.ok(legacyVersion);
    assert.deepEqual(legacyVersion.yState, Buffer.from([9, 8, 7]));
    assert.equal(legacyVersion.content, null, "binary-only history remains compatible and excluded from JSON history");
    const jsonVersions = versions.filter(({ content }) => content !== null);
    assert.equal(jsonVersions.length, 2);
    assert.ok(jsonVersions.some(({ content }) => JSON.stringify(content) === JSON.stringify(currentContent)));
    assert.ok(jsonVersions.some(({ content }) => JSON.stringify(content) === JSON.stringify(newerContent)));
  });
});
