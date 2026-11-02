import { z } from "zod";
import { isCollaborationOperationallyEnabled } from "@/collaboration/feature-flag";
import { createPrismaDocumentVersionRepository } from "@/lib/document-versions-prisma";
import { createDocumentVersion, listDocumentVersions } from "@/lib/document-versions";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";

const createSchema = z.object({ label: z.string().trim().min(1).max(120) }).strict();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);
    const { documentId } = await params;
    const result = await listDocumentVersions(createPrismaDocumentVersionRepository(), documentId, user.id);
    return Response.json(result.body, { status: result.status });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);
    const { documentId } = await params;
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Provide a version label up to 120 characters.", 400);
    const result = await createDocumentVersion(
      createPrismaDocumentVersionRepository(),
      documentId,
      user.id,
      parsed.data.label,
      !isCollaborationOperationallyEnabled(
        process.env.NEXT_PUBLIC_COLLABORATION_ENABLED,
        process.env.NODE_ENV,
      ),
    );
    return Response.json(result.body, { status: result.status });
  });
}
