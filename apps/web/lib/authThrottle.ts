import "server-only";

/**
 * Drempels op inloggen, registreren en de mails die een account verstuurt.
 *
 * Waarom hier en niet in better-auth: haar `rateLimit` draait enkel in de
 * HTTP-router (`onRequest`). Onze formulieren zijn server actions die
 * `auth.api.*` of eigen functies rechtstreeks aanroepen, en die komen daar nooit
 * langs. Zonder deze module kon wie een script schreef onbeperkt wachtwoorden
 * raden en iemands mailbox onbeperkt vullen met herstelmails.
 *
 * Twee soorten sleutels, om twee redenen:
 *
 * - **Per account** stopt het raden van één wachtwoord, ook vanaf duizend
 *   adressen. Dat telt enkel mislukte pogingen: wie zijn wachtwoord kent, merkt
 *   er niets van, en een geslaagde login wist de teller.
 * - **Per IP** stopt één bot die veel accounts afloopt. Ruim, want een aula
 *   deelt één publiek adres; de echte grens is die per account.
 *
 * In het geheugen van het proces, zoals het contactformulier en de publieke
 * formulieren: dit is een drempel, geen boekhouding. Een herstart wist de
 * tellers, en dat is aanvaardbaar.
 */

const MINUTE = 60 * 1000;

export const AUTH_LIMITS = {
  /** Mislukte logins op één account. */
  loginPerAccount: { max: 10, windowMs: 15 * MINUTE },
  /** Mislukte logins vanaf één adres, over alle accounts samen. */
  loginPerIp: { max: 100, windowMs: 15 * MINUTE },
  /** Nieuwe accounts vanaf één adres. */
  registerPerIp: { max: 10, windowMs: 60 * MINUTE },
  /** Herstel- en bevestigingsmails naar één adres. */
  mailPerAddress: { max: 3, windowMs: 60 * MINUTE },
  /** Herstel- en bevestigingsmails aangevraagd vanaf één adres. */
  mailPerIp: { max: 20, windowMs: 60 * MINUTE },
} as const;

type Limit = { max: number; windowMs: number };

/** Een schuivend venster per sleutel. */
export class SlidingWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: Limit,
    private readonly maxKeys = 10_000,
  ) {}

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((at) => now - at < this.limit.windowMs);
  }

  /** Zit het venster vol? Telt niets bij. */
  isFull(key: string, now: number = Date.now()): boolean {
    return this.recent(key, now).length >= this.limit.max;
  }

  /** Telt een poging, ook wanneer het venster al vol zit. */
  hit(key: string, now: number = Date.now()): void {
    const recent = this.recent(key, now);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.sweep(now);
  }

  /**
   * Telt een poging als er nog plaats is. `false` wanneer het venster vol zat;
   * dan telt er niets bij, zodat blijven kloppen de wachttijd niet verlengt.
   */
  take(key: string, now: number = Date.now()): boolean {
    if (this.isFull(key, now)) return false;
    this.hit(key, now);
    return true;
  }

  clear(key: string): void {
    this.hits.delete(key);
  }

  sweep(now: number = Date.now()): void {
    for (const [key, hits] of this.hits) {
      const recent = hits.filter((at) => now - at < this.limit.windowMs);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }

  reset(): void {
    this.hits.clear();
  }
}

type Limiters = {
  loginPerAccount: SlidingWindow;
  loginPerIp: SlidingWindow;
  registerPerIp: SlidingWindow;
  mailPerAddress: SlidingWindow;
  mailPerIp: SlidingWindow;
};

declare global {
  var __vtkAuthThrottle: Limiters | undefined;
}

/** Eén set per proces, ook na een hot reload in dev. */
export function authLimiters(): Limiters {
  globalThis.__vtkAuthThrottle ??= {
    loginPerAccount: new SlidingWindow(AUTH_LIMITS.loginPerAccount),
    loginPerIp: new SlidingWindow(AUTH_LIMITS.loginPerIp),
    registerPerIp: new SlidingWindow(AUTH_LIMITS.registerPerIp),
    mailPerAddress: new SlidingWindow(AUTH_LIMITS.mailPerAddress),
    mailPerIp: new SlidingWindow(AUTH_LIMITS.mailPerIp),
  };
  return globalThis.__vtkAuthThrottle;
}

/**
 * Het adres van de bezoeker: de laatste hop van `x-forwarded-for`, die Caddy
 * zelf aanhangt. Bewust niet `x-real-ip`: Caddy zet of wist die niet, dus een
 * bot kiest ze zelf en krijgt bij elke poging een nieuwe teller (zie
 * `trustedClientIp` in `lib/ticketing/http.ts`).
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || "unknown";
}
