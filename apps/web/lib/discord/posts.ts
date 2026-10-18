import "server-only";

import * as Sentry from "@sentry/nextjs";
import { Prisma, type DiscordPostTrigger } from "@prisma/client";
import { prisma } from "@vtk/db";
import { organiserName } from "@/lib/calendar/organiser";
import { defaultEventImageFor, eventCategorySlugs, getDefaultEventImages } from "@/lib/defaultEventImage";
import { siteUrl } from "@/lib/seo";
import { publicUrl } from "@/lib/storage";
import { sendDiscordMessage, type DiscordSendResult } from "./client";
import { absoluteHref, eventSignupLink, SIGNUP_LINK_SELECT, type EventSignupLink } from "@/lib/calendar/signupLink";
import {
  DISCORD_AVATAR_PATH,
  DISCORD_USERNAME,
  discordEventMessage,
  type DiscordEventPost,
  type DiscordMessage,
} from "./eventMessage";
import { DISCORD_MAX_ATTEMPTS, DISCORD_SENDING_STALE_MS, discordAutoPostDue } from "./rules";

/**
 * Evenementen naar Discord posten: vanzelf na het bewaren, vanuit de worker als
 * vangnet, en met de hand vanuit /admin/kalender/discord.
 *
 * Steeds eerst claimen en dan pas versturen. De claim is de rij in
 * `DiscordWebhookPost`, met een unieke sleutel op (kanaal, evenement): de
 * bewaaractie en de worker kunnen tegelijk wakker worden, en een evenement dat
 * twee keer in een kanaal verschijnt, is precies wat dit moet voorkomen. De
 * regels over wannéér staan in `rules.ts`, het bericht zelf in
 * `eventMessage.ts`.
 */

const EVENT_SELECT = {
  id: true,
  slug: true,
  titleNl: true,
  descriptionNl: true,
  start: true,
  end: true,
  allDay: true,
  location: true,
  organiserName: true,
  imageKey: true,
  publishedAt: true,
  group: { select: { nameNl: true, nameEn: true } },
  moments: { select: { start: true, end: true }, orderBy: { start: "asc" } },
  categories: { select: { category: { select: { slug: true } } } },
  ...SIGNUP_LINK_SELECT,
} satisfies Prisma.CalendarEventSelect;

type DiscordEventRow = Prisma.CalendarEventGetPayload<{ select: typeof EVENT_SELECT }>;

export type DiscordButtonKind = "info" | "link";

/** De klikteller achter één knop van één post. */
export function discordClickUrl(origin: string, postId: string, button: DiscordButtonKind): string {
  return `${origin}/api/discord/klik/${postId}/${button}`;
}

function avatarUrl(origin: string): string {
  return `${origin}${DISCORD_AVATAR_PATH}`;
}

/**
 * Het evenement als Discord-post. Met `postId` lopen de knoppen via de
 * klikteller; zonder (het testbericht, de voorvertoning) gaan ze rechtstreeks,
 * zodat een test de cijfers niet vertekent.
 *
 * Een evenement zonder eigen banner (enkel met de hand te posten) krijgt de
 * standaardbanner van zijn thema, dezelfde foto als in de kalender.
 */
async function eventPost(
  event: DiscordEventRow,
  origin: string,
  now: Date,
  postId: string | null,
): Promise<{ post: DiscordEventPost; link: EventSignupLink | null }> {
  const link = eventSignupLink(event, now);
  let image = publicUrl(event.imageKey);
  if (!image) {
    image = defaultEventImageFor(await getDefaultEventImages(), eventCategorySlugs(event.categories));
  }
  return {
    link,
    post: {
      title: event.titleNl,
      description: event.descriptionNl,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      moments: event.moments,
      location: event.location,
      organiser: organiserName(event.organiserName, event.group, "nl"),
      imageUrl: absoluteHref(image, origin),
      infoUrl: postId ? discordClickUrl(origin, postId, "info") : `${origin}/kalender/${event.slug}`,
      link: link
        ? {
            kind: link.kind,
            label: link.label,
            url: postId ? discordClickUrl(origin, postId, "link") : absoluteHref(link.href, origin),
          }
        : null,
      siteOrigin: origin,
    },
  };
}

