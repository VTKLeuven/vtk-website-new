import 'server-only';

import { createHmac } from 'node:crypto';

/**
 * De code die naast de kaartlezer hangt en waarmee je met de VTK-app incheckt.
 *
 * Hij wordt hier gemaakt maar op vtk.be nagekeken: de app stuurt hem naar
 * `/api/app/v1/fakbar/checkin` daar, en `verifyFakCheckinToken` in
 * `apps/web/lib/app-api/tokens.ts` verwacht exact deze vorm. Beide apps lezen in
 * productie dezelfde `.env` (zie `infra/docker-compose.yml`), dus dezelfde
 * `APP_TOKEN_SECRET`; wijkt de ene af, dan werkt de afdruk niet meer.
 *
 * **Blijf dus gelijk aan die kant.** Prefix, plek en handtekening horen hier
 * hetzelfde te worden opgebouwd, inclusief de terugval buiten productie: anders
 * maakt een laptop een code die zijn eigen check-in weigert.
 *
 * De code verloopt niet, want hij hangt daar maanden. Wat een gestolen foto
 * onbruikbaar maakt, zit niet in de code maar in de check-in zelf: die telt enkel
 * wanneer 't ElixIr op dat moment ook open gemeten wordt, en nog steeds maar één
 * keer per bardag.
 */

const FAK_PREFIX = 'vtkfak1';

/** Vandaag is er één lezer, en die staat aan de toog. */
export const DEFAULT_FAK_SPOT = 'toog';

function appTokenSecret(): string {
  const secret = process.env.APP_TOKEN_SECRET?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 24) {
      throw new Error('APP_TOKEN_SECRET must be set to a long random value in production');
    }
    return secret;
  }
  return secret || process.env.BETTER_AUTH_SECRET?.trim() || 'vtk-local-app-secret-change-me';
}

export function createFakCheckinToken(spot: string = DEFAULT_FAK_SPOT): string {
  const payload = `${FAK_PREFIX}.${encodeURIComponent(spot)}`;
  const signature = createHmac('sha256', appTokenSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
