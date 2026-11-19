import * as SQLite from 'expo-sqlite';
import type { QueuedScan, ScannerManifest } from './types';

/**
 * Het manifest en de wachtrij van de scanner aan de deur.
 *
 * Dit is de enige schrijfwachtrij in de app, en ze hoort enkel bij de scanner:
 * een deur staat in een kelder of een tent, en daar moet scannen doorgaan zonder
 * netwerk. De rest van de app bewaart enkel voorkeuren en een leescache
 * (`src/storage.ts`); iets bestellen of kopen vraagt gewoon netwerk.
 *
 * Een eigen databankbestand en niet de tabellen van `src/storage.ts`, zodat de
 * leescache leegmaken (bij een andere server of bij uitloggen) nooit een scan
 * meeneemt die nog naar de server moet.
 *
 * SQLite en niet AsyncStorage: een manifest van 5000 tickets loopt tegen de
 * limiet van de Android-implementatie daarvan aan.
 *
 * **Dit bestand laadt geen enkele module die niet in elke build zit.** Het wordt
 * ook bij het uitloggen geladen, en dus bij het opstarten van de app; een
 * `expo-crypto` hier zou op een oudere APK de hele app laten vallen in plaats van
 * enkel het scanscherm. De ids staan daarom apart in `ids.ts`.
 */

const db = SQLite.openDatabaseSync('vtk_scanner.db');

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS manifest (
    event_id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS queue (
    client_scan_id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    queued_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS queue_event ON queue (event_id, queued_at);
`);

/**
 * Hoe lang een manifest op het toestel mag blijven liggen.
 *
 * Het manifest draagt de naam van elke deelnemer, en deze app staat ook op de
 * telefoon van iemand die één avond kwam bijspringen. Twee dagen dekt een
 * evenement dat over middernacht loopt en een scanner die de volgende ochtend
 * pas weer netwerk heeft; daarna is het enkel nog een namenlijst die niemand
 * nodig heeft. Wie het event opnieuw opent, haalt gewoon een vers manifest op.
 */
const MANIFEST_TTL_MS = 2 * 24 * 60 * 60 * 1000;

try {
  db.runSync('DELETE FROM manifest WHERE saved_at < ?', Date.now() - MANIFEST_TTL_MS);
} catch {
  // Opruimen is netheid; een fout hier mag de app niet tegenhouden.
}

// ── Manifest ────────────────────────────────────────────────────────────────

export function loadManifest(eventId: string): ScannerManifest | null {
  try {
    const row = db.getFirstSync<{ payload: string }>(
      'SELECT payload FROM manifest WHERE event_id = ?',
      eventId,
    );
    return row ? (JSON.parse(row.payload) as ScannerManifest) : null;
  } catch (error) {
    console.error('Manifest lezen mislukt', error);
    return null;
  }
}

export function saveManifest(eventId: string, manifest: ScannerManifest): void {
  try {
    db.runSync(
      'INSERT OR REPLACE INTO manifest (event_id, payload, saved_at) VALUES (?, ?, ?)',
      eventId,
      JSON.stringify(manifest),
      Date.now(),
    );
  } catch (error) {
    // Een vol toestel mag nooit een scan blokkeren; zonder manifest scant hij
    // gewoon online verder.
    console.error('Manifest bewaren mislukt', error);
  }
}

/**
 * Elk manifest weg, bij het uitloggen. Die namenlijsten hoorden bij de
 * scanrechten van wie net vertrok.
 *
 * De wachtrij blijft bewust staan: daar zitten scans in die aan de deur echt
 * gebeurd zijn en nog naar de server moeten. Ze vertrekken zodra iemand met
 * scanrechten dat event weer opent.
 */
export function clearManifests(): void {
  try {
    db.runSync('DELETE FROM manifest');
  } catch {
    // Niets aan te doen, en niets dat hierdoor stuk gaat.
  }
}

// ── Wachtrij ────────────────────────────────────────────────────────────────

export function loadQueue(eventId: string): QueuedScan[] {
  try {
    const rows = db.getAllSync<{ payload: string }>(
      'SELECT payload FROM queue WHERE event_id = ? ORDER BY queued_at ASC',
      eventId,
    );
    return rows.map((row) => JSON.parse(row.payload) as QueuedScan);
  } catch (error) {
    console.error('Wachtrij lezen mislukt', error);
    return [];
  }
}

export function queueSize(eventId: string): number {
  try {
    const row = db.getFirstSync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue WHERE event_id = ?',
      eventId,
    );
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

/** Hoeveel scans er per event nog op dit toestel wachten, voor het keuzescherm. */
export function queueSizes(): Map<string, number> {
  try {
    const rows = db.getAllSync<{ event_id: string; count: number }>(
      'SELECT event_id, COUNT(*) AS count FROM queue GROUP BY event_id',
    );
    return new Map(rows.map((row) => [row.event_id, row.count]));
  } catch {
    return new Map();
  }
}

export function enqueueScan(eventId: string, scan: QueuedScan): void {
  try {
    db.runSync(
      'INSERT OR REPLACE INTO queue (client_scan_id, event_id, payload, queued_at) VALUES (?, ?, ?, ?)',
      scan.clientScanId,
      eventId,
      JSON.stringify(scan),
      Date.now(),
    );
  } catch (error) {
    console.error('Scan in wachtrij zetten mislukt', error);
  }
}

/**
 * Weghalen wat de server verwerkt heeft. Veilig om ruim toe te passen: elke scan
 * draagt haar `clientScanId` en `TicketScanLog.clientScanId` is uniek, dus een
 * item dat toch nog eens vertrekt levert `duplicateRequest: true` op en verandert
 * niets.
 */
export function dequeueScans(clientScanIds: string[]): void {
  if (clientScanIds.length === 0) return;
  try {
    const placeholders = clientScanIds.map(() => '?').join(',');
    db.runSync(`DELETE FROM queue WHERE client_scan_id IN (${placeholders})`, ...clientScanIds);
  } catch (error) {
    console.error('Wachtrij opschonen mislukt', error);
  }
}
