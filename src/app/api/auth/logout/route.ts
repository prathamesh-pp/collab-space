import { NextResponse } from "next/server";
import { SESSION_COOKIE, revokeSession } from "@/lib/session-core";
import { cookies } from "next/headers";
import { withApiErrors } from "@/lib/http";

export async function POST() {
  return withApiErrors(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
  });
}