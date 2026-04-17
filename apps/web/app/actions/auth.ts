"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { SESSION_COOKIE_NAME } from "@vtk/auth";
import { createSession, destroySession, verifyPassword } from "@vtk/auth/server";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || ""),
    next: (formData.get("next") as string | null) ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.active) {
    return { error: "INVALID" };
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return { error: "INVALID" };
  }

  const { token, expiresAt } = await createSession({ userId: user.id });
  await setSessionCookie(token, expiresAt);

  const next = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/";
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await destroySession(token);
  }
  await clearSessionCookie();
  redirect("/");
}

const updateProfileSchema = z.object({
  name: z.string().min(1).max(200),
  locale: z.enum(["NL", "EN"]),
});

export async function updateProfileAction(userId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const parsed = updateProfileSchema.safeParse({
    name: String(formData.get("name") || ""),
    locale: String(formData.get("locale") || "NL"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await prisma.user.update({ where: { id: userId }, data: parsed.data });
  return { ok: true };
}
