/**
 * Next.js instrumentation-hook. `register()` draait één keer wanneer de
 * server-instance start.
 *
 * We gebruiken dit om de Theokot no-show-verwerking periodiek te draaien zonder
 * externe cron: een `setInterval` roept `processDueNoShows` aan. Een globale flag
 * voorkomt dubbele intervallen bij hot-reloads in dev. In deze single-container
 * deploy draait er precies één instance; bij horizontaal schalen zou dit meervoudig
 * draaien — de verwerking is echter idempotent via `session.processedAt`, dus dat
 * levert hooguit dubbele mail-pogingen op (zie docs/design-decisions.md).
 */

const INTERVAL_MS = 5 * 60 * 1000; // elke 5 minuten

declare global {
  var __theokotNoShowTimer: NodeJS.Timeout | undefined;
}

export async function register(): Promise<void> {
  // Enkel in de Node.js-runtime (niet edge/browser) en niet dubbel starten.
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
