import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import Link from "@/components/ui/Link";
import { ConfirmIconButton } from "@/components/ui/DeleteIconButton";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { SendIcon } from "@/components/ui/icons";
import { DiscordMessagePreview } from "@/components/admin/DiscordMessagePreview";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { discordPreview } from "@/lib/discord/posts";
import { DISCORD_SENDING_STALE_MS, discordWaitReason } from "@/lib/discord/rules";
import { discordChannelUrl } from "@/lib/discord/webhookUrl";
import { postEventToDiscordAction } from "@/app/actions/discord";
import { FilterPill } from "../FilterPill";
import { AddWebhook } from "./AddWebhook";
import { WebhookCard } from "./WebhookCard";

/**
 * De Discord-kanalen van de kalender: welke er zijn, wat ze opleverden, en per
 * kanaal wat er gepost is en wat nog niet.
 *
 * Voor wie alle evenementen beheert, zoals de categorieën. De webhook-URL
 * verlaat de server niet: de query hieronder vraagt hem bewust niet op.
 */
export default async function AdminDiscordWebhooks({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kanaal?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const session = await requireSession();
  if (!session.user.isSuperAdmin && !hasPermission(session, "calendar.manageAll")) {
    return <p>{nl ? "Geen toegang." : "No access."}</p>;
  }

  const now = new Date();
  const tag = nl ? "nl-BE" : "en-GB";
  const zone = "Europe/Brussels";
  const stampFmt = new Intl.DateTimeFormat(tag, {
    timeZone: zone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayFmt = new Intl.DateTimeFormat(tag, { timeZone: zone, weekday: "short", day: "numeric", month: "short" });
  const timeFmt = new Intl.DateTimeFormat(tag, { timeZone: zone, hour: "2-digit", minute: "2-digit" });

  const [webhooks, stats, preview] = await Promise.all([
    prisma.discordWebhook.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        enabled: true,
        autoSince: true,
        discordName: true,
        channelId: true,
        guildId: true,
        lastError: true,
        lastErrorAt: true,
      },
    }),
    prisma.discordWebhookPost.groupBy({
      by: ["webhookId"],
      where: { status: "SENT" },
      _count: { _all: true },
      _sum: { infoClicks: true, linkClicks: true },
    }),
    discordPreview(now),
  ]);

  const kanaal = (await searchParams).kanaal;
  const selected = webhooks.find((webhook) => webhook.id === kanaal) ?? webhooks[0] ?? null;

  const [posted, waiting] = selected
    ? await Promise.all([
        prisma.discordWebhookPost.findMany({
          where: { webhookId: selected.id, status: "SENT" },
          orderBy: { postedAt: "desc" },
          take: 100,
          select: {
            id: true,
            trigger: true,
            postedAt: true,
            linkLabel: true,
            infoClicks: true,
            linkClicks: true,
            event: { select: { id: true, titleNl: true, start: true, allDay: true } },
          },
        }),
        prisma.calendarEvent.findMany({
          where: {
            publishedAt: { not: null },
            end: { gte: now },
            discordPosts: { none: { webhookId: selected.id, status: "SENT" } },
          },
          orderBy: { start: "asc" },
          take: 100,
          select: {
            id: true,
            titleNl: true,
            start: true,
            end: true,
            allDay: true,
            imageKey: true,
            publishedAt: true,
            group: { select: { nameNl: true, nameEn: true } },
            discordPosts: {
              where: { webhookId: selected.id },
              select: { status: true, error: true, updatedAt: true },
            },
          },
        }),
      ])
    : [[], []];

  const maxClicks = Math.max(1, ...posted.map((post) => post.infoClicks + post.linkClicks));

  function whenLabel(event: { start: Date; allDay: boolean }): string {
    return event.allDay
      ? `${dayFmt.format(event.start)}, ${nl ? "hele dag" : "all day"}`
      : `${dayFmt.format(event.start)}, ${timeFmt.format(event.start)}`;
  }

  type Stand = { label: string; tone: "ok" | "wait" | "muted" | "danger"; detail?: string; busy?: boolean };
  function stand(event: (typeof waiting)[number]): Stand {
    const row = event.discordPosts[0];
    if (row?.status === "SENDING" && now.getTime() - row.updatedAt.getTime() < DISCORD_SENDING_STALE_MS) {
      return { label: nl ? "Onderweg" : "Sending", tone: "wait", busy: true };
    }
    if (row) {
      return { label: nl ? "Mislukt" : "Failed", tone: "danger", detail: row.error ?? undefined };
    }
    switch (discordWaitReason(event, selected!, now)) {
      case null:
        return { label: nl ? "Wordt zo gepost" : "Posting shortly", tone: "ok" };
      case "banner":
        return {
          label: nl ? "Wacht op banner" : "Waiting for banner",
          tone: "wait",
          detail: nl ? "Gaat vanzelf zodra er een banner op staat." : "Goes out once it has a banner.",
        };
      case "before-webhook":
        return { label: nl ? "Van voor deze webhook" : "From before this webhook", tone: "muted" };
      case "disabled":
        return { label: nl ? "Vanzelf posten staat uit" : "Automatic posting is off", tone: "muted" };
      default:
        return { label: "-", tone: "muted" };
    }
  }

  const toneClass: Record<Stand["tone"], string> = {
    ok: "bg-[var(--ok-bg)] text-[var(--ok-ink)]",
    wait: "bg-vtk-warn-soft text-vtk-warn",
    muted: "border border-vtk-blue/15 text-vtk-muted",
    danger: "bg-vtk-danger-soft text-vtk-danger",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${base}/admin/kalender`} className="text-sm text-vtk-muted hover:underline">
          ← {nl ? "Evenementen" : "Events"}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-vtk-ink">Discord webhooks</h1>
        <p className="mt-1 max-w-2xl text-sm text-vtk-muted">
          {nl
            ? "Nieuwe evenementen met een banner verschijnen vanzelf in deze kanalen, als VTK Kalender met het schild. Elk evenement komt hoogstens één keer in een kanaal: een latere wijziging aan titel, banner of beschrijving post niets opnieuw."
            : "New events with a banner appear in these channels by themselves, as VTK Kalender with the shield. Each event appears in a channel at most once: a later change to the title, banner or description does not post again."}
        </p>
      </div>

      {webhooks.map((webhook) => {
        const stat = stats.find((row) => row.webhookId === webhook.id);
        return (
          <WebhookCard
            key={webhook.id}
            locale={locale}
            webhook={{
              id: webhook.id,
              name: webhook.name,
              enabled: webhook.enabled,
              autoSinceLabel: stampFmt.format(webhook.autoSince),
              discordName: webhook.discordName,
              channelUrl: discordChannelUrl(webhook.guildId, webhook.channelId),
              lastError: webhook.lastError,
              lastErrorLabel: webhook.lastErrorAt ? stampFmt.format(webhook.lastErrorAt) : null,
              posts: stat?._count._all ?? 0,
              infoClicks: stat?._sum.infoClicks ?? 0,
              linkClicks: stat?._sum.linkClicks ?? 0,
            }}
          />
        );
      })}

      <AddWebhook locale={locale} startOpen={webhooks.length === 0} />

      {selected ? (
        <section className="space-y-4" aria-labelledby="discord-events">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="discord-events" className="text-lg font-semibold text-vtk-ink">
              {nl ? "Evenementen in" : "Events in"} {selected.name}
            </h2>
            {webhooks.length > 1 ? (
              <nav className="flex flex-wrap gap-2" aria-label={nl ? "Kanaal" : "Channel"}>
                {webhooks.map((webhook) => (
                  <FilterPill
                    key={webhook.id}
                    href={`${base}/admin/kalender/discord?kanaal=${webhook.id}`}
                    active={webhook.id === selected.id}
                  >
                    {webhook.name}
                  </FilterPill>
                ))}
              </nav>
            ) : null}
          </div>

          <Card className="overflow-hidden">
            <div className="px-4 pb-3 pt-4">
              <h3 className="font-semibold text-vtk-ink">{nl ? "Nog niet gepost" : "Not posted yet"}</h3>
              <p className="text-xs text-vtk-muted">
                {nl
                  ? "Aankomende, gepubliceerde evenementen die nog niet in dit kanaal staan."
                  : "Upcoming, published events that are not in this channel yet."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-vtk-blue-soft text-left">
                  <tr>
                    <th className="px-4 py-2">{nl ? "Evenement" : "Event"}</th>
                    {/* Smal staat de datum onder de titel: anders schuift de
                        postknop, de handeling van deze tabel, uit beeld. */}
                    <th className="hidden px-4 py-2 sm:table-cell">{nl ? "Wanneer" : "When"}</th>
                    <th className="px-4 py-2">{nl ? "Stand" : "Status"}</th>
                    <th className="px-4 py-2 text-right">
                      <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((event) => {
                    const current = stand(event);
                    return (
                      <LinkedRow
                        key={event.id}
                        href={`${base}/admin/kalender/${event.id}`}
                        className="cursor-pointer border-t border-zinc-200 align-top transition-colors hover:bg-vtk-blue-soft/40"
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`${base}/admin/kalender/${event.id}`}
                            className="font-medium text-vtk-ink hover:underline"
                          >
                            {event.titleNl}
                          </Link>
                          <span className="block text-xs text-vtk-muted">
                            {nl ? event.group.nameNl : event.group.nameEn}
                            {event.imageKey ? null : nl ? ", nog zonder banner" : ", no banner yet"}
                          </span>
                          <span className="block text-xs tabular-nums text-vtk-muted sm:hidden">{whenLabel(event)}</span>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-2 tabular-nums text-vtk-body sm:table-cell">
                          {whenLabel(event)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass[current.tone]}`}
                          >
                            {current.label}
                          </span>
                          {current.detail ? (
                            <span className="mt-1 block max-w-xs text-xs text-vtk-muted">{current.detail}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end">
                            {current.busy ? null : (
                              <ConfirmIconButton
                                label={nl ? "Nu posten" : "Post now"}
                                srLabel={`${nl ? "Nu posten" : "Post now"}: ${event.titleNl}`}
                                icon={<SendIcon />}
                                action={postEventToDiscordAction}
                                fields={{ webhookId: selected.id, eventId: event.id }}
                                title={nl ? `Posten in ${selected.name}?` : `Post in ${selected.name}?`}
                                description={
                                  nl
                                    ? `"${event.titleNl}" verschijnt dan als VTK Kalender in het kanaal. Dat gebeurt één keer: wijzig je het evenement later nog, dan blijft het bericht in Discord zoals het nu is.${
                                        event.imageKey
                                          ? ""
                                          : " Het evenement heeft nog geen eigen banner, dus de post krijgt de standaardfoto van zijn thema."
                                      }`
                                    : `"${event.titleNl}" then appears as VTK Kalender in the channel. That happens once: if you change the event later, the message in Discord stays as it is now.${
                                        event.imageKey
                                          ? ""
                                          : " The event has no banner of its own yet, so the post gets the default photo of its theme."
                                      }`
                                }
                                confirmLabel={nl ? "Posten" : "Post"}
                                cancelLabel={nl ? "Annuleren" : "Cancel"}
                                successMessage={nl ? `Gepost in ${selected.name}` : `Posted in ${selected.name}`}
                                errorMessages={{
                                  ALREADY_POSTED: nl
                                    ? "Dit evenement staat al in dat kanaal."
                                    : "This event is already in that channel.",
                                  POST_IN_PROGRESS: nl
                                    ? "Dit evenement wordt net gepost. Ververs de pagina over een paar seconden."
                                    : "This event is being posted right now. Refresh the page in a few seconds.",
                                  NOT_PUBLISHED: nl
                                    ? "Een concept kan niet gepost worden: publiceer het evenement eerst."
                                    : "A draft cannot be posted: publish the event first.",
                                }}
                                errorFallback={
                                  nl ? "Het evenement kon niet gepost worden." : "The event could not be posted."
                                }
                              />
                            )}
                          </div>
                        </td>
                      </LinkedRow>
                    );
                  })}
                  {waiting.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-vtk-muted">
                        {nl
                          ? "Alles wat eraan komt, staat al in dit kanaal."
                          : "Everything coming up is already in this channel."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-4 pb-3 pt-4">
              <h3 className="font-semibold text-vtk-ink">{nl ? "Gepost" : "Posted"}</h3>
              <p className="text-xs text-vtk-muted">
                {nl
                  ? "Een browser telt per knop één keer, dus de kliks benaderen het aantal mensen."
                  : "A browser counts once per button, so the clicks approximate the number of people."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-vtk-blue-soft text-left">
                  <tr>
                    <th className="px-4 py-2">{nl ? "Evenement" : "Event"}</th>
                    <th className="hidden px-4 py-2 sm:table-cell">{nl ? "Gepost" : "Posted"}</th>
                    <th className="px-4 py-2 text-right">{nl ? "Meer info" : "More info"}</th>
                    <th className="px-4 py-2 text-right">{nl ? "Inschrijven of tickets" : "Sign-up or tickets"}</th>
                    <th className="px-4 py-2">{nl ? "Kliks" : "Clicks"}</th>
                  </tr>
                </thead>
                <tbody>
                  {posted.map((post) => {
                    const total = post.infoClicks + post.linkClicks;
                    return (
                      <LinkedRow
                        key={post.id}
                        href={`${base}/admin/kalender/${post.event.id}`}
                        className="cursor-pointer border-t border-zinc-200 align-top transition-colors hover:bg-vtk-blue-soft/40"
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`${base}/admin/kalender/${post.event.id}`}
                            className="font-medium text-vtk-ink hover:underline"
                          >
                            {post.event.titleNl}
                          </Link>
                          <span className="block text-xs text-vtk-muted">{whenLabel(post.event)}</span>
                          {post.postedAt ? (
                            <span className="block text-xs text-vtk-muted sm:hidden">
                              {nl ? "Gepost" : "Posted"} {stampFmt.format(post.postedAt)}
                            </span>
                          ) : null}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-2 tabular-nums text-vtk-body sm:table-cell">
                          {post.postedAt ? stampFmt.format(post.postedAt) : "-"}
                          <span className="block text-xs text-vtk-muted">
                            {post.trigger === "AUTO"
                              ? nl
                                ? "vanzelf"
                                : "automatically"
                              : nl
                                ? "met de hand"
                                : "by hand"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-vtk-body">{post.infoClicks}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-vtk-body">
                          {post.linkLabel ? (
                            <>
                              {post.linkClicks}
                              <span className="block text-xs text-vtk-muted">{post.linkLabel}</span>
                            </>
                          ) : (
                            <span className="text-xs text-vtk-muted">{nl ? "geen knop" : "no button"}</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-vtk-blue-soft sm:block" aria-hidden>
                              <span
                                className="block h-full rounded-full bg-vtk-yellow"
                                style={{ width: `${(total / maxClicks) * 100}%` }}
                              />
                            </span>
                            <span className="font-semibold tabular-nums text-vtk-ink">{total}</span>
                          </div>
                        </td>
                      </LinkedRow>
                    );
                  })}
                  {posted.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-vtk-muted">
                        {nl ? "Nog niets gepost in dit kanaal." : "Nothing posted in this channel yet."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-vtk-ink">
            {nl ? "Zo ziet een post eruit" : "What a post looks like"}
          </h2>
          <p className="mt-1 text-sm text-vtk-muted">
            {preview
              ? nl
                ? `Met "${preview.eventTitle}", het eerstvolgende evenement, opgebouwd zoals een echte post. De knoppen hier tellen niet mee.`
                : `With "${preview.eventTitle}", the next event, built like a real post. The buttons here are not counted.`
              : nl
                ? "Er staat nog geen aankomend evenement in de kalender om als voorbeeld te tonen."
                : "There is no upcoming event in the calendar to show as an example yet."}
          </p>
        </div>
        {preview ? <DiscordMessagePreview message={preview.message} now={now} /> : null}
      </Card>
    </div>
  );
}
