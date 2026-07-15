/**
 * Next.js instrumentation-hook. `register()` draait één keer wanneer de
 * server-instance start.
 *
 * Twee verantwoordelijkheden:
 *  1. Sentry initialiseren voor de juiste server-runtime (Node.js of edge).
 *  2. De Theokot no-show-verwerking periodiek draaien zonder externe cron: een
 *     `setInterval` roept `processDueNoShows` aan. Een globale flag voorkomt
 *     dubbele intervallen bij hot-reloads in dev. In deze single-container deploy
 *     draait er precies één instance; bij horizontaal schalen zou dit meervoudig
 *     draaien; de verwerking is echter idempotent via `session.processedAt`, dus
 *     dat levert hooguit dubbele mail-pogingen op (zie docs/design-decisions.md).
 */
import * as Sentry from '@sentry/nextjs';

const INTERVAL_MS = 5 * 60 * 1000; // elke 5 minuten

declare global {
  var __theokotNoShowTimer: NodeJS.Timeout | undefined;
}

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

    // Theokot no-show-timer. Staat bewust binnen deze NEXT_RUNTIME === 'nodejs'
    // tak, niet achter een `!== 'nodejs' return`. De bundler houdt enkel code die
    // lexicaal in deze tak zit uit de edge-build (proxy.ts draait op edge). Zo
    // blijft de keten ./lib/theokot-server -> ./lib/mail -> nodemailer buiten de
    // edge-bundle, waar Node-builtins zoals `stream` niet bestaan. Een globale
    // flag voorkomt dubbele intervallen bij hot-reloads in dev.
    if (!globalThis.__theokotNoShowTimer) {
      const run = async () => {
        try {
          const { processDueNoShows } = await import('./lib/theokot-server');
          const result = await processDueNoShows(new Date());
          if (result.noShows > 0) {
            console.info(
              `[theokot] no-show-verwerking: ${result.noShows} bestelling(en) over ${result.sessions} sessie(s) gemarkeerd.`,
            );
          }
        } catch (err) {
          console.error('[theokot] no-show-verwerking mislukt:', err);
        }
      };

      // Kort na boot één keer draaien, daarna op interval.
      globalThis.__theokotNoShowTimer = setInterval(run, INTERVAL_MS);
      setTimeout(run, 15_000);
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge (proxy) kan de DB niet lezen; blijft op de env-DSN.
    await import('./sentry.edge.config');
  }
}

// Vangt automatisch alle onverwerkte server-side request-errors op (App Router
// render, route handlers, server actions). Vereist @sentry/nextjs >= 8.28.0.
export const onRequestError = Sentry.captureRequestError;
