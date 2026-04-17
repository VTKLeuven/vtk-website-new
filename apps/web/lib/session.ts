import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  type SessionPayload,
  cookieDomain,
  hasPermission as _hasPermission,
} from "@vtk/auth";
import { getSessionByToken } from "@vtk/auth/server";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return getSessionByToken(token);
}

export async function requireSession(redirectTo = "/inloggen"): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect(redirectTo);
  return session;
}

export async function requirePermission(
  code: string,
  options?: { groupId?: string }
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!_hasPermission(session, code, options)) {
    redirect("/admin");
  }
  return session;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: cookieDomain(),
    expires: expiresAt,
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: cookieDomain(),
    maxAge: 0,
  });
}

export { SESSION_COOKIE_NAME };
