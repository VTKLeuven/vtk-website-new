import { headers } from "next/headers";
import { fetchRemoteSession } from "@vtk/auth/remote";
import { isMemberOfGroup, type SessionPayload } from "@vtk/auth";

export async function getSession(): Promise<SessionPayload | null> {
  const h = await headers();
  return fetchRemoteSession(h.get("cookie"));
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
