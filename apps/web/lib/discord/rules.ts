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
 * - **Ten vroegste twee weken op voorhand.** Een evenement van over twee
 *   maanden zegt in het kanaal nog niemand iets, en tegen dat het eraan komt,
 *   is het bericht weggescrold. Het vertrekt dus wanneer het binnen de twee
 *   weken komt, ook wanneer het al lang online staat. Wat binnen de twee weken
 *   begint, vertrekt meteen bij het publiceren.
 * - **Met een eigen banner.** Zonder affiche is een post een grijs blok tekst
 *   tussen de berichten; de banner is wat iemand doet stoppen met scrollen. Een
 *   evenement zonder banner wacht dus, en verschijnt zodra de banner er bij komt.
 * - **Niet wat al klaarlag voor de webhook bestond** (`autoSince`). Een
 *   evenement is "nieuw" voor Discord op zijn `discordDueAt`: het publiceren,
 *   of twee weken voor de start als dat later is. Lag dat moment voor de
 *   webhook er was, dan post je het met de hand. Anders gooit een nieuwe
 *   webhook alles van de komende twee weken in één klap in het kanaal.
 * - **Nog niet voorbij.** Een aankondiging van iets dat al gedaan is, is ruis.
 * - **Eén keer per kanaal**, wat er later ook verandert. Dat bewaakt niet deze
 *   functie maar de unieke sleutel op `DiscordWebhookPost`.
 */

/** Hoe lang voor de start een evenement ten vroegste in het kanaal komt. */
export const DISCORD_LEAD_MS = 14 * 24 * 60 * 60 * 1000;

export type DiscordAutoEvent = {
  /** `null` = concept. */
  publishedAt: Date | null;
  /** `null` = geen eigen banner. */
  imageKey: string | null;
  start: Date;
  end: Date;
};

export type DiscordAutoWebhook = {
  enabled: boolean;
  autoSince: Date;
};

/**
 * Wanneer dit evenement voor Discord nieuw wordt: bij het publiceren, of twee
 * weken voor de start als dat later is. `null` voor een concept.
 */
export function discordDueAt(event: Pick<DiscordAutoEvent, "publishedAt" | "start">): Date | null {
  if (!event.publishedAt) return null;
  return new Date(Math.max(event.publishedAt.getTime(), event.start.getTime() - DISCORD_LEAD_MS));
}

/** Waarom een evenement (nog) niet vanzelf vertrekt; `null` = het mag. */
export type DiscordWaitReason = "disabled" | "draft" | "past" | "before-webhook" | "scheduled" | "banner";

export function discordWaitReason(
  event: DiscordAutoEvent,
  webhook: DiscordAutoWebhook,
  now: Date,
): DiscordWaitReason | null {
  if (!webhook.enabled) return "disabled";
  const dueAt = discordDueAt(event);
  if (!dueAt) return "draft";
  if (event.end.getTime() < now.getTime()) return "past";
  if (dueAt.getTime() < webhook.autoSince.getTime()) return "before-webhook";
  if (dueAt.getTime() > now.getTime()) return "scheduled";
  // De banner als laatste: van de redenen hierboven is dit de enige waar
  // iemand nog iets aan moet doen, dus enkel dan zegt het beheer "wacht op
  // banner". Een evenement dat nog gepland staat, kan zijn banner tegen dan
  // nog krijgen.
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
