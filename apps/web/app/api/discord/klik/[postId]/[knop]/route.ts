import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { absoluteHref, eventSignupLink, SIGNUP_LINK_SELECT } from "@/lib/calendar/signupLink";
import { siteUrl } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De knoppen onder een Discord-post lopen hierlangs: tellen, dan doorsturen.
 *
 * `knop` is `info` (de titel en "Meer info", naar de eventpagina) of `link` (de
 * inschrijf- of ticketlink). De bestemming wordt bij elke klik opnieuw
 * opgezocht: een ticketverkoop die intussen een andere slug kreeg, of een link
 * die verdween, komt zo niet op een 404 uit maar op de eventpagina.
 *
 * Een browser telt per knop één keer. Het cookie draagt geen identiteit, enkel
 * welke knoppen van deze ene post al geteld zijn, en het reist enkel mee naar
 * dit pad. Zo benadert het getal hoeveel mensen klikten, en niet hoe vaak
 * iemand op dezelfde knop drukte.
 */

const COOKIE = "vtk_discord";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Linkvoorbeelden en crawlers zijn geen mensen die klikten. */
const BOT = /bot|crawl|spider|preview|facebookexternalhit|embedly|slurp|curl|wget|python-requests|headless/i;

type Params = { params: Promise<{ postId: string; knop: string }> };

async function target(postId: string, knop: string): Promise<{ url: string; postId: string | null }> {
  const origin = siteUrl();
  const post = await prisma.discordWebhookPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      event: { select: { slug: true, publishedAt: true, ...SIGNUP_LINK_SELECT } },
    },
  });
  // Verwijderd of weer offline gehaald: dan de kalender, niet een 404.
  if (!post || !post.event.publishedAt) return { url: `${origin}/kalender`, postId: null };
  const eventPage = `${origin}/kalender/${post.event.slug}`;
  if (knop !== "link") return { url: eventPage, postId: post.id };
  const link = eventSignupLink(post.event, new Date());
  return { url: link ? absoluteHref(link.href, origin) : eventPage, postId: post.id };
}

export async function GET(request: Request, { params }: Params) {
  const { postId, knop } = await params;
  const button = knop === "link" ? "link" : "info";
  const { url, postId: counted } = await target(postId, button);
  const response = NextResponse.redirect(url, 307);
  if (!counted) return response;

  const cookieHeader = request.headers.get("cookie") ?? "";
  const seen = new Set(
    cookieHeader
      .split(/;\s*/)
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1)
      .split(".")
      .filter(Boolean) ?? [],
  );
  const bot = BOT.test(request.headers.get("user-agent") ?? "");
  if (seen.has(button) || bot) return response;

  // Een teller mag een doorverwijzing nooit tegenhouden.
  await prisma.discordWebhookPost
    .update({
      where: { id: counted },
      data: {
        ...(button === "link" ? { linkClicks: { increment: 1 } } : { infoClicks: { increment: 1 } }),
        lastClickAt: new Date(),
      },
    })
    .catch(() => {});

  seen.add(button);
  response.cookies.set(COOKIE, [...seen].sort().join("."), {
    path: `/api/discord/klik/${counted}`,
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: siteUrl().startsWith("https://"),
  });
  return response;
}

/** Een HEAD (een linkcontrole) stuurt door zonder te tellen. */
export async function HEAD(_request: Request, { params }: Params) {
  const { postId, knop } = await params;
  const { url } = await target(postId, knop === "link" ? "link" : "info");
  return NextResponse.redirect(url, 307);
}
