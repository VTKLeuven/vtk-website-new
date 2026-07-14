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
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }

  // Theokot-timer enkel in de Node.js-runtime (niet edge/browser) en niet dubbel starten.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (globalThis.__theokotNoShowTimer) return;

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

// Vangt automatisch alle onverwerkte server-side request-errors op (App Router
// render, route handlers, server actions). Vereist @sentry/nextjs >= 8.28.0.
export const onRequestError = Sentry.captureRequestError;
