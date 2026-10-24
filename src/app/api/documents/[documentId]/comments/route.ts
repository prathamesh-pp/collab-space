import {
  createDocumentComment,
  listDocumentComments,
} from "@/lib/comments-core";
import { commentRepository } from "@/lib/comments-repository";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";

function resultResponse(result: { status: number; body: Record<string, unknown> }) {
  return Response.json(result.body, { status: result.status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);
    const { documentId } = await params;
    return resultResponse(
      await listDocumentComments(commentRepository, documentId, user.id),
    );
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
    const body: unknown = await request.json().catch(() => null);
    return resultResponse(
      await createDocumentComment(
        commentRepository,
        documentId,
        user.id,
        body,
      ),
    );
  });
}
