import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getCurrentSession } from "@/lib/session";
import { getGoogleConfig } from "@/lib/google/config";
import { LINK_STATE_COOKIE, authorizeUrl } from "@/lib/google/oauthLink";

export const runtime = "nodejs";

/**
 * Start de koppeling met het `@vtk.be`-account: stuurt het ingelogde lid naar
 * Google.
 *
 * De `state` is een willekeurige waarde die we in een httpOnly-cookie zetten en
 * bij de terugkeer vergelijken. Wie het lid ís, halen we daar uit de sessie en
 * niet uit de state: dan kan een meegestuurde waarde nooit bepalen aan wie een
 * account gekoppeld wordt.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") === "en" ? "/en" : "";
  const back = `${url.origin}${locale}/koppel-vtk-account`;

  const session = await getCurrentSession();
  if (!session) return Response.redirect(`${url.origin}${locale}/inloggen`, 302);

  const cfg = await getGoogleConfig();
  const state = randomBytes(24).toString("base64url");
  const target = cfg ? authorizeUrl(cfg, url.origin, state) : null;
  if (!target) return Response.redirect(`${back}?fout=NOT_CONFIGURED`, 302);

  const jar = await cookies();
  jar.set(LINK_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: (await headers()).get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: 600,
  });

  return Response.redirect(target, 302);
}
