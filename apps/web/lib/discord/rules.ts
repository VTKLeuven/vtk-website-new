/**
 * Wanneer een evenement vanzelf in een Discord-kanaal verschijnt.
 *
 * Puur, zonder database: de worker, de bewaaractie en het beheerscherm lezen
 * dezelfde regels, en ze zijn te testen zonder Discord. Het posten zelf staat in
 * `lib/discord/posts.ts`; de kringkeuzes in docs/design-decisions.md.
 *
 * De regels:
 *
 * - **Gepubliceerd.** Een concept heeft geen publieke pagina om naar te linken.
 * - **Met een eigen banner.** Zonder affiche is een post een grijs blok tekst
 *   tussen de berichten; de banner is wat iemand doet stoppen met scrollen. Een
 *   evenement dat zonder banner gepubliceerd wordt, wacht dus, en verschijnt
 *   zodra de banner er later bij komt.
 * - **Gepubliceerd ná de webhook** (`autoSince`). Anders zou een nieuwe webhook
 *   in één klap de hele kalender in het kanaal gooien. Wat er al stond, post je
 *   met de hand.
 * - **Nog niet voorbij.** Een aankondiging van iets dat al gedaan is, is ruis.
 * - **Eén keer per kanaal**, wat er later ook verandert. Dat bewaakt niet deze
 *   functie maar de unieke sleutel op `DiscordWebhookPost`.
 */

export type DiscordAutoEvent = {
  /** `null` = concept. */
  publishedAt: Date | null;
  /** `null` = geen eigen banner. */
  imageKey: string | null;
  end: Date;
};

export type DiscordAutoWebhook = {
  enabled: boolean;
  autoSince: Date;
};

/** Waarom een evenement (nog) niet vanzelf vertrekt; `null` = het mag. */
export type DiscordWaitReason = "disabled" | "draft" | "past" | "before-webhook" | "banner";

export function discordWaitReason(
  event: DiscordAutoEvent,
  webhook: DiscordAutoWebhook,
  now: Date,
): DiscordWaitReason | null {
  if (!webhook.enabled) return "disabled";
  if (!event.publishedAt) return "draft";
  if (event.end.getTime() < now.getTime()) return "past";
  if (event.publishedAt.getTime() < webhook.autoSince.getTime()) return "before-webhook";
  // De banner als laatste: van de redenen hierboven is dit de enige die nog
  // vanzelf goedkomt, dus enkel dan zegt het beheer "wacht op banner".
  if (!event.imageKey) return "banner";
  return null;
}

export function discordAutoPostDue(
  event: DiscordAutoEvent,
  webhook: DiscordAutoWebhook,
  now: Date,
): boolean {
  return discordWaitReason(event, webhook, now) === null;
}

/**
 * Hoe vaak de worker een post opnieuw probeert wanneer Discord zelf zei dat er
 * niets gepost is (te veel verzoeken, een storing). Daarna blijft ze staan als
 * mislukt, met een knop om het met de hand opnieuw te proberen.
 */
export const DISCORD_MAX_ATTEMPTS = 3;

/**
 * Hoe lang een geclaimde post "onderweg" mag zijn. Langer betekent dat het
 * proces halverwege stopte: misschien kwam het bericht aan, misschien niet. Dat
 * lost niemand vanzelf op, want een tweede bericht is erger dan geen; het beheer
 * toont het als onderbroken en laat iemand in Discord gaan kijken.
 */
export const DISCORD_SENDING_STALE_MS = 10 * 60 * 1000;
