/**
 * Wat er in een gescande QR zat.
 *
 * De app heeft één scanner en vier soorten codes, en dat is een keuze: aan een
 * deur of aan een toog weet je zelf wel wat je voorhoudt, en een menu waarin je
 * eerst het juiste soort moet kiezen is een tik die niets oplevert. De prefix
 * zegt het, dus laat de code het zeggen.
 *
 * De prefixen komen van de server:
 *
 * | prefix     | waar |
 * |---|---|
 * | `vtkt1.`   | een ticket (`lib/ticketing/crypto.ts`) |
 * | `vtks1.`   | een uitnodiging om te mogen scannen, idem |
 * | `vtkpas1.` | de pas van een student (`lib/app-api/tokens.ts`) |
 * | `vtkfak1.` | de code naast de kaartlezer, idem |
 *
 * Een uitnodiging komt ook binnen als volledige URL, want die QR wordt op de site
 * gemaakt om ook met de gewone camera van een telefoon te kunnen scannen. Dat pad
 * hoort er dus bij.
 */

export type ScanKind = 'ticket' | 'invite' | 'pass' | 'fakbar' | 'unknown';

export function scanKindOf(raw: string): ScanKind {
  const value = raw.trim();

  if (value.startsWith('vtkt1.')) return 'ticket';
  if (value.startsWith('vtks1.')) return 'invite';
  if (value.startsWith('vtkpas1.')) return 'pass';
  if (value.startsWith('vtkfak1.')) return 'fakbar';

  // De uitnodiging als volledig adres: `https://.../scan/uitnodiging?code=...`.
  if (/^https?:\/\//i.test(value) && value.includes('/scan/uitnodiging')) return 'invite';

  return 'unknown';
}

/** Een zin bij een code die we niet herkennen. Zegt wat het wél had moeten zijn. */
export const UNKNOWN_SCAN_MESSAGE =
  'Dit is geen VTK-code. De scanner leest een ticket, een uitnodiging om te scannen, de code aan de fakbar of de pas van een student.';
