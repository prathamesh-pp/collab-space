import { Prisma } from "@prisma/client";
import { z } from "zod";
import { canEdit, getWorkspaceMembership } from "@/lib/auth";
import { parseDocumentContent } from "@/lib/document-content";
import { prisma } from "@/lib/db";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";
import { isCollaborationOperationallyEnabled } from "@/collaboration/feature-flag";

const MAX_REQUEST_LENGTH = 1_500_000;
const schema = z.object({
  content: z.unknown(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();

async function readLimitedBody(request: Request): Promise<string | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_LENGTH) {
    return null;
  }

  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalLength += value.byteLength;
    if (totalLength > MAX_REQUEST_LENGTH) {
      void reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);

    const { documentId } = await params;
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { workspaceId: true },
    });
    if (!document) return jsonError("Document not found.", 404);

    const membership = await getWorkspaceMembership(user.id, document.workspaceId);
    if (!membership) return jsonError("Document not found.", 404);
    if (!canEdit(membership.role)) {
      return jsonError("You do not have permission to edit this document.", 403);
    }
    if (isCollaborationOperationallyEnabled(
      process.env.NEXT_PUBLIC_COLLABORATION_ENABLED,
      process.env.NODE_ENV,
    )) {
      return jsonError(
        "JSON autosave is disabled while collaborative editing is enabled.",
        409,
      );
    }

    const rawBody = await readLimitedBody(request);
    if (rawBody === null) {
      return jsonError("Document content is too large.", 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid document content.", 400);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Provide valid document content and revision.", 400);
    }

    const content = parseDocumentContent(parsed.data.content);
    if (!content) return jsonError("Document content is invalid or too large.", 400);

    const result = await prisma.document.updateMany({
      where: {
        id: documentId,
        contentRevision: parsed.data.expectedRevision,
        yState: null,
      },
      data: {
        content: content as Prisma.InputJsonValue,
        contentRevision: { increment: 1 },
      },
    });

    if (result.count === 0) {
      const current = await prisma.document.findUnique({
        where: { id: documentId },
        select: { contentRevision: true, yState: true },
      });
      if (!current) return jsonError("Document not found.", 404);
      return Response.json(
        {
          error: current.yState
            ? "This document is managed by collaborative editing and cannot be saved as JSON."
            : "A newer version of this document was saved. Reload before saving again.",
          contentRevision: current.contentRevision,
        },
        { status: 409 },
      );
    }

    return Response.json({ contentRevision: parsed.data.expectedRevision + 1 });
  });
}