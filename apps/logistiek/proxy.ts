import { NextResponse } from 'next/server';
import { analyticsConfigFromEnv } from '@/lib/analytics';
import { contentSecurityPolicy } from '@/lib/csp';

/**
 * Zet de Content-Security-Policy op elke pagina. Waarom hier en niet in
 * `next.config.ts`, staat bij `contentSecurityPolicy` in `lib/csp.ts`.
 *
 * Eén keer opgebouwd bij het starten: de omgeving verandert niet tijdens het
 * draaien, en zo kost de proxy per verzoek niet meer dan één header.
 */
const POLICY = contentSecurityPolicy({
  development: process.env.NODE_ENV === 'development',
  analyticsUrl: analyticsConfigFromEnv()?.url ?? null,
});

export function proxy() {
  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', POLICY);
  return response;
}

export const config = {
  matcher: [
    {
      // Enkel pagina's: geen API-routes (de mediaroute zet haar eigen headers),
      // geen gebouwde bestanden en geen afbeeldingen uit `public/`. Een prefetch
      // laadt geen document, dus die heeft de header ook niet nodig.
      source: '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|txt|xml|webmanifest)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
