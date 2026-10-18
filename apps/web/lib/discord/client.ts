import "server-only";

import { discordMessageWithoutButtons, type DiscordMessage } from "./eventMessage";

/**
 * De twee gesprekken met Discord: een bericht posten en een webhook opvragen.
 *
 * Elke uitkomst komt terug als waarde, nooit als throw: de beller moet het
 * verschil kennen tussen "Discord zei nee" (veilig om opnieuw te proberen, er
 * staat niets in het kanaal) en "geen antwoord" (misschien staat het er wel).
 */

const TIMEOUT_MS = 10_000;

export type DiscordFailure = {
  ok: false;
  /** De HTTP-status van Discord; `null` = geen antwoord. */
  status: number | null;
  /** Discord antwoordde dat er niets gepost is, en het kan later wel lukken. */
  retryable: boolean;
  /** Een volledige, Nederlandse zin voor het beheer. */
  message: string;
};

export type DiscordSendResult = { ok: true; messageId: string | null } | DiscordFailure;

export type DiscordWebhookInfo =
  | { ok: true; name: string | null; channelId: string | null; guildId: string | null }
  | DiscordFailure;

async function discordError(response: Response): Promise<DiscordFailure> {
  let detail = "";
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") detail = body.message;
  } catch {
    /* geen JSON; dan volstaat de status */
  }
  const status = response.status;
  if (status === 429) {
    return { ok: false, status, retryable: true, message: "Discord vroeg om even te wachten (te veel berichten kort na elkaar)." };
  }
  if (status >= 500) {
    return { ok: false, status, retryable: true, message: `Discord had een storing (${status}).` };
  }
  if (status === 404) {
    return { ok: false, status, retryable: false, message: "Deze webhook bestaat niet (meer) in Discord. Is hij daar verwijderd?" };
  }
  if (status === 401 || status === 403) {
    return { ok: false, status, retryable: false, message: "Discord weigert deze webhook: de URL klopt niet meer." };
  }
  return {
    ok: false,
    status,
    retryable: false,
    message: detail ? `Discord weigerde het bericht: ${detail} (${status}).` : `Discord weigerde het bericht (${status}).`,
  };
}

function noAnswer(error: unknown): DiscordFailure {
  const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  return {
    ok: false,
    status: null,
    retryable: false,
    message: timeout
      ? "Discord antwoordde niet op tijd. Kijk in het kanaal of het bericht er toch staat."
      : "Discord was niet bereikbaar. Kijk in het kanaal of het bericht er toch staat.",
  };
}

async function execute(url: string, message: DiscordMessage): Promise<DiscordSendResult> {
  // `wait=true` geeft het bericht terug, met zijn id; `with_components` laat
  // een gewone (niet aan een app gekoppelde) webhook linkknoppen sturen.
  const query = message.components?.length ? "?wait=true&with_components=true" : "?wait=true";
  let response: Response;
  try {
    response = await fetch(`${url}${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    return noAnswer(error);
  }
  if (!response.ok) return discordError(response);
  try {
    const body = (await response.json()) as { id?: unknown };
    return { ok: true, messageId: typeof body.id === "string" ? body.id : null };
  } catch {
    return { ok: true, messageId: null };
  }
}

/**
 * Post een bericht. Weigert Discord het met knoppen (400), dan gaat hetzelfde
 * bericht nog één keer weg met de links in de embed: een 400 is nooit gepost,
 * dus dat geeft geen dubbel.
 */
export async function sendDiscordMessage(url: string, message: DiscordMessage): Promise<DiscordSendResult> {
  const first = await execute(url, message);
  if (!first.ok && first.status === 400 && message.components?.length) {
    return execute(url, discordMessageWithoutButtons(message));
  }
  return first;
}

/** De webhook zoals Discord hem kent; vraagt geen login, enkel de URL. */
export async function fetchDiscordWebhookInfo(url: string): Promise<DiscordWebhookInfo> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    const failure = noAnswer(error);
    return { ...failure, message: "Discord was niet bereikbaar om de webhook na te kijken. Probeer het zo opnieuw." };
  }
  if (!response.ok) return discordError(response);
  try {
    const body = (await response.json()) as { name?: unknown; channel_id?: unknown; guild_id?: unknown };
    return {
      ok: true,
      name: typeof body.name === "string" ? body.name : null,
      channelId: typeof body.channel_id === "string" ? body.channel_id : null,
      guildId: typeof body.guild_id === "string" ? body.guild_id : null,
    };
  } catch {
    return { ok: true, name: null, channelId: null, guildId: null };
  }
}
