import { SESSION_COOKIE_NAME, type SessionPayload } from "./index";

// Used by submodule apps to verify a session against the main site.
// It forwards the cookie and expects a JSON SessionPayload back.
export async function fetchRemoteSession(
  cookieHeader: string | null | undefined
): Promise<SessionPayload | null> {
  if (!cookieHeader || !cookieHeader.includes(`${SESSION_COOKIE_NAME}=`)) return null;
  const mainUrl = process.env.VTK_MAIN_URL || "https://vtk.be";

  try {
    const res = await fetch(`${mainUrl}/api/auth/session`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionPayload;
  } catch {
    return null;
  }
}
