/**
 * @author Witse Panneels
 * @date 2026-06-25
 *
 * better-auth server components, to be used on remote apps (@vtk/logistiek, ...)
 *
 * If you are working on the central app (@vtk/web), please do not use this file/these components, use ./server.ts instead!
 *
 * !do not import these into a client component!
 */
import 'server-only';
import { type SessionPayload } from './index';

/**
 * Used by submodule apps to verify a session against the main site.
 * It forwards the cookie and expects a JSON SessionPayload back.
 * */
export async function fetchSession(headers: Headers): Promise<SessionPayload | null> {
  const cookieHeader = headers.get('cookie');
  const mainUrl = process.env.VTK_MAIN_URL || 'https://vtk.be';

  if (!cookieHeader) return null;

  try {
    const res = await fetch(`${mainUrl}/api/auth/remote/session`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * The remote server kan ask @vtk/web over the internet, or through the internal docker network
 */
