import type { PollQuestionKind } from "@/lib/pocPolls/core";
import { POLL_NO, POLL_SCORES, POLL_YES } from "@/lib/pocPolls/core";
import { DISCORD_EMBED_COLOUR, type DiscordEmbed } from "./eventMessage";

/**
 * De berichten van een peiling op Discord. Puur: de verzender, de afhandeling
 * van de knoppen en de voorvertoning in het beheer roepen allemaal deze functies
 * aan, zodat wat je daar ziet ook echt is wat er vertrekt.
 *
 * Bewust geen ingebouwde Discord-poll: daar is de tussenstand zichtbaar. Hier
 * staan knoppen onder het bericht, en het antwoord erop ziet enkel wie klikte.
 */

const EPHEMERAL = 64;
const SEPARATOR = "|";
const MODAL_FIELD = "antwoord";
const MODAL_LABEL_MAX = 45;
const MAX_OPEN_LENGTH = 2000;

export const PRIMARY = 1 as const;
export const SECONDARY = 2 as const;
export const LINK = 5 as const;

export type PollActionButton = { type: 2; style: 1 | 2; label: string; custom_id: string; disabled?: boolean };
export type PollLinkButton = { type: 2; style: 5; label: string; url: string; disabled?: boolean };
export type PollButton = PollActionButton | PollLinkButton;
export type PollActionRow = { type: 1; components: PollButton[] };

export type PollBotMessage = {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: PollActionRow[];
  flags?: number;
  allowed_mentions: { parse: [] };
};

export type DiscordPollQuestion = {
  id: string;
  kind: PollQuestionKind;
  text: string;
  low: string | null;
  high: string | null;
};

export type DiscordPollView = {
  id: string;
  title: string;
  pocName: string;
  closesAt: Date;
  /** `yyyy-mm-dd`. */
  meetingDate: string | null;
  siteOrigin: string;
  questions: DiscordPollQuestion[];
};

export type PollAction = "s" | "a" | "i" | "n" | "o" | "m";

export type ParsedPollCustomId = { pollId: string; action: PollAction; index: number; value: number | null };

/** Past ruim in de 100 tekens die Discord toelaat. */
export function pollCustomId(pollId: string, action: PollAction, index = 0, value?: number): string {
  return ["pp", pollId, action, index, value ?? ""].join(SEPARATOR);
}

export function parsePollCustomId(raw: unknown): ParsedPollCustomId | null {
  if (typeof raw !== "string") return null;
  const [prefix, pollId, action, index, value] = raw.split(SEPARATOR);
  if (prefix !== "pp" || !pollId || !["s", "a", "i", "n", "o", "m"].includes(action ?? "")) return null;
  const parsedIndex = Number(index);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return null;
  const parsedValue = value ? Number(value) : null;
  if (parsedValue !== null && !Number.isInteger(parsedValue)) return null;
  return { pollId, action: action as PollAction, index: parsedIndex, value: parsedValue };
}

function stamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function meetingLabel(meetingDate: string): string {
  return new Date(`${meetingDate}T12:00:00.000Z`).toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Brussels",
  });
}

function base(extra: Omit<PollBotMessage, "allowed_mentions">): PollBotMessage {
  return { ...extra, allowed_mentions: { parse: [] } };
}

function ephemeral(extra: Omit<PollBotMessage, "allowed_mentions" | "flags">): PollBotMessage {
  return base({ ...extra, flags: EPHEMERAL });
}

function legend(question: DiscordPollQuestion): string {
  const low = (question.low ?? "oneens").toLocaleLowerCase("nl-BE");
  const high = (question.high ?? "eens").toLocaleLowerCase("nl-BE");
  return `1 is ${low}, 5 is ${high}.`;
}

function closedKindOptions(question: DiscordPollQuestion): Array<{ value: number; label: string }> {
  return question.kind === "YES_NO"
    ? [
        { value: POLL_YES, label: "Ja" },
        { value: POLL_NO, label: "Nee" },
      ]
    : POLL_SCORES.map((score) => ({ value: score, label: String(score) }));
}