export type DiscordPostOutcome =
  | { kind: "sent" }
  | { kind: "failed"; message: string }
  | {
      kind: "skipped";
      reason: "not-due" | "already-sent" | "busy" | "not-published" | "missing";
    };

type Webhook = { id: string; url: string; enabled: boolean; autoSince: Date };

/**
 * De rij die dit evenement in dit kanaal opeist, of waarom dat niet kan.
 *
 * Vanzelf: enkel een nieuwe rij. Bestaat ze al, dan is het evenement hier al
 * gepost of onderweg, en dat is het einde van het verhaal, wat er sindsdien ook
 * aan veranderde.
 *
 * Met de hand: ook een mislukte of onderbroken rij mag opnieuw, want daar kijkt
 * iemand bewust naar. Enkel wat al gepost is of net onderweg, blijft staan.
 */
async function claim(
  webhookId: string,
  eventId: string,
  trigger: DiscordPostTrigger,
  now: Date,
): Promise<{ id: string } | DiscordPostOutcome> {
  if (trigger === "MANUAL") {
    const existing = await prisma.discordWebhookPost.findUnique({
      where: { webhookId_eventId: { webhookId, eventId } },
      select: { id: true, status: true, updatedAt: true },
    });
    if (existing) {
      if (existing.status === "SENT") return { kind: "skipped", reason: "already-sent" };
      const fresh = now.getTime() - existing.updatedAt.getTime() < DISCORD_SENDING_STALE_MS;
      if (existing.status === "SENDING" && fresh) return { kind: "skipped", reason: "busy" };
      // Voorwaardelijk op de stand die we net lazen: klikt iemand anders op
      // hetzelfde moment, dan wint er één.
      const { count } = await prisma.discordWebhookPost.updateMany({
        where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
        data: { status: "SENDING", trigger, error: null, retryable: false },
      });
      return count === 1 ? { id: existing.id } : { kind: "skipped", reason: "busy" };
    }
  }
  try {
    return await prisma.discordWebhookPost.create({
      data: { webhookId, eventId, trigger, status: "SENDING" },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { kind: "skipped", reason: trigger === "MANUAL" ? "busy" : "already-sent" };
    }
    throw error;
  }
}

/** Verstuurt een geclaimde post en schrijft de uitkomst weg. */
async function deliver(
  postId: string,
  webhook: Webhook,
  event: DiscordEventRow,
  now: Date,
): Promise<DiscordPostOutcome> {
  const origin = siteUrl();
  let built: Awaited<ReturnType<typeof eventPost>>;
  try {
    built = await eventPost(event, origin, now, postId);
  } catch (error) {
    // Er is nog niets vertrokken, dus opnieuw proberen is veilig.
    await prisma.discordWebhookPost.update({
      where: { id: postId },
      data: { status: "FAILED", retryable: true, error: "Het bericht kon niet opgesteld worden." },
    });
    throw error;
  }

  const result = await sendDiscordMessage(
    webhook.url,
    discordEventMessage(built.post, { avatarUrl: avatarUrl(origin) }),
  );
  const link = { linkKind: built.link?.kind ?? null, linkLabel: built.link?.label ?? null };

  if (result.ok) {
    await prisma.discordWebhookPost.update({
      where: { id: postId },
      data: {
        ...link,
        status: "SENT",
        messageId: result.messageId,
        postedAt: now,
        attempts: { increment: 1 },
        error: null,
        retryable: false,
      },
    });
    await rememberOutcome(webhook.id, result);
    return { kind: "sent" };
  }

  await prisma.discordWebhookPost.update({
    where: { id: postId },
    data: {
      ...link,
      status: "FAILED",
      attempts: { increment: 1 },
      error: result.message,
      retryable: result.retryable,
    },
  });
  await rememberOutcome(webhook.id, result);
  return { kind: "failed", message: result.message };
}

/** De laatste fout van een webhook, of weer niets zodra er iets lukt. */
async function rememberOutcome(webhookId: string, result: DiscordSendResult): Promise<void> {
  if (result.ok) {
    await prisma.discordWebhook.updateMany({
      where: { id: webhookId, lastError: { not: null } },
      data: { lastError: null, lastErrorAt: null },
    });
    return;
  }
  // Te veel berichten kort na elkaar is geen fout aan de webhook; de worker
  // probeert het gewoon opnieuw.
  if (result.status === 429) return;
  await prisma.discordWebhook.update({
    where: { id: webhookId },
    data: { lastError: result.message, lastErrorAt: new Date() },
  });
}

/** Eén evenement in één kanaal. */
export async function postEventToWebhook({
  webhookId,
  eventId,
  trigger,
  now = new Date(),
}: {
  webhookId: string;
  eventId: string;
  trigger: DiscordPostTrigger;
  now?: Date;
}): Promise<DiscordPostOutcome> {
  const [webhook, event] = await Promise.all([
    prisma.discordWebhook.findUnique({
      where: { id: webhookId },
      select: { id: true, url: true, enabled: true, autoSince: true },
    }),
    prisma.calendarEvent.findUnique({ where: { id: eventId }, select: EVENT_SELECT }),
  ]);
  if (!webhook || !event) return { kind: "skipped", reason: "missing" };
  if (!event.publishedAt) return { kind: "skipped", reason: "not-published" };
  if (trigger === "AUTO" && !discordAutoPostDue(event, webhook, now)) {
    return { kind: "skipped", reason: "not-due" };
  }

  const claimed = await claim(webhook.id, event.id, trigger, now);
  if ("kind" in claimed) return claimed;
  return deliver(claimed.id, webhook, event, now);
}

/**
 * Na het bewaren van een evenement: post het in elk kanaal waar het nu vanzelf
 * hoort. Loopt via `after()`, dus de bewaring wacht er niet op, en een fout hier
 * komt in de logs en niet bij wie bewaarde; de worker haalt het dan in.
 */
export async function autoPostEventToDiscord(eventId: string): Promise<void> {
  try {
    const event = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
      select: { publishedAt: true, imageKey: true },
    });
    // De snelle weg voor het gewone geval: een concept of nog geen banner.
    if (!event?.publishedAt || !event.imageKey) return;
    const webhooks = await prisma.discordWebhook.findMany({
      where: { enabled: true, autoSince: { lte: event.publishedAt } },
      select: { id: true },
    });
    for (const webhook of webhooks) {
      await postEventToWebhook({ webhookId: webhook.id, eventId, trigger: "AUTO" });
    }
  } catch (error) {
    console.error("[discord] evenement kon niet gepost worden", error);
    Sentry.captureException(error);
  }
}

/** Hoeveel nieuwe posts één ronde van de worker hoogstens per kanaal verstuurt. */
const BATCH_PER_WEBHOOK = 10;

/** Na een mislukte poging wacht de volgende minstens zo lang. */
const RETRY_AFTER_MS = 4 * 60 * 1000;

/**
 * Het vangnet, elke vijf minuten vanuit /api/background/maintenance.
 *
 * Drie dingen: wat vanzelf had moeten vertrekken maar nog niet vertrok (de
 * bewaring liep vast, of het evenement kwam via een andere weg binnen), wat
 * Discord tijdelijk weigerde, en posts die halverwege bleven hangen. Die laatste
 * worden als onderbroken gemarkeerd en niet opnieuw verstuurd: misschien staan
 * ze al in het kanaal.
 */
export async function processDueDiscordPosts(
  now: Date = new Date(),
): Promise<{ sent: number; failed: number; interrupted: number }> {
  let sent = 0;
  let failed = 0;

  const stale = await prisma.discordWebhookPost.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(now.getTime() - DISCORD_SENDING_STALE_MS) } },
    data: {
      status: "FAILED",
      retryable: false,
      error: "Onderbroken tijdens het posten. Kijk in het kanaal of het bericht er staat, en post het anders opnieuw.",
    },
  });

  const webhooks = await prisma.discordWebhook.findMany({
    where: { enabled: true },
    select: { id: true, autoSince: true },
  });

  for (const webhook of webhooks) {
    const due = await prisma.calendarEvent.findMany({
      where: {
        publishedAt: { not: null, gte: webhook.autoSince },
        imageKey: { not: null },
        end: { gte: now },
        discordPosts: { none: { webhookId: webhook.id } },
      },
      select: { id: true },
      orderBy: { publishedAt: "asc" },
      take: BATCH_PER_WEBHOOK,
    });
    for (const event of due) {
      const outcome = await postEventToWebhook({ webhookId: webhook.id, eventId: event.id, trigger: "AUTO", now });
      if (outcome.kind === "sent") sent += 1;
      if (outcome.kind === "failed") failed += 1;
    }

    const retries = await prisma.discordWebhookPost.findMany({
      where: {
        webhookId: webhook.id,
        status: "FAILED",
        retryable: true,
        attempts: { lt: DISCORD_MAX_ATTEMPTS },
        updatedAt: { lte: new Date(now.getTime() - RETRY_AFTER_MS) },
        event: { publishedAt: { not: null }, end: { gte: now } },
      },
      select: { id: true, eventId: true },
      take: BATCH_PER_WEBHOOK,
    });
    for (const retry of retries) {
      const { count } = await prisma.discordWebhookPost.updateMany({
        where: { id: retry.id, status: "FAILED", retryable: true },
        data: { status: "SENDING" },
      });
      if (count === 0) continue;
      const [full, event] = await Promise.all([
        prisma.discordWebhook.findUniqueOrThrow({
          where: { id: webhook.id },
          select: { id: true, url: true, enabled: true, autoSince: true },
        }),
        prisma.calendarEvent.findUniqueOrThrow({ where: { id: retry.eventId }, select: EVENT_SELECT }),
      ]);
      const outcome = await deliver(retry.id, full, event, now);
      if (outcome.kind === "sent") sent += 1;
      if (outcome.kind === "failed") failed += 1;
    }
  }

  return { sent, failed, interrupted: stale.count };
}

