import { createPrismaDocumentVersionRepository } from "@/lib/document-versions-prisma";
import { isCollaborationOperationallyEnabled } from "@/collaboration/feature-flag";
import { restoreDocumentVersion } from "@/lib/document-versions";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ documentId: string; versionId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);
    const { documentId, versionId } = await params;
    const result = await restoreDocumentVersion(
      createPrismaDocumentVersionRepository(),
      documentId,
      versionId,
      user.id,
      !isCollaborationOperationallyEnabled(
        process.env.NEXT_PUBLIC_COLLABORATION_ENABLED,
        process.env.NODE_ENV,
      ),
    );
    return Response.json(result.body, { status: result.status });
  });
}
