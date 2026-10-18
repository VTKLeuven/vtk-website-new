import type { EventSignupLinkKind } from "@/lib/calendar/signupLink";
import { markdownToPlainText } from "@/lib/markdown";

/**
 * Het bericht dat een nieuw evenement in een Discord-kanaal wordt.
 *
 * Puur: geen database en geen fetch. De verzender (`lib/discord/posts.ts`), het
 * testbericht en de voorvertoning in het beheer roepen allemaal deze functie
 * aan, zodat wat je in het beheer ziet ook echt is wat er vertrekt.
 *
 * Eén embed in de kleur van de site (`--yellow`), met de banner groot eronder,
 * en eronder twee knoppen: de inschrijf- of ticketlink wanneer er een is, en
 * "Meer info" naar de eventpagina. De uren staan als Discord-tijdstempel
 * (`<t:...>`): Discord toont die in de taal en de tijdzone van wie leest, en
 * zet er "over 3 dagen" bij zonder dat het bericht veroudert.
 */

/** De naam waaronder het bericht in het kanaal staat. */
export const DISCORD_USERNAME = "VTK Kalender";

/** `--yellow` uit vtk-base.css, als getal zoals Discord het wil. */
export const DISCORD_EMBED_COLOUR = 0xffd23f;

/** Het schild, ook de avatar van het bericht. Pad op de site. */
export const DISCORD_AVATAR_PATH = "/vtk-shield-favicon.png";

export type DiscordLinkKind = EventSignupLinkKind;

/** Discord-limieten die we raken; daarboven weigert hij het hele bericht. */
const LIMITS = {
  title: 256,
  description: 4096,
  fieldValue: 1024,
  buttonLabel: 80,
} as const;

/** Hoe lang de beschrijving in het kanaal mag worden; de rest staat op de site. */
export const DISCORD_DESCRIPTION_MAX = 700;

/** Hoeveel losse momenten er voluit staan voor "en nog ..." het overneemt. */
const MOMENTS_SHOWN = 4;

const LINK_EMOJI: Record<DiscordLinkKind, string> = {
  tickets: "🎟️",
  form: "📝",
  link: "🔗",
};

export type DiscordEventPost = {
  title: string;
  /** De Nederlandse beschrijving, in de Markdown van de site. */
  description: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  /** De losse momenten van een reeks; leeg voor een gewoon evenement. */
  moments: readonly { start: Date; end: Date }[];
  location: string | null;
  organiser: string;
  /** Volledige URL van de banner, of `null` voor een post zonder foto. */
  imageUrl: string | null;
  /** Waar de titel en "Meer info" naartoe gaan (al dan niet via de klikteller). */
  infoUrl: string;
  /** De inschrijf- of ticketlink, al dan niet via de klikteller. */
  link: { kind: DiscordLinkKind; label: string; url: string } | null;
  /** De oorsprong van de site, voor relatieve links in de beschrijving. */
  siteOrigin: string;
};

export type DiscordEmbed = {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  image?: { url: string };
  footer?: { text: string; icon_url?: string };
};

export type DiscordButton = {
  type: 2;
  /** 5 = een linkknop; de enige soort die een gewone webhook mag sturen. */
  style: 5;
  label: string;
  url: string;
  emoji?: { name: string };
};

