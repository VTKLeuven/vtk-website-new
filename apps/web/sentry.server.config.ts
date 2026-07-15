/**
 * Sentry: Node.js server runtime. Aangeroepen vanuit `instrumentation.ts`
 * (`register()`) wanneer `NEXT_RUNTIME === "nodejs"`. De DSN komt uit de database
 * (beheerd via Admin -> IT), met de omgeving als fallback; inert wanneer er geen
 * DSN is. Omdat Sentry bij het opstarten initialiseert, geldt een gewijzigde DSN
 * pas na een herstart van de container.
 */
import * as Sentry from "@sentry/nextjs";

export function initServerSentry(dsn: string | undefined): void {
  Sentry.init({
    dsn,

    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    // Attach local variable values to server-side stack frames.
    includeLocalVariables: true,

    enableLogs: true,
  });
}
