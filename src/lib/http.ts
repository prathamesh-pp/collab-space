import { getCurrentSession } from "@/lib/auth";

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function getApiUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function withApiErrors(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch {
    return jsonError("Request could not be completed. Please try again.", 500);
  }
}