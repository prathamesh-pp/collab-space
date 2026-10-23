import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/session-core";
import { jsonError } from "@/lib/http";

const schema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(10).max(128),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Enter a name, valid email, and password of at least 10 characters.", 400);
  if (new TextEncoder().encode(parsed.data.password).length > 72) {
    return jsonError("Password must be 72 bytes or fewer.", 400);
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
      });
      const workspace = await tx.workspace.create({
        data: { name: `${createdUser.name}'s workspace`, createdById: createdUser.id },
      });
      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: createdUser.id, role: "OWNER" },
      });
      await tx.document.create({
        data: { workspaceId: workspace.id, title: "Welcome to your workspace" },
      });
      return createdUser;
    });

    const session = await createSession(user.id);
    const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return jsonError("An account with this email already exists.", 409);
    return jsonError("Could not create your account. Check that the database is available.", 500);
  }
}