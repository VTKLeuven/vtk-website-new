import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * De tests die een echte database nodig hebben, naast `vitest.config.ts` voor de
 * gewone unit tests. Dezelfde opzet als `apps/web/vitest.integration.config.ts`.
 *
 * Een eigen config en een eigen `include`, zodat `npm test` (en dus de pre-push
 * hook) blijft draaien zonder Postgres. Deze draait in CI, waar de job al een
 * Postgres-service en `prisma migrate deploy` heeft.
 *
 * `fileParallelism: false` plus `describe.sequential` in de tests zelf: de
 * suites delen één database en ruimen op naam op.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // `server-only` gooit buiten een React Server Component; lib/uitleen-server
      // en lib/calendar/transport-feed importeren het allebei bovenaan.
      'server-only': path.resolve(__dirname, 'test/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/integration/**/*.integration.ts'],
    fileParallelism: false,
    env: {
      // De feed zet deze URL in elke VEVENT. Vastzetten houdt de asserties
      // onafhankelijk van de .env van wie de test draait.
      LOGISTIEK_PUBLIC_URL: process.env.LOGISTIEK_PUBLIC_URL || 'http://localhost:3100',
    },
  },
});
