import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/session-core";
import { jsonError, withApiErrors } from "@/lib/http";
import { isPasswordWithinLimit } from "@/lib/password";

const schema = z.object({ email: z.email().trim().toLowerCase(), password: z.string().min(1).max(128) });

export async function POST(request: Request) {
  return withApiErrors(async () => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Enter your email and password.", 400);
  if (!isPasswordWithinLimit(parsed.data.password)) {
    return jsonError("Password must be 72 bytes or fewer.", 400);
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return jsonError("Email or password is incorrect.", 401);
  }

  const session = await createSession(user.id);
  const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return response;
  });
}