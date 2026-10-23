import { getApiUser, jsonError, withApiErrors } from "@/lib/http";

export async function GET() {
  return withApiErrors(async () => {
    const user = await getApiUser();
    if (!user) return jsonError("Sign in to continue.", 401);

    return Response.json({ user });
  });
}