/**
 * Sentry: browser/client runtime. Next.js loads this file before hydration
 * (see node_modules/next/dist/docs/.../instrumentation-client.md). The DSN is
 * read from the (public) `NEXT_PUBLIC_SENTRY_DSN` env var; when it is unset the
 * SDK stays inert, so this is safe to ship without a DSN configured locally.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 100% tracing in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay: 10% of all sessions, 100% of sessions with an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,

  integrations: [Sentry.replayIntegration()],
});

// Report App Router client-side navigations to Sentry.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