/** De tekst boven een testbericht: niemand in het kanaal mag dit voor echt aanzien. */
const TEST_CONTENT =
  "🔧 Testbericht vanuit het beheer van vtk.be. Zo verschijnt een nieuw evenement in dit kanaal; dit bericht telt niet mee.";

/**
 * Het eerstvolgende evenement als voorbeeld: liefst een met banner, want zo
 * ziet een echte post eruit. `null` = er staat niets aankomends in de kalender.
 */
async function sampleEvent(now: Date): Promise<DiscordEventRow | null> {
  const upcoming = { publishedAt: { not: null }, end: { gte: now } } satisfies Prisma.CalendarEventWhereInput;
  return (
    (await prisma.calendarEvent.findFirst({
      where: { ...upcoming, imageKey: { not: null } },
      orderBy: { start: "asc" },
      select: EVENT_SELECT,
    })) ??
    (await prisma.calendarEvent.findFirst({ where: upcoming, orderBy: { start: "asc" }, select: EVENT_SELECT }))
  );
}

/**
 * Het bericht zoals het voorbeeld in het beheer het toont: het eerstvolgende
 * evenement, door dezelfde functie als een echte post, met rechtstreekse links.
 */
export async function discordPreview(now: Date = new Date()): Promise<{
  message: DiscordMessage;
  eventTitle: string;
} | null> {
  const event = await sampleEvent(now);
  if (!event) return null;
  const origin = siteUrl();
  const { post } = await eventPost(event, origin, now, null);
  return { message: discordEventMessage(post, { avatarUrl: avatarUrl(origin) }), eventTitle: event.titleNl };
}

/** Een testbericht naar één webhook. Telt niet mee en claimt niets. */
export async function sendDiscordTest(webhookId: string, now: Date = new Date()): Promise<DiscordSendResult> {
  const webhook = await prisma.discordWebhook.findUniqueOrThrow({
    where: { id: webhookId },
    select: { id: true, url: true },
  });
  const origin = siteUrl();
  const event = await sampleEvent(now);
  const message: DiscordMessage = event
    ? discordEventMessage((await eventPost(event, origin, now, null)).post, {
        avatarUrl: avatarUrl(origin),
        content: TEST_CONTENT,
      })
    : {
        username: DISCORD_USERNAME,
        avatar_url: avatarUrl(origin),
        content: `${TEST_CONTENT} Er staat nog geen aankomend evenement in de kalender om als voorbeeld te tonen.`,
        allowed_mentions: { parse: [] },
      };
  const result = await sendDiscordMessage(webhook.url, message);
  await rememberOutcome(webhook.id, result);
  return result;
}
