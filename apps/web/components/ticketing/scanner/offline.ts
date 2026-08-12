import type { QueuedScan, ScannerManifest, ScannerManifestEntry } from "./types";

/**
 * Offline scannen: het manifest en de wachtrij.
 *
 * De scanner werkt aan een deur waar het netwerk kan wegvallen (kelder, tent,
 * jobbeurs in een hal). Zonder deze laag weigerde hij simpelweg elke scan zolang
 * `navigator.onLine` false was.
 *
 * Twee stukken:
 * - het **manifest**: de lijst geldige tickets van dit event, opgehaald bij het
 *   laden. Daarmee kan het toestel zelf zeggen of een QR bij dit event hoort.
 * - de **wachtrij**: scans die nog niet bij de server geraakten. Elke scan draagt
 *   een `clientScanId`; de server dedupliceert daarop, dus opnieuw versturen is
 *   altijd veilig.
 *
 * Beide staan in localStorage. Een galabal van 1500 tickets is ongeveer 140 kB
 * en een avond scannen levert hooguit een paar duizend wachtrij-items op, ruim
 * binnen de vijf megabyte die een browser daarvoor geeft. IndexedDB zou hier
 * enkel complexiteit toevoegen.
 */

const MANIFEST_KEY = (eventId: string) => `vtk-scanner-manifest:${eventId}`;
const QUEUE_KEY = (eventId: string) => `vtk-scanner-queue:${eventId}`;

/** localStorage kan gooien (privémodus, vol geheugen); dat mag nooit een scan blokkeren. */
function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadManifest(eventId: string): ScannerManifest | null {
  return safeRead<ScannerManifest>(MANIFEST_KEY(eventId));
}

export function saveManifest(eventId: string, manifest: ScannerManifest): boolean {
  return safeWrite(MANIFEST_KEY(eventId), manifest);
}

export function clearManifest(eventId: string) {
  try {
    localStorage.removeItem(MANIFEST_KEY(eventId));
  } catch {
    /* niets aan te doen */
  }
}

export function loadQueue(eventId: string): QueuedScan[] {
  return safeRead<QueuedScan[]>(QUEUE_KEY(eventId)) ?? [];
}

export function saveQueue(eventId: string, queue: QueuedScan[]): boolean {
  return safeWrite(QUEUE_KEY(eventId), queue);
}

/**
 * Haalt de ticketcode en het versienummer uit een credential.
 *
 * Formaat: `prefix.publicId.versie.handtekening` (zie lib/ticketing/crypto.ts).
 * De handtekening kunnen we hier niet controleren, want daarvoor is het
 * servergeheim nodig; die controle gebeurt alsnog bij het synchroniseren.
 */
export function parseCredential(credential: string): { code: string; version: number } | null {
  const parts = credential.split(".");
  if (parts.length < 4) {
    // Handmatig ingetikte code: dan hebben we enkel de publieke code.
    return /^[A-Za-z0-9_-]{12,64}$/.test(credential) ? { code: credential, version: 0 } : null;
  }
  const version = Number.parseInt(parts[2]!, 10);
  if (!parts[1] || !Number.isFinite(version)) return null;
  return { code: parts[1], version };
}

export type OfflineVerdict =
  | { kind: "accepted"; entry: ScannerManifestEntry }
  | { kind: "duplicate"; entry: ScannerManifestEntry }
  | { kind: "rejected"; reason: "unknown" | "version" | "unreadable" };

/**
 * Het offline oordeel over een gescande code.
 *
 * Bewust géén handtekeningcontrole (zie hierboven): we controleren of de code in
 * het manifest van dit event zit en of het versienummer klopt. Wie een geldige
 * code van iemand anders kent, geraakt daarmee offline binnen; dat conflict komt
 * bij het synchroniseren alsnog boven, want de server doet de volledige controle
 * en meldt de tweede scan als ALREADY_USED.
 */
export function verifyOffline(
  manifest: ScannerManifest,
  credential: string,
  scannedCodes: Set<string>,
): OfflineVerdict {
  const parsed = parseCredential(credential);
  if (!parsed) return { kind: "rejected", reason: "unreadable" };

  const entry = manifest.tickets.find((ticket) => ticket.code === parsed.code);
  if (!entry) return { kind: "rejected", reason: "unknown" };
  // Versie 0 betekent "handmatig ingetikt, geen versie bekend"; die laten we door
  // op de code alleen, net zoals het serverpad dat doet.
  if (parsed.version !== 0 && parsed.version !== entry.version) {
    return { kind: "rejected", reason: "version" };
  }
  if (entry.checkedIn || scannedCodes.has(entry.code)) {
    return { kind: "duplicate", entry };
  }
  return { kind: "accepted", entry };
}
