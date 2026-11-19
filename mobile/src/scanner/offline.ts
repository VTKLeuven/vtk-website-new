import { TICKET_COLORS } from '../theme/tokens';
import type { ScannerManifest, ScannerManifestEntry, TicketColorKey } from './types';

/**
 * Het offline oordeel over een gescande code.
 *
 * Poort van `apps/web/components/ticketing/scanner/offline.ts`; de opslag zit
 * hier in `storage.ts` (SQLite) in plaats van in localStorage, de beslislogica
 * hieronder is bewust identiek.
 *
 * Bewust **geen** handtekeningcontrole op het toestel: daarvoor is
 * `TICKETING_TOKEN_SECRET` nodig, en wie die telefoon uitleest kan dan zelf
 * tickets maken. We controleren op lidmaatschap van het manifest plus het
 * versienummer; de volledige controle gebeurt alsnog bij het synchroniseren.
 */

/**
 * Haalt de ticketcode en het versienummer uit een credential.
 * Formaat: `prefix.publicId.versie.handtekening` (zie lib/ticketing/crypto.ts).
 */
export function parseCredential(credential: string): { code: string; version: number } | null {
  const parts = credential.split('.');
  if (parts.length < 4) {
    // Handmatig ingetikte code: dan hebben we enkel de publieke code.
    return /^[A-Za-z0-9_-]{12,64}$/.test(credential) ? { code: credential, version: 0 } : null;
  }
  const version = Number.parseInt(parts[2]!, 10);
  if (!parts[1] || !Number.isFinite(version)) return null;
  return { code: parts[1], version };
}

export type OfflineVerdict =
  | { kind: 'accepted'; entry: ScannerManifestEntry }
  | { kind: 'duplicate'; entry: ScannerManifestEntry }
  | { kind: 'rejected'; reason: 'unknown' | 'version' | 'unreadable' };

export function verifyOffline(
  manifest: ScannerManifest,
  credential: string,
  scannedCodes: Set<string>,
): OfflineVerdict {
  const parsed = parseCredential(credential);
  if (!parsed) return { kind: 'rejected', reason: 'unreadable' };

  const entry = manifest.tickets.find((ticket) => ticket.code === parsed.code);
  if (!entry) return { kind: 'rejected', reason: 'unknown' };
  // Versie 0 betekent "handmatig ingetikt, geen versie bekend"; die laten we door
  // op de code alleen, net zoals het serverpad dat doet.
  if (parsed.version !== 0 && parsed.version !== entry.version) {
    return { kind: 'rejected', reason: 'version' };
  }
  if (entry.checkedIn || scannedCodes.has(entry.code)) return { kind: 'duplicate', entry };
  return { kind: 'accepted', entry };
}

/**
 * Wat er uit de camera komt naar een credential.
 *
 * De QR van een ticket draagt de ruwe credential, maar een wallet-pas of een
 * gedeelde link kan er een URL van maken; dan zit ze in `?credential=`.
 */
export function credentialFromScan(raw: string): string {
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return value;
  const query = value.split('?')[1];
  if (!query) return value;
  for (const pair of query.split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key === 'credential' || key === 'ticket') {
      return decodeURIComponent(rest.join('='));
    }
  }
  return value;
}

const COLOR_KEYS = new Set(Object.keys(TICKET_COLORS));

/**
 * Normaliseert wat er uit de API komt naar een key uit het palet. Een onbekende
 * waarde valt terug op navy in plaats van te gooien: een tickettype met een rare
 * kleur mag geen scan blokkeren.
 */
export function ticketColorKey(value: unknown): TicketColorKey {
  return typeof value === 'string' && COLOR_KEYS.has(value) ? (value as TicketColorKey) : 'navy';
}
