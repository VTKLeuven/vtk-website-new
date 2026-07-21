/**
 * Sentry: browser/client runtime. Next.js loads this file before hydration
 * (see node_modules/next/dist/docs/.../instrumentation-client.md). The DSN is
 * read from the (public) `NEXT_PUBLIC_SENTRY_DSN` env var; when it is unset the
 * SDK stays inert, so this is safe to ship without a DSN configured locally.
 */
import * as Sentry from "@sentry/nextjs";
import { analyticsConsentGranted } from "@/lib/cookie-consent";

declare global {
  interface Window {
    // Door de root-layout ingespoten vanuit de DB-config (Admin -> IT). De
    // client-DSN is publiek per ontwerp; env blijft de fallback.
    __SENTRY_DSN__?: string;
  }
}

const dsn = window.__SENTRY_DSN__ ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryEnabled = Boolean(dsn && analyticsConsentGranted());

if (sentryEnabled) {
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
}

// Report App Router client-side navigations to Sentry.
export function onRouterTransitionStart(
  href: string,
  navigationType: "push" | "replace" | "traverse",
) {
  if (sentryEnabled) Sentry.captureRouterTransitionStart(href, navigationType);
}
