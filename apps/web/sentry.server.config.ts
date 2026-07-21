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
    sendDefaultPii: false,

    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    // Local variables can contain form bodies, e-mail addresses or secrets.
    includeLocalVariables: false,

    enableLogs: true,
  });
}
