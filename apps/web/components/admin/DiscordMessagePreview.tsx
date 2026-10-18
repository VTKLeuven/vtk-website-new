import type { ReactNode } from "react";
import type { DiscordMessage } from "@/lib/discord/eventMessage";

/**
 * Een Discord-bericht zoals het in het kanaal staat, in het lichte thema van
 * Discord en met de kleuren van de site.
 *
 * Krijgt het échte bericht mee, uit `discordEventMessage`, en tekent dat na:
 * wie de tekst of de velden aanpast, ziet het hier meteen. Een eigen kopie van
 * de opmaak zou na de eerste wijziging afwijken (zie CLAUDE.md, "Wat je niet kan
 * zien").
 *
 * Discord toont tijdstempels (`<t:...>`) in de taal en tijdzone van wie leest;
 * hier is dat Nederlands in Brusselse tijd, gerekend vanaf `now`.
 */
export function DiscordMessagePreview({ message, now }: { message: DiscordMessage; now: Date }) {
  const embed = message.embeds?.[0];
  const buttons = message.components?.flatMap((row) => row.components) ?? [];
  const sentAt = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  return (
    <div className="vtk-admin-preview overflow-hidden rounded-2xl border border-vtk-blue/10 bg-[var(--surface)] p-4 text-[15px] leading-[1.375] text-[var(--ink)]">
      <div className="flex gap-3">
        {/* Dezelfde avatar die Discord ophaalt; een vast bestand, dus geen next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={message.avatar_url} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{message.username}</span>
            <span className="rounded-[3px] bg-[var(--discord-blurple)] px-1 py-px text-[10px] font-semibold leading-[14px] text-[var(--surface)]">
              APP
            </span>
            <span className="text-xs text-[var(--muted)]">Vandaag om {sentAt}</span>
          </div>

          {message.content ? <p className="mt-0.5 whitespace-pre-line">{inline(message.content, now)}</p> : null}

          {embed ? (
            <div className="mt-1.5 grid max-w-[520px] gap-2 rounded-[4px] border-l-4 border-[var(--yellow)] bg-[var(--paper)] py-3 pl-3 pr-4">
              {embed.title ? (
                <p className="font-semibold">
                  {embed.url ? (
                    <a href={embed.url} className="text-[var(--discord-link)] hover:underline" target="_blank" rel="noreferrer">
                      {embed.title}
                    </a>
                  ) : (
                    embed.title
                  )}
                </p>
              ) : null}
              {embed.description ? (
                <div className="whitespace-pre-line text-sm">{inline(embed.description, now)}</div>
              ) : null}
              {embed.fields?.length ? (
                <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                  {embed.fields.map((field) => (
                    <div key={field.name} className={field.inline ? "col-span-3 sm:col-span-1" : "col-span-3"}>
                      <dt className="font-semibold">{field.name}</dt>
                      <dd className="whitespace-pre-line">{inline(field.value, now)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {embed.image ? (
                // De banner zoals Discord hem ophaalt, op volle breedte van de embed.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={embed.image.url} alt="" className="mt-1 w-full rounded-[4px] object-cover" />
              ) : null}
              {embed.footer ? (
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  {embed.footer.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={embed.footer.icon_url} alt="" className="size-5 rounded-full object-contain" />
                  ) : null}
                  {embed.footer.text}
                </div>
              ) : null}
            </div>
          ) : null}

          {buttons.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {buttons.map((button) => (
                <a
                  key={button.label}
                  href={button.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-[var(--paper-2)] px-4 text-sm font-medium text-[var(--ink)] hover:brightness-95"
                >
                  {button.emoji ? <span aria-hidden>{button.emoji.name}</span> : null}
                  {button.label}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const TOKEN = /<t:(\d+):([tTdDfFR])>|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\n]+)\*|_([^_\n]+)_/g;

/** Het stukje Discord-Markdown dat onze posts gebruiken: vet, cursief, links en tijdstempels. */
function inline(text: string, now: Date): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const key = `${index}`;
    const [, seconds, style, bold, linkText, linkUrl, italic, underscore] = match;
    if (seconds && style) {
      nodes.push(
        <span key={key} className="rounded-[3px] bg-[var(--paper-2)] px-0.5">
          {timestamp(new Date(Number(seconds) * 1000), style, now)}
        </span>,
      );
    } else if (bold) {
      nodes.push(<strong key={key}>{inline(bold, now)}</strong>);
    } else if (linkText && linkUrl) {
      nodes.push(
        <a key={key} href={linkUrl} className="text-[var(--discord-link)] hover:underline" target="_blank" rel="noreferrer">
          {linkText}
        </a>,
      );
    } else if (italic || underscore) {
      nodes.push(<em key={key}>{italic ?? underscore}</em>);
    }
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function timestamp(date: Date, style: string, now: Date): string {
  const options: Intl.DateTimeFormatOptions = { timeZone: "Europe/Brussels" };
  switch (style) {
    case "t":
      return new Intl.DateTimeFormat("nl-BE", { ...options, hour: "2-digit", minute: "2-digit" }).format(date);
    case "T":
      return new Intl.DateTimeFormat("nl-BE", { ...options, timeStyle: "medium" }).format(date);
    case "d":
      return new Intl.DateTimeFormat("nl-BE", { ...options, dateStyle: "short" }).format(date);
    case "D":
      return new Intl.DateTimeFormat("nl-BE", { ...options, dateStyle: "long" }).format(date);
    case "f":
      return new Intl.DateTimeFormat("nl-BE", { ...options, dateStyle: "long", timeStyle: "short" }).format(date);
    case "F":
      return new Intl.DateTimeFormat("nl-BE", { ...options, dateStyle: "full", timeStyle: "short" }).format(date);
    default:
      return relative(date, now);
  }
}

function relative(date: Date, now: Date): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat("nl", { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(seconds, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 30 * 86_400) return format.format(Math.round(seconds / 86_400), "day");
  if (abs < 365 * 86_400) return format.format(Math.round(seconds / (30 * 86_400)), "month");
  return format.format(Math.round(seconds / (365 * 86_400)), "year");
}
