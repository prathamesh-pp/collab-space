import { z } from "zod";
import { canEdit, getWorkspaceMembership } from "@/lib/auth";
import { parseDocumentContent } from "@/lib/document-content";
import { prisma } from "@/lib/db";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";
import { isClientCollaborationConfigured } from "@/collaboration/feature-flag";
import {
  createPrismaDocumentContentSaveRepository,
  saveDocumentContentWith,
} from "@/lib/document-content-save";

const MAX_REQUEST_LENGTH = 1_500_000;
const schema = z.object({
  content: z.unknown(),
  expectedRevision: z.number().int().nonnegative(),
  expectedStateVersion: z.string().length(64).nullable(),
}).strict();
const contentSaveRepository = createPrismaDocumentContentSaveRepository();

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
    if (isClientCollaborationConfigured(
      process.env.NEXT_PUBLIC_COLLABORATION_ENABLED,
      process.env.NODE_ENV,
      process.env.NEXT_PUBLIC_COLLABORATION_URL,
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

    const result = await saveDocumentContentWith(
      contentSaveRepository,
      documentId,
      content,
      parsed.data.expectedRevision,
      parsed.data.expectedStateVersion,
    );
    return Response.json(result.body, { status: result.status });
  });
}
