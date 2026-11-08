import "server-only";

/**
 * Praten met Discord als applicatie. De kalender gebruikt webhooks, maar die
 * kunnen geen knoppen met een actie sturen; daarom een eigen bot.
 * Zonder de variabelen hieronder staat Discord voor peilingen gewoon uit.
 */
const API = "https://discord.com/api/v10";
const TIMEOUT_MS = 10_000;

export type BotResult<T> = { ok: true; data: T } | { ok: false; status: number | null; message: string };

export function discordBotConfigured(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN?.trim() && process.env.DISCORD_PUBLIC_KEY?.trim());
}

async function request<T>(method: string, path: string, body?: unknown): Promise<BotResult<T>> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return { ok: false, status: null, message: "De Discord-bot is niet ingesteld." };
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: null, message: "Discord was niet bereikbaar." };
  }
  if (!response.ok) {
    const status = response.status;
    if (status === 403) return { ok: false, status, message: "De bot mag niet in dit kanaal posten." };
    if (status === 404) return { ok: false, status, message: "Dit kanaal of bericht bestaat niet meer op Discord." };
    if (status === 429) return { ok: false, status, message: "Discord vroeg om even te wachten." };
    return { ok: false, status, message: `Discord weigerde het bericht (${status}).` };
  }
  if (response.status === 204) return { ok: true, data: undefined as T };
  return { ok: true, data: (await response.json()) as T };
}

export function sendChannelMessage(channelId: string, message: unknown) {
  return request<{ id: string }>("POST", `/channels/${channelId}/messages`, message);
}

export function editChannelMessage(channelId: string, messageId: string, message: unknown) {
  return request<{ id: string }>("PATCH", `/channels/${channelId}/messages/${messageId}`, message);
}

export function deleteChannelMessage(channelId: string, messageId: string) {
  return request<void>("DELETE", `/channels/${channelId}/messages/${messageId}`);
}

/** De tekstkanalen van de studentendiscord, om er eentje te kiezen in het opstelscherm. */
export async function listDiscordChannels(): Promise<Array<{ id: string; name: string }> | null> {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  if (!guildId || !discordBotConfigured()) return null;
  const result = await request<Array<{ id: string; name: string; type: number; position: number }>>(
    "GET",
    `/guilds/${guildId}/channels`,
  );
  if (!result.ok) return null;
  return result.data
    .filter((channel) => channel.type === 0 || channel.type === 5)
    .sort((a, b) => a.position - b.position)
    .map(({ id, name }) => ({ id, name }));
}