export type DiscordMessage = {
  username: string;
  avatar_url: string;
  content?: string;
  embeds?: DiscordEmbed[];
  components?: { type: 1; components: DiscordButton[] }[];
  /**
   * Altijd leeg: een beschrijving die een lid schreef, mag nooit `@everyone`
   * pingen, ook niet per ongeluk.
   */
  allowed_mentions: { parse: [] };
};

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function stamp(date: Date, style: "t" | "f" | "F" | "D" | "R"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

/** "2026-11-14" in Brusselse tijd: de kalenderdag waarop iets valt. */
function brusselsDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Korter dan dit is "tot 03:00" en geen volledige einddatum: een nachtfeest. */
const SAME_NIGHT_MS = 20 * 60 * 60 * 1000;

/**
 * Wanneer het doorgaat, als Discord-tijdstempels.
 *
 * Een heledagevenement krijgt enkel datums (een uur zou 00:00 zijn), een reeks
 * momenten elk moment op een eigen regel, en de rest een start met een einde.
 * Een einde binnen dezelfde nacht staat er als uur, niet als tweede datum: een
 * TD van 22u tot 3u is één avond.
 */
export function discordWhen(post: Pick<DiscordEventPost, "start" | "end" | "allDay" | "moments">): string {
  if (post.moments.length > 0) {
    const lines = post.moments
      .slice(0, MOMENTS_SHOWN)
      .map((moment) => `${stamp(moment.start, "F")} tot ${stamp(moment.end, "t")}`);
    const rest = post.moments.length - MOMENTS_SHOWN;
    if (rest > 0) lines.push(rest === 1 ? "en nog 1 moment" : `en nog ${rest} momenten`);
    return lines.join("\n");
  }
  if (post.allDay) {
    const sameDay = brusselsDay(post.start) === brusselsDay(post.end);
    const days = sameDay
      ? stamp(post.start, "D")
      : `${stamp(post.start, "D")} t.e.m. ${stamp(post.end, "D")}`;
    return `${days}\n${stamp(post.start, "R")}`;
  }
  const short = post.end.getTime() - post.start.getTime() <= SAME_NIGHT_MS;
  const until = short ? stamp(post.end, "t") : stamp(post.end, "F");
  return `${stamp(post.start, "F")} tot ${until}\n${stamp(post.start, "R")}`;
}

/**
 * De beschrijving zoals Discord ze kan tonen.
 *
 * Discord leest bijna dezelfde Markdown als de site, op drie dingen na: een
 * afbeelding toont hij niet (die valt weg), een kop wordt vette tekst, en een
 * relatieve link moet een volledige URL worden. Een lange tekst stopt aan het
 * einde van een alinea; de rest staat achter "Meer info".
 */
export function discordDescription(
  markdown: string | null,
  siteOrigin: string,
  max: number = DISCORD_DESCRIPTION_MAX,
): string {
  if (!markdown) return "";
  const text = markdown
    .replace(/\r\n/g, "\n")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<iframe[^>]*\/?>/gi, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^#{1,6}\s+(.+?)\s*#*\s*$/gm, "**$1**")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/\]\(\/(?!\/)/g, `](${siteOrigin}/`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= max) return text;

  const paragraphs = text.split(/\n{2,}/);
  let kept = "";
  for (const paragraph of paragraphs) {
    const next = kept ? `${kept}\n\n${paragraph}` : paragraph;
    if (next.length > max) break;
    kept = next;
  }
  if (kept) return `${kept}\n\n…`;

  // Al de eerste alinea is te lang. Midden in Markdown afknippen kan een link
  // of een vet stuk openlaten, dus dan wordt het platte tekst tot een woordgrens.
  const plain = markdownToPlainText(paragraphs[0] ?? "");
  return `${plain.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** Het bericht met knoppen; de standaard. */
export function discordEventMessage(
  post: DiscordEventPost,
  options: { avatarUrl: string; content?: string },
): DiscordMessage {
  const fields: NonNullable<DiscordEmbed["fields"]> = [
    { name: "Wanneer", value: clip(discordWhen(post), LIMITS.fieldValue), inline: false },
  ];
  if (post.location?.trim()) {
    fields.push({ name: "Waar", value: clip(post.location.trim(), LIMITS.fieldValue), inline: true });
  }
  fields.push({ name: "Organisator", value: clip(post.organiser, LIMITS.fieldValue), inline: true });

  const description = discordDescription(post.description, post.siteOrigin);
  const host = post.siteOrigin.replace(/^https?:\/\//, "");

  const buttons: DiscordButton[] = [];
  if (post.link) {
    buttons.push({
      type: 2,
      style: 5,
      label: clip(post.link.label, LIMITS.buttonLabel),
      url: post.link.url,
      emoji: { name: LINK_EMOJI[post.link.kind] },
    });
  }
  buttons.push({ type: 2, style: 5, label: "Meer info", url: post.infoUrl });

  return {
    username: DISCORD_USERNAME,
    avatar_url: options.avatarUrl,
    ...(options.content ? { content: options.content } : {}),
    embeds: [
      {
        title: clip(post.title, LIMITS.title),
        url: post.infoUrl,
        ...(description ? { description: clip(description, LIMITS.description) } : {}),
        color: DISCORD_EMBED_COLOUR,
        fields,
        ...(post.imageUrl ? { image: { url: post.imageUrl } } : {}),
        footer: { text: `${host}/kalender`, icon_url: options.avatarUrl },
      },
    ],
    components: [{ type: 1, components: buttons }],
    allowed_mentions: { parse: [] },
  };
}

/**
 * Hetzelfde bericht zonder knoppen, met de links als veld in de embed.
 *
 * Het vangnet voor wanneer Discord de knoppen weigert: een gewone webhook mag
 * linkknoppen sturen sinds `with_components`, maar wie dat ooit terugschroeft,
 * mag niet alle posts tegenhouden. Een geweigerd bericht is nooit gepost, dus
 * opnieuw sturen geeft geen dubbel.
 */
export function discordMessageWithoutButtons(message: DiscordMessage): DiscordMessage {
  const buttons = message.components?.flatMap((row) => row.components) ?? [];
  const { components: _components, ...rest } = message;
  void _components;
  if (buttons.length === 0 || !rest.embeds?.[0]) return rest;
  const links = buttons
    .map((button) => `${button.emoji ? `${button.emoji.name} ` : ""}[${button.label}](${button.url})`)
    .join("\n");
  const [first, ...others] = rest.embeds;
  return {
    ...rest,
    embeds: [{ ...first, fields: [...(first!.fields ?? []), { name: "Links", value: links }] }, ...others],
  };
}