/** "Ja", "Nee" of "4 van 5", om een antwoord terug te zeggen. */
export function pollAnswerLabel(question: DiscordPollQuestion, value: number): string {
  if (question.kind === "YES_NO") return value === POLL_YES ? "Ja" : "Nee";
  return `${value} van 5`;
}

/** Eén vraag die je met een klik beantwoordt, kan rechtstreeks in het kanaal. */
export function pollAnswersInChannel(view: DiscordPollView): boolean {
  return view.questions.length === 1 && view.questions[0].kind !== "OPEN";
}

export function pollChannelMessage(view: DiscordPollView): PollBotMessage {
  const anonymous = "Anoniem: je RiVers zien enkel totalen en niemand ziet een tussenstand.";
  const openUntil = { name: "Open tot", value: stamp(view.closesAt), inline: true };

  if (pollAnswersInChannel(view)) {
    const question = view.questions[0];
    return base({
      embeds: [
        {
          author: { name: `POC ${view.pocName}` },
          title: question.text,
          description: question.kind === "SCORE" ? `${legend(question)}\n${anonymous}` : `Stem met de knoppen. ${anonymous}`,
          color: DISCORD_EMBED_COLOUR,
          fields: [openUntil],
        },
      ],
      components: [
        {
          type: 1,
          components: closedKindOptions(question).map((option) => ({
            type: 2,
            style: SECONDARY,
            label: option.label,
            custom_id: pollCustomId(view.id, "i", 0, option.value),
          })),
        },
      ],
    });
  }

  const count = view.questions.length;
  const what = count === 1 ? "Eén korte vraag" : `${count} korte vragen`;
  const forMeeting = view.meetingDate ? ` voor de POC van ${meetingLabel(view.meetingDate)}` : " voor de POC";
  return base({
    embeds: [
      {
        author: { name: `POC ${view.pocName}` },
        title: view.title,
        description: `${what} van je RiVers${forMeeting}. Duurt ongeveer een minuut.`,
        color: DISCORD_EMBED_COLOUR,
        fields: [openUntil, { name: "Anoniem", value: "Enkel totalen, geen tussenstand", inline: true }],
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: PRIMARY, label: "Start de peiling", custom_id: pollCustomId(view.id, "s") },
          { type: 2, style: LINK, label: "Invullen op vtk.be", url: `${view.siteOrigin}/#peiling` },
        ],
      },
    ],
  });
}

export function pollStepMessage(
  view: DiscordPollView,
  index: number,
  answer: { value: number | null; text: string | null } | undefined,
): PollBotMessage {
  const question = view.questions[index];
  const total = view.questions.length;
  const lines = [`Vraag ${index + 1} van ${total}`, `**${question.text}**`];
  if (question.kind === "SCORE") lines.push(legend(question));
  if (question.kind === "OPEN" && answer?.text) lines.push(`Je antwoord: ${answer.text}`);

  const options: PollButton[] =
    question.kind === "OPEN"
      ? [
          {
            type: 2,
            style: PRIMARY,
            label: answer?.text ? "Antwoord wijzigen" : "Antwoord geven",
            custom_id: pollCustomId(view.id, "o", index),
          },
        ]
      : closedKindOptions(question).map((option) => ({
          type: 2,
          style: answer?.value === option.value ? PRIMARY : SECONDARY,
          label: option.label,
          custom_id: pollCustomId(view.id, "a", index, option.value),
        }));

  const navigation: PollButton[] = [];
  if (index > 0) {
    navigation.push({ type: 2, style: SECONDARY, label: "Vorige", custom_id: pollCustomId(view.id, "n", index - 1) });
  }
  navigation.push({
    type: 2,
    style: SECONDARY,
    label: index === total - 1 ? "Klaar" : answer ? "Volgende" : "Overslaan",
    custom_id: pollCustomId(view.id, "n", index + 1),
  });

  return ephemeral({
    content: lines.join("\n"),
    components: [
      { type: 1, components: options },
      { type: 1, components: navigation },
    ],
  });
}

export function pollDoneMessage(): PollBotMessage {
  return ephemeral({
    content: "**Bedankt, je antwoorden zijn genoteerd.**\nAnoniem, en je kan ze wijzigen tot de deadline.",
    components: [],
  });
}

