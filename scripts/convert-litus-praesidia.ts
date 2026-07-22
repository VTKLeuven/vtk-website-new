/**
 * Converteer de Litus-export (litus_old_praesidia.json) naar het formaat dat
 * import-praesidium-history.ts verwacht. Groepeert de platte membership-rijen per
 * persoon, cast de velden (unit_name -> post, academic_year_start -> jaar,
 * coordinator -> rol, photo_path -> foto-URL) en schrijft er een nieuw JSON uit.
 *
 * Geen npm-script; draai rechtstreeks vanuit de repo-root:
 *   npx tsx scripts/convert-litus-praesidia.ts
 *   npx tsx scripts/convert-litus-praesidia.ts <input.json> <output.json>
 *
 * Daarna importeren met:
 *   npm run import:praesidium -- scripts/praesidium-history.json --dry-run
 */

import { readFileSync, writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Config. De knoppen die je normaal wil aanpassen staan hier.
// ---------------------------------------------------------------------------

const CONFIG = {
  /** Bron- en doelbestand (of geef ze mee als 1e/2e argument). */
  inputPath: process.argv[2] ?? 'scripts/litus_old_praesidia.json',
  outputPath: process.argv[3] ?? 'scripts/praesidium-history.json',

  /** Prefix voor de stabiele person-id in het doelbestand. person_id 4437 wordt
   *  "litus-4437"; die id bepaalt in het import-script de dummy-e-mail. */
  idPrefix: 'litus-',

  /**
   * Startjaren die NIET geimporteerd worden. 26-27 (startjaar 2026) is het
   * huidige praesidium: dat wordt via de GUI beheerd, niet uit de oude website
   * ingeladen. Rijen van deze jaren worden overgeslagen; wie enkel in zo'n jaar
   * voorkomt, komt niet in het doelbestand.
   */
  skipYears: [2003, 2026],

  /**
   * Basis-URL voor profielfoto's. In de Litus-export is `photo_path` een hash
   * (bv. "15bd27cc..."); het import-script downloadt de foto van een URL. Zet dit
   * op de echte Litus-media-basis zodat de foto's mee komen. Blijft dit leeg, dan
   * worden alle foto's overgeslagen (leden komen dan zonder foto binnen).
   * De volledige URL wordt `photoBaseUrl + photo_path` (pas `buildPhotoUrl` aan
   * als er iets tussen moet, bv. een submap of een extensie).
   */
  //photoBaseUrl: '', // bv. "https://vtk.be/media/" of de Litus-file-download-URL
  photoBaseUrl: 'https://vtk.be/_common/profile/', // bv. "https://vtk.be/media/" of de Litus-file-download-URL

  /**
   * Cast van de Litus `unit_name` naar de post-referentie in het nieuwe systeem.
   * De waarde matcht in het import-script op post-code, slug of naam (NL/EN);
   * bestaat de post nog niet, dan maakt het import-script ze aan. De 15 huidige
   * posten hebben dezelfde naam als in Litus, dus die staan op zichzelf gemapt.
   * "Lustrum" bestaat niet meer als post en wordt straks aangemaakt (active=false).
   * Pas een waarde aan om een oude unit naar een andere/hernoemde post te sturen.
   */
  unitMap: {
    Activiteiten: 'Activiteiten',
    Bedrijvenrelaties: 'Bedrijvenrelaties',
    Communicatie: 'Communicatie',
    Cultuur: 'Cultuur',
    Cursusdienst: 'Cursusdienst',
    Development: 'Development',
    Fakbar: 'Fakbar',
    'Groep 5': 'Groep 5',
    Internationaal: 'Internationaal',
    IT: 'IT',
    Logistiek: 'Logistiek',
    Lustrum: 'Lustrum',
    Onderwijs: 'Onderwijs',
    Onthaal: 'Onthaal',
    Sport: 'Sport',
    Theokot: 'Theokot',
  } as Record<string, string>,

  /**
   * Posten die al in de DB geseed zijn (op naam). Elke doelpost die hier niet in
   * staat, komt in het doelbestand onder `posts` terecht als `active: false`,
   * zodat een nieuwe historische post expliciet en inactief aangemaakt wordt.
   */
  knownPosts: [
    'Groep 5',
    'Activiteiten',
    'Bedrijvenrelaties',
    'Communicatie',
    'Cultuur',
    'Cursusdienst',
    'Development',
    'Fakbar',
    'Internationaal',
    'IT',
    'Logistiek',
    'Onderwijs',
    'Onthaal',
    'Sport',
    'Theokot',
  ],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LitusRow = {
  person_id: number;
  first_name: string;
  last_name: string;
  photo_path: string | null;
  academic_year_start: string;
  unit_name: string;
  coordinator: boolean;
};

type OutMembership = {
  post: string;
  year: number;
  role?: 'LEAD';
  order?: number;
};

type OutPerson = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  photo?: string;
  memberships: OutMembership[];
};

type OutPost = { name: string; active: boolean };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const log = (msg: string) => process.stdout.write(`[${new Date().toTimeString().slice(0, 8)}] ${msg}\n`);

const buildPhotoUrl = (hash: string): string | null => (CONFIG.photoBaseUrl ? `${CONFIG.photoBaseUrl}${hash}` : null);

const mapUnit = (unit: string): string => CONFIG.unitMap[unit] ?? unit;

/** "2015-07-15 00:00:00" -> 2015. Gooit bij een onherkenbaar jaar. */
function parseYear(raw: string): number {
  const m = /^(\d{4})/.exec(raw.trim());
  if (!m) throw new Error(`onherkenbaar academic_year_start: ${JSON.stringify(raw)}`);
  return Number(m[1]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  log(`Start conversie: ${CONFIG.inputPath} -> ${CONFIG.outputPath}`);
  if (!CONFIG.photoBaseUrl) {
    log('Let op: CONFIG.photoBaseUrl is leeg; foto-URLs worden niet gezet (leden komen zonder foto binnen).');
  }

  log('Stap 1/3: bronbestand inlezen...');
  let rows: LitusRow[];
  try {
    rows = JSON.parse(readFileSync(CONFIG.inputPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`Kon ${CONFIG.inputPath} niet lezen/parsen: ${(err as Error).message}\n`);
    process.exit(1);
  }
  if (!Array.isArray(rows)) {
    process.stderr.write('Verwacht een JSON-array van membership-rijen.\n');
    process.exit(1);
  }
  log(`  ${rows.length} rijen gelezen`);

  log('Stap 2/3: rijen groeperen per persoon en velden casten...');
  const people = new Map<number, OutPerson>();
  const knownSet = new Set(CONFIG.knownPosts.map((p) => p.toLowerCase()));
  const skipYears = new Set(CONFIG.skipYears);
  const newPosts = new Map<string, OutPost>();
  const unmappedUnits = new Set<string>();

  let photosKept = 0;
  let photosSkipped = 0;
  let skippedRows = 0;

  const progressEvery = Math.max(1, Math.floor(rows.length / 10));
  let seen = 0;
  for (const r of rows) {
    seen++;
    if (seen % progressEvery === 0 || seen === rows.length) {
      log(`  ${seen}/${rows.length} rijen verwerkt (${people.size} personen tot nu toe)`);
    }
    const year = parseYear(r.academic_year_start);
    if (skipYears.has(year)) {
      skippedRows++;
      continue;
    }

    if (!CONFIG.unitMap[r.unit_name]) unmappedUnits.add(r.unit_name);
    const post = mapUnit(r.unit_name);

    // Nieuwe (niet-geseede) posten verzamelen zodat ze inactief aangemaakt worden.
    if (!knownSet.has(post.toLowerCase()) && !newPosts.has(post.toLowerCase())) {
      newPosts.set(post.toLowerCase(), { name: post, active: false });
    }

    let person = people.get(r.person_id);
    if (!person) {
      person = {
        id: `${CONFIG.idPrefix}${r.person_id}`,
        name: `${r.first_name} ${r.last_name}`.trim(),
        firstName: r.first_name,
        lastName: r.last_name,
        memberships: [],
      };
      people.set(r.person_id, person);
    }

    // Eerste beschikbare foto voor deze persoon wint (sommige rijen zijn null).
    if (!person.photo && r.photo_path) {
      const url = buildPhotoUrl(r.photo_path);
      if (url) {
        person.photo = url;
        photosKept++;
      } else {
        photosSkipped++;
      }
    }

    const membership: OutMembership = { post, year };
    if (r.coordinator) membership.role = 'LEAD';
    person.memberships.push(membership);
  }

  // Stabiele, leesbare volgorde: personen alfabetisch, memberships op jaar+post.
  const outPeople = [...people.values()].sort(
    (a, b) => a.lastName.localeCompare(b.lastName, 'nl') || a.firstName.localeCompare(b.firstName, 'nl')
  );
  for (const p of outPeople) {
    p.memberships.sort((a, b) => a.year - b.year || a.post.localeCompare(b.post, 'nl'));
  }

  const output = {
    posts: [...newPosts.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl')),
    people: outPeople,
  };

  log('Stap 3/3: doelbestand schrijven...');
  writeFileSync(CONFIG.outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  log('Klaar.');

  process.stdout.write(`Geschreven: ${CONFIG.outputPath}\n`);
  process.stdout.write(`  Rijen ingelezen:   ${rows.length}\n`);
  if (skippedRows > 0) {
    process.stdout.write(`  Rijen overgeslagen: ${skippedRows} (jaren ${CONFIG.skipYears.join(', ')})\n`);
  }
  process.stdout.write(`  Personen:          ${outPeople.length}\n`);
  process.stdout.write(
    `  Nieuwe posten:     ${output.posts.length}${output.posts.length ? ' (' + output.posts.map((p) => p.name).join(', ') + ')' : ''}\n`
  );
  process.stdout.write(`  Foto's (URL gezet): ${photosKept}\n`);
  if (photosSkipped > 0 || !CONFIG.photoBaseUrl) {
    process.stdout.write(
      `  Foto's overgeslagen: ${photosSkipped}${!CONFIG.photoBaseUrl ? ' (zet CONFIG.photoBaseUrl om ze mee te nemen)' : ''}\n`
    );
  }
  if (unmappedUnits.size > 0) {
    process.stdout.write(
      `  Let op, units zonder expliciete mapping (identity gebruikt): ${[...unmappedUnits].join(', ')}\n`
    );
  }
}

main();
