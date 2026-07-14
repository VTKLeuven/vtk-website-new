/**
 * Sentry: Node.js server runtime. Loaded from `instrumentation.ts` via
 * `register()` when `NEXT_RUNTIME === "nodejs"`. Reads the server-side DSN from
 * `SENTRY_DSN`; inert when unset.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Attach local variable values to server-side stack frames.
  includeLocalVariables: true,

  enableLogs: true,
});
