/**
 * De regels van de opruiming van de bucket, zonder database of S3, zodat ze
 * los te toetsen zijn. Het uitvoeren staat in `lib/storage-cleanup.ts`; het
 * waarom in docs/design-decisions.md, "Opruiming van de bucket".
 */

/**
 * De mappen van de algemene uploader (`/api/admin/upload`): wat daar staat,
 * heeft geen eigen rij in de database en leeft enkel als key in een kolom of
 * als link in een tekst. Dat is waar bestanden blijven hangen.
 *
 * Bewust niet: `bonnetjes/` (de boekhouding heeft een bewaarplicht), `forms/`,
 * `avatars/`, `publications/`, `uitleen/`, `ticket-design/` en
 * `theokot/contracten/`. Die hebben een eigenaar-rij en hun eigen opruiming.
 * Een map die hier niet staat, raakt de opruiming nooit aan.
 */
export const CLEANUP_PREFIXES = ["images", "pdfs", "files", "logos", "tiles", "badges", "uploads"] as const;

/**
 * De editor uploadt een bestand voor het formulier bewaard is. Een object dat
 * jonger is dan dit, telt dus nog niet mee: het opslaan kan nog komen, ook na
 * een mislukte poging die het formulier liet staan.
 */
export const MIN_OBJECT_AGE_DAYS = 7;

/** Hoe lang een object aan één stuk zonder verwijzing moet staan voor het weggaat. */
export const GRACE_DAYS = 30;

/**
 * Een plafond per nacht. Zit er toch een fout in de scan, dan gaat er hoogstens
 * zoveel weg voor iemand het op het scherm ziet; de rest volgt de nachten erna.
 */
export const MAX_DELETES_PER_RUN = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `newStorageKey` maakt `<map>/<24 hex><extensie>`. De 24 hex zijn op zich al
 * uniek, dus de scan zoekt naar `<map>/<24 hex>` en niet naar de volledige key:
 * een extensie met een spatie staat in een link URL-gecodeerd, en een link
 * draagt vaak nog `?filename=...` achter zich.
 */
const KEY_SHAPE = new RegExp(`^(${CLEANUP_PREFIXES.join("|")})/([0-9a-f]{24})(?:\\.[^/]*)?$`);

/**
 * Het zoekpatroon voor de database, met de vlaggen `gi`. Hetzelfde patroon
 * draait in Postgres (`regexp_matches`) en hier ({@link extractReferencedStems});
 * de test houdt die twee gelijk.
 *
 * `%2f` vangt een key die URL-gecodeerd in een andere URL staat, zoals
 * `/_next/image?url=%2Fapi%2Fmedia%2Fimages%2F...`. Dat het patroon ook binnen
 * een langer woord matcht (`xfiles/...`), is goed: een verwijzing te veel houdt
 * enkel een bestand langer bij, een verwijzing te weinig gooit er een weg.
 */
export const REFERENCE_PATTERN = `(${CLEANUP_PREFIXES.join("|")})(?:/|%2f)([0-9a-f]{24})`;

