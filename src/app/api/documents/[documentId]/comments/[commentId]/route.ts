import {
  deleteDocumentComment,
  setDocumentCommentResolved,
} from "@/lib/comments-core";
import { commentRepository } from "@/lib/comments-repository";
import { getApiUser, jsonError, withApiErrors } from "@/lib/http";

function resultResponse(result: { status: number; body: Record<string, unknown> }) {
  return Response.json(result.body, { status: result.status });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string; commentId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);
    const { documentId, commentId } = await params;
    const body: unknown = await request.json().catch(() => null);
    return resultResponse(
      await setDocumentCommentResolved(
        commentRepository,
        documentId,
        commentId,
        user.id,
        body,
      ),
    );
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ documentId: string; commentId: string }> },
) {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);
    const { documentId, commentId } = await params;
    return resultResponse(
      await deleteDocumentComment(
        commentRepository,
        documentId,
        commentId,
        user.id,
      ),
    );
  });
}
