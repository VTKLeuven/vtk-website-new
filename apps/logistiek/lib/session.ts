import { headers } from "next/headers";
import { isMemberOfGroup, type SessionPayload } from "@vtk/auth";

export async function getSession(): Promise<SessionPayload | null> {
  const h = await headers();
  const cookie = h.get("cookie");
  if (!cookie) return null;

  const mainUrl = process.env.VTK_MAIN_URL || "https://vtk.be";

  try {
    const res = await fetch(`${mainUrl}/api/auth/session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionPayload;
  } catch {
    return null;
  }
}

export async function requireLogistiek(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  if (!session.user.isSuperAdmin && !isMemberOfGroup(session, "Logistiek")) {
    throw new Error("FORBIDDEN");
  }
  return session;
}