/** `images/<24 hex>` voor een key die de opruiming kent, anders `null`. */
export function cleanupStem(key: string): string | null {
  const match = KEY_SHAPE.exec(key);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** Alle `<map>/<24 hex>` in een tekst, in kleine letters. Spiegel van de SQL. */
export function extractReferencedStems(text: string): Set<string> {
  const stems = new Set<string>();
  for (const match of text.matchAll(new RegExp(REFERENCE_PATTERN, "gi"))) {
    stems.add(`${match[1]!.toLowerCase()}/${match[2]!.toLowerCase()}`);
  }
  return stems;
}

/** Een identifier voor in SQL, tussen dubbele aanhalingstekens. */
export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * De tabellen die de scan overslaat. `StorageOrphan` draagt de keys zelf; wie
 * hem meezoekt, vindt elk wees-object terug als verwezen en ruimt nooit iets op.
 */
export const SCAN_EXCLUDED_TABLES = new Set(["StorageOrphan", "_prisma_migrations"]);

/**
 * De query die in één tabel elke verwijzing zoekt: alle tekstachtige kolommen
 * aan elkaar, en daarin het patroon. Eén query per tabel en niet per kolom; de
 * database geeft enkel de gevonden stammen terug, nooit de inhoud.
 *
 * `array_to_string(ARRAY[...])` en niet `concat_ws(...)`: een functie neemt in
 * Postgres hoogstens 100 argumenten, en een tabel met meer tekstkolommen zou de
 * hele scan doen falen. `array_to_string` slaat een `NULL` over.
 */
export function tableScanSql(table: string, columns: readonly string[]): string {
  const parts = columns.map((column) => `t.${quoteIdentifier(column)}::text`).join(", ");
  return (
    `SELECT DISTINCT lower(m[1]) || '/' || lower(m[2]) AS stem ` +
    `FROM ${quoteIdentifier(table)} t ` +
    `CROSS JOIN LATERAL regexp_matches(array_to_string(ARRAY[${parts}], ' '), $1, 'gi') AS m`
  );
}

export type BucketObject = { key: string; sizeBytes: number; lastModified: Date | null };
export type OrphanRow = { key: string; sizeBytes: number; firstSeenAt: Date };

export type CleanupPlan = {
  /** Objecten in een opruimbare map, met een gekende vorm en oud genoeg. */
  checked: number;
  /** Waarvan de database er nog naar verwijst. */
  referenced: number;
  /** Jonger dan {@link MIN_OBJECT_AGE_DAYS}: nog niet beoordeeld. */
  tooRecent: number;
  /** In een opruimbare map, maar niet in de vorm van `newStorageKey`: blijft altijd. */
  unrecognised: number;
  /** Zonder verwijzing en nog niet gekend: een rij erbij. */
  newOrphans: { key: string; sizeBytes: number }[];
  /** Rijen die weg mogen: weer verwezen, verdwenen of niet meer te beoordelen. */
  released: string[];
  /** Alle wezen na deze ronde, met de datum van hun eerste keer. */
  orphans: OrphanRow[];
  /** Wezen waarvan de wachttijd om is, de oudste eerst. */
  due: OrphanRow[];
};

/**
 * Wat deze ronde moet doen, uit de inhoud van de bucket, de verwijzingen in de
 * database en de wezen van vorige rondes. Verwijdert zelf niets.
 */
export function planCleanup({
  objects,
  referencedStems,
  existing,
  now,
}: {
  objects: readonly BucketObject[];
  referencedStems: ReadonlySet<string>;
  existing: readonly OrphanRow[];
  now: Date;
}): CleanupPlan {
  const youngerThan = now.getTime() - MIN_OBJECT_AGE_DAYS * DAY_MS;
  const dueBefore = now.getTime() - GRACE_DAYS * DAY_MS;
  const known = new Map(existing.map((row) => [row.key, row]));
  const prefixes = CLEANUP_PREFIXES.map((prefix) => `${prefix}/`);

  let checked = 0;
  let referenced = 0;
  let tooRecent = 0;
  let unrecognised = 0;
  const newOrphans: { key: string; sizeBytes: number }[] = [];
  const orphans: OrphanRow[] = [];

  for (const object of objects) {
    if (!prefixes.some((prefix) => object.key.startsWith(prefix))) continue;
    const stem = cleanupStem(object.key);
    if (!stem) {
      unrecognised += 1;
      continue;
    }
    // Zonder datum weten we niet hoe oud het is, en dan geldt het als nieuw.
    if (!object.lastModified || object.lastModified.getTime() > youngerThan) {
      tooRecent += 1;
      continue;
    }
    checked += 1;
    if (referencedStems.has(stem)) {
      referenced += 1;
      continue;
    }
    const row = known.get(object.key);
    if (row) {
      orphans.push(row);
    } else {
      newOrphans.push({ key: object.key, sizeBytes: object.sizeBytes });
      orphans.push({ key: object.key, sizeBytes: object.sizeBytes, firstSeenAt: now });
    }
  }

  const stillOrphan = new Set(orphans.map((row) => row.key));
  const released = existing.filter((row) => !stillOrphan.has(row.key)).map((row) => row.key);
  const due = orphans
    .filter((row) => row.firstSeenAt.getTime() <= dueBefore)
    .sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || a.key.localeCompare(b.key));

  return { checked, referenced, tooRecent, unrecognised, newOrphans, released, orphans, due };
}

/** De dag waarop een wees uit de bucket gaat, als de opruiming aan staat. */
export function deletionDate(firstSeenAt: Date): Date {
  return new Date(firstSeenAt.getTime() + GRACE_DAYS * DAY_MS);
}
