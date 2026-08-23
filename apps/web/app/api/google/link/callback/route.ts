import { cookies } from "next/headers";
import { prisma } from "@vtk/db";
import { getCurrentSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { getGoogleConfig } from "@/lib/google/config";
import { LINK_STATE_COOKIE, exchangeLinkCode } from "@/lib/google/oauthLink";

export const runtime = "nodejs";

/**
 * Terugkeer van Google: bewaart de koppeling tussen dit lid en zijn
 * `@vtk.be`-account.
 *
 * Elke uitkomst gaat terug naar `/koppel-vtk-account`, met een foutcode in de
 * URL. Die pagina zegt in gewone taal wat er misging; een kale foutpagina laat
 * iemand die per ongeluk zijn privé-Gmail koos, ratend achter.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") === "en" ? "/en" : "";
  const back = `${url.origin}${locale}/koppel-vtk-account`;
  const fail = (code: string, detail?: string) =>
    Response.redirect(
      `${back}?fout=${encodeURIComponent(code)}${detail ? `&adres=${encodeURIComponent(detail)}` : ""}`,
      302,
    );

  const session = await getCurrentSession();
  if (!session) return Response.redirect(`${url.origin}${locale}/inloggen`, 302);

  const jar = await cookies();
  const expected = jar.get(LINK_STATE_COOKIE)?.value;
  jar.delete(LINK_STATE_COOKIE);
  const state = url.searchParams.get("state");
  if (!expected || !state || expected !== state) return fail("STATE");

  // De gebruiker klikte "annuleren" bij Google.
  if (url.searchParams.get("error")) return fail("CANCELLED");
  const code = url.searchParams.get("code");
  if (!code) return fail("STATE");

  const cfg = await getGoogleConfig();
  if (!cfg) return fail("NOT_CONFIGURED");

  const result = await exchangeLinkCode(cfg, url.origin, code);
  if (!result.ok) return fail(result.reason, result.email);

  const { googleUserId, email } = result.identity;

  const taken = await prisma.user.findFirst({
    where: {
      id: { not: session.user.id },
      OR: [{ googleUserId }, { googleEmail: email }],
    },
    select: { id: true },
  });
  if (taken) return fail("ALREADY_LINKED", email);

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      googleUserId,
      googleEmail: email,
      googleLinkedAt: new Date(),
      googleLinkDeferredAt: null,
    },
  });
  await logAudit({
    action: "update",
    entity: "user",
    entityId: session.user.id,
    target: session.user.name,
    summary: `zelf gekoppeld aan het Google-account ${email}`,
  });

  return Response.redirect(`${back}?gekoppeld=1`, 302);
}
