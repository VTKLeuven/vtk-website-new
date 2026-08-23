/**
 * Het contract tussen de site en de VTK-app (`~/vtk-app`).
 *
 * **Dit bestand wordt letterlijk gekopieerd naar `src/api/contract.ts` in de
 * app-repo.** Daarom staan er enkel types en pure helpers in: geen prisma, geen
 * `server-only`, geen import uit `@/lib/...`, en zelfs geen zod. Dat laatste is
 * geen principe maar rekenwerk: de app heeft geen enkele reden om een
 * validatiebibliotheek mee te slepen voor een contract dat ze enkel leest. De
 * zod-schema's staan daarom in `schemas.ts` ernaast, aan de serverkant.
 *
 * Twee regels die de moeite zijn om te onthouden:
 *
 * 1. **Nooit een Prisma-vorm doorgeven.** Niet alleen omdat `@vtk/db` zijn
 *    client-types niet mag exporteren (zie AGENTS.md), maar omdat een
 *    geïnstalleerde app maanden ouder kan zijn dan de database. Een expliciete
 *    vorm is een belofte; een Prisma-rij is een momentopname van het schema.
 * 2. **De teksten zijn hier al gekozen.** De app stuurt `?locale=nl|en` mee en
 *    krijgt `title`, niet `titleNl` + `titleEn`. Anders zou de app `pick()` uit
 *    `@vtk/i18n` moeten nabouwen en zou elke nieuwe vertaalde kolom een
 *    app-release vragen.
 *
 * Breekt er iets aan een bestaande vorm, dan komt er `/api/app/v2` naast; deze
 * blijft dan staan zolang er toestellen op v1 zitten.
 */

export const APP_API_VERSION = 1;

export type AppLocale = "nl" | "en";

/** Leest `?locale=` uit een URL; alles wat geen geldige taal is wordt Nederlands. */
export function appLocaleFrom(value: string | null | undefined): AppLocale {
  return value === "en" ? "en" : "nl";
}

// -----------------------------------------------------------------------------
// Fouten
// -----------------------------------------------------------------------------

/**
 * Elke fout heeft dezelfde vorm en een stabiele `error`-code, zodat de app op de
 * code kan beslissen in plaats van op de tekst. `message` is Nederlands en mag
 * rechtstreeks getoond worden wanneer de app zelf niets beters weet.
 */
export type AppErrorBody = {
  error: string;
  message?: string;
  /** Enkel bij een validatiefout: per veld wat er scheelt. */
  fields?: Record<string, string[]>;
};

export const APP_ERROR = {
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  invalidRequest: "INVALID_REQUEST",
  serverError: "SERVER_ERROR",
} as const;

// -----------------------------------------------------------------------------
// Wie er kijkt
// -----------------------------------------------------------------------------

export type AppViewerGroup = {
  id: string;
  code: string;
  slug: string;
  name: string;
  /** Praesidiumpost of werkgroep; de app toont die twee apart. */
  type: "PRAESIDIUM" | "WERKGROEP";
  role: string;
};

export type AppViewer = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  locale: AppLocale;
  groups: AppViewerGroup[];
  /**
   * De twee poorten die `proxy.ts` op de website afdwingt. De proxy gaat over
   * pagina's en niet over `/api`, dus de app moet ze zelf zien en het
   * bijbehorende webscherm tonen; anders zit een nieuw lid in een app die
   * overal leeg blijft zonder te zeggen waarom.
   */
  needsOnboarding: boolean;
  needsStudyConfirmation: boolean;
};

// -----------------------------------------------------------------------------
// Navigatie
// -----------------------------------------------------------------------------

export type AppNavChild = {
  id: string;
  label: string;
  /** Intern pad zonder taalprefix (`/info/theokot`) of een volledige externe URL. */
  href: string;
  external: boolean;
};

export type AppNavTab = {
  id: string;
  slug: string;
  label: string;
  /** Absolute URL, of `null` wanneer er geen foto ingesteld is. */
  imageUrl: string | null;
  /** Gezet = deze tab is een link naar een andere site (bv. career.vtk.be). */
  externalUrl: string | null;
  children: AppNavChild[];
};

// -----------------------------------------------------------------------------
// Aankondiging
// -----------------------------------------------------------------------------

export type AppAnnouncement = {
  id: string;
  title: string;
  /** Markdown, net als op de site. Rauwe HTML staat uit. */
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

// -----------------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------------

/**
 * Wat de app bij elke start ophaalt. Bewust één aanvraag: op een trage
 * mobiele verbinding is de eerste ronde het enige wat je voelt.
 */
export type AppBootstrap = {
  apiVersion: number;
  locale: AppLocale;
  /** `null` = niet ingelogd. De app werkt dan gewoon, met minder schermen. */
  viewer: AppViewer | null;
  tabs: AppNavTab[];
  announcement: AppAnnouncement | null;
  /**
   * De laagste appversie die deze server nog bedient. Staat de app eronder, dan
   * toont ze een bijwerkscherm in plaats van schermen die stuk kunnen zijn.
   * Semver, vergeleken op major.minor.patch.
   */
  minimumAppVersion: string;
  /**
   * De basis waar de app haar WebView-schermen op opent (login, onboarding,
   * betalen). Dat is dezelfde host als deze aanvraag, dus een cloudflared-tunnel
   * tijdens het testen werkt vanzelf mee.
   */
  webBaseUrl: string;
};

// -----------------------------------------------------------------------------
// Push
// -----------------------------------------------------------------------------

export type AppPushPlatform = "ios" | "android";

export type AppPushRegisterInput = {
  token: string;
  platform: AppPushPlatform;
  /** De versie van de app, puur om later te kunnen zien wie waarop zit. */
  appVersion?: string;
};

/**
 * Een Expo-pushtoken heeft de vorm `ExponentPushToken[...]` of `ExpoPushToken[...]`.
 * De app controleert dit voor ze iets stuurt, de server nog eens voor ze iets
 * bewaart; een token dat er niet zo uitziet gaat sowieso nergens heen.
 */
export const APP_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function isAppPushToken(value: string): boolean {
  return APP_PUSH_TOKEN_PATTERN.test(value.trim());
}