export function pollInlineAnswerMessage(label: string): PollBotMessage {
  return ephemeral({
    content: `Genoteerd: **${label}**. Van gedacht veranderd? Klik gewoon op een andere knop, dat kan tot de deadline.`,
  });
}

export function pollLinkAccountMessage(url: string): PollBotMessage {
  return ephemeral({
    content:
      "**Koppel eerst je VTK-account**\nZo telt elke student één keer en krijg je enkel peilingen van je eigen richting. Je RiVers zien nooit wie je bent. Eén keer doen volstaat.",
    components: [{ type: 1, components: [{ type: 2, style: LINK, label: "Koppelen op vtk.be", url }] }],
  });
}

export function pollNotForYouMessage(pocName: string, accountUrl: string): PollBotMessage {
  return ephemeral({
    content: `Deze peiling is voor studenten ${pocName}. Op je VTK-account staat een andere richting of fase.`,
    components: [{ type: 1, components: [{ type: 2, style: LINK, label: "Richting nakijken", url: accountUrl }] }],
  });
}

export function pollClosedNotice(): PollBotMessage {
  return ephemeral({ content: "Deze peiling is gesloten." });
}

export function pollBrokenNotice(): PollBotMessage {
  return ephemeral({ content: "Deze knop werkt niet meer." });
}

export type PollModal = {
  title: string;
  custom_id: string;
  components: Array<{
    type: 18;
    label: string;
    component: { type: 4; custom_id: string; style: 2; required: false; max_length: number; value?: string };
  }>;
};

export function pollOpenModal(view: DiscordPollView, index: number, current: string | null): PollModal {
  const question = view.questions[index];
  return {
    title: `Vraag ${index + 1} van ${view.questions.length}`,
    custom_id: pollCustomId(view.id, "m", index),
    components: [
      {
        type: 18,
        // Discord kapt hier af; een langere vraag staat al in het bericht erboven.
        label: question.text.length <= MODAL_LABEL_MAX ? question.text : "Jouw antwoord",
        component: {
          type: 4,
          custom_id: MODAL_FIELD,
          style: 2,
          required: false,
          max_length: MAX_OPEN_LENGTH,
          ...(current ? { value: current } : {}),
        },
      },
    ],
  };
}

/** Haalt het getypte antwoord uit een ingestuurde pop-up. */
export function pollModalValue(components: unknown): string | null {
  if (!Array.isArray(components)) return null;
  for (const entry of components) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as { custom_id?: unknown; value?: unknown; component?: unknown; components?: unknown };
    if (row.custom_id === MODAL_FIELD && typeof row.value === "string") return row.value;
    const nested = pollModalValue(row.component ? [row.component] : row.components);
    if (nested !== null) return nested;
  }
  return null;
}

/** Hetzelfde bericht na de deadline: geen actieve knoppen meer. */
export function pollClosedChannelMessage(
  view: DiscordPollView,
  voters: number,
  options: { summaryPublished: boolean; meetingAhead: boolean },
): PollBotMessage {
  const who = voters === 1 ? "1 student antwoordde" : `${voters} studenten antwoordden`;
  const next = options.summaryPublished
    ? " De samenvatting staat op de site."
    : options.meetingAhead && view.meetingDate
      ? ` De samenvatting volgt na de POC van ${meetingLabel(view.meetingDate)}.`
      : "";
  const single = pollAnswersInChannel(view);
  return base({
    embeds: [
      {
        author: { name: `POC ${view.pocName}` },
        title: single ? view.questions[0].text : view.title,
        description: `Afgesloten. ${who}.${next}`,
        color: 0x4e5058,
      },
    ],
    components: options.summaryPublished
      ? [{ type: 1, components: [{ type: 2, style: LINK, label: "Bekijk de samenvatting", url: `${view.siteOrigin}/#peiling` }] }]
      : single
        ? [
            {
              type: 1,
              components: closedKindOptions(view.questions[0]).map((option) => ({
                type: 2,
                style: SECONDARY,
                label: option.label,
                custom_id: pollCustomId(view.id, "i", 0, option.value),
                disabled: true,
              })),
            },
          ]
        : [],
  });
}
