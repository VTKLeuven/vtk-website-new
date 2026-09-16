/**
 * Next.js instrumentation-hook. `register()` draait één keer wanneer de
 * server-instance start.
 *
 * Eén verantwoordelijkheid: Sentry initialiseren voor de juiste server-runtime
 * (Node.js of edge), en de objectopslag laten resolven uit de live DB-config.
 *
 * Hier stond ook een `setInterval` die de Theokot-no-shows en de geplande
 * lesbezoekmails verwerkte. Die is verhuisd naar `background-worker` in
 * `infra/docker-compose.yml`, dat elke vijf minuten
 * `POST /api/background/maintenance` klopt. Een timer in het renderproces draait
 * mee in élke instance, dus zodra de website op meer dan één container draait
 * verstuurt ze haar mail meervoudig; ze deelt bovendien het event loop met de
 * paginaweergaven. Elke andere periodieke taak hier heeft allang haar eigen
 * worker; dit was de laatste die dat niet had.
 */
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  // Sentry per server-runtime laden (browser gebruikt instrumentation-client.ts).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getS3Config, getSentryDsn } = await import('./lib/runtimeConfig');
    const { setS3ConfigResolver } = await import('@vtk/storage');

    // Objectopslag laten resolven vanuit de live DB-config (zie @vtk/storage).
    setS3ConfigResolver(getS3Config);

    // Sentry server-side initialiseren met de DSN uit de DB (fallback: env).
    const dsn = await getSentryDsn().catch(() => process.env.SENTRY_DSN);
    const { initServerSentry } = await import('./sentry.server.config');
    initServerSentry(dsn);
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge (middleware) kan de DB niet lezen; blijft op de env-DSN.
    await import('./sentry.edge.config');
  }

}

// Vangt automatisch alle onverwerkte server-side request-errors op (App Router
// render, route handlers, server actions). Vereist @sentry/nextjs >= 8.28.0.
export const onRequestError = Sentry.captureRequestError;
