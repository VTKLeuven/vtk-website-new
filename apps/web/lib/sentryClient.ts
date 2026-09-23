/**
 * Sentry in de browser, pas geladen wanneer het mag.
 *
 * Twee momenten starten Sentry: `instrumentation-client.ts` bij het laden van de
 * pagina, wanneer de bezoeker al eerder toestemming gaf, en de cookiebanner op
 * het moment dat hij ze geeft. Beide gaan langs hier, zodat de SDK één keer
 * geladen en één keer geïnitialiseerd wordt.
 *
 * Een dynamische import en geen statische: statisch stond de SDK met Replay in
 * de gedeelde bundel van élke pagina, 153 KB gzip (497 KB JavaScript om te
 * parsen), ook voor wie nooit toestemming gaf en bij wie Sentry dus nooit start.
 */

declare global {
  interface Window {
    // Door de root-layout ingespoten vanuit de DB-config (Admin -> IT). De
    // client-DSN is publiek per ontwerp; env blijft de fallback.
    __SENTRY_DSN__?: string;
  }
}

type SentryModule = typeof import("@sentry/nextjs");

let started: Promise<SentryModule> | null = null;

/** Laadt en start Sentry, of null zonder DSN. Een tweede aanroep doet niets nieuws. */
export function startSentry(): Promise<SentryModule> | null {
  const dsn = window.__SENTRY_DSN__ ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  started ??= import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      sendDefaultPii: false,

      // 100% tracing in dev, 10% in production.
      tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

      // Session Replay is optional and only runs after explicit consent. Keep
      // text masked and media blocked even after consent has been granted.
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      enableLogs: true,

      integrations: [
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
    });
    return Sentry;
  });
  return started;
}

/** De gestarte SDK, of null zolang Sentry niet gestart is. */
export function startedSentry(): Promise<SentryModule> | null {
  return started;
}
