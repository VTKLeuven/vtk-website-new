/**
 * De Content-Security-Policy van de uitleendienst (S7 uit de audit van november
 * 2026).
 *
 * Zonder nonces, zoals "Without Nonces" in de CSP-gids van Next: de app rendert
 * zijn eigen inline scripts (de RSC-payload, het themascript in de layout), dus
 * `'unsafe-inline'` blijft nodig voor scripts. Wat de header wel afsluit: scripts
 * en verbindingen naar een ander domein dan het onze en dat van de teller, een
 * `<base>` of `<object>` die iemand binnensmokkelt, een formulier dat naar
 * elders post, en de app in een frame op een andere site.
 *
 * Opgebouwd in `proxy.ts` en niet in `next.config.ts`: daar ligt de header vast
 * bij de build, en de URL van Umami komt pas bij het starten uit de omgeving
 * (de root-`.env` gaat enkel naar de containers, niet naar de Docker-build).
 * Een vaste header zou de teller op productie dus stil blokkeren.
 *
 * Betalen loopt niet via een formulier maar via `window.location.assign` naar
 * Mollie (`components/pay-button.tsx`); daar gaat `form-action` niet over.
 */
export function contentSecurityPolicy(options: {
  /** `next dev`: React en webpack gebruiken `eval`, de HMR een websocket. */
  development: boolean;
  /** De publieke URL van Umami, of `null` wanneer de teller uit staat. */
  analyticsUrl: string | null;
}): string {
  const analytics = originOf(options.analyticsUrl);
  const directives: Array<[string, Array<string | null | false>]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'unsafe-inline'", analytics, options.development && "'unsafe-eval'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    // `blob:` voor het voorbeeld van een gekozen foto voor ze opgeladen is.
    ['img-src', ["'self'", 'blob:', 'data:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", analytics, options.development && 'ws:', options.development && 'wss:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    // Zoals `X-Frame-Options: SAMEORIGIN` in next.config.ts.
    ['frame-ancestors', ["'self'"]],
  ];
  return directives
    .map(([name, sources]) => [name, ...sources.filter((source): source is string => Boolean(source))].join(' '))
    .join('; ');
}

/** Enkel het origin: een pad of een afsluitende slash hoort niet in een bron. */
function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
  } catch {
    return null;
  }
}
