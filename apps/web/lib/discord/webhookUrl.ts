/**
 * Een Discord-webhook-URL lezen en gelijkschakelen.
 *
 * Discord geeft dezelfde webhook in een paar vormen: `discord.com` of het oude
 * `discordapp.com`, soms met `ptb.` of `canary.` ervoor (wie de testversie van
 * de app gebruikt), soms met een API-versie in het pad of een `?thread_id`
 * erachter. We bewaren er één vorm van, zodat de unieke sleutel op
 * `DiscordWebhook.url` ook echt een tweede kopie van hetzelfde kanaal tegenhoudt.
 *
 * Dit is meteen de enige plek die bepaalt waar de server naartoe post: enkel
 * naar discord.com. Een vrij adres zou van dit beheer een manier maken om de
 * server verzoeken te laten sturen naar wat je maar wil.
 */

const DISCORD_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "ptb.discord.com",
  "canary.discord.com",
  "ptb.discordapp.com",
  "canary.discordapp.com",
]);

const WEBHOOK_PATH = /^\/api(?:\/v\d+)?\/webhooks\/(\d{15,25})\/([A-Za-z0-9_-]{30,120})\/?$/;

export type DiscordWebhookUrl = {
  /** Het id van de webhook (een snowflake). Geen geheim. */
  id: string;
  /** De vaste vorm die we bewaren en waarnaar we posten. Wél een geheim. */
  url: string;
};

/** `null` = geen Discord-webhook, of niet in een vorm die we vertrouwen. */
export function parseDiscordWebhookUrl(raw: string): DiscordWebhookUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.port !== "" || parsed.username || parsed.password) {
    return null;
  }
  if (!DISCORD_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const match = WEBHOOK_PATH.exec(parsed.pathname);
  if (!match) return null;
  const [, id, token] = match;
  return { id: id!, url: `https://discord.com/api/webhooks/${id}/${token}` };
}

/** Het kanaal in Discord zelf, voor de knop "Open in Discord" in het beheer. */
export function discordChannelUrl(guildId: string | null, channelId: string | null): string | null {
  if (!guildId || !channelId) return null;
  if (!/^\d+$/.test(guildId) || !/^\d+$/.test(channelId)) return null;
  return `https://discord.com/channels/${guildId}/${channelId}`;
}
