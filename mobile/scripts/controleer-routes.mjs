#!/usr/bin/env node
/**
 * Controleert dat elk adres waar de app naartoe stuurt, ook echt bestaat.
 *
 * Twee dingen kunnen stilletjes misgaan. De routebestanden in `app/(tabs)/**`
 * worden gemaakt uit `TAB_ROUTES`, dus die kunnen achterlopen als iemand de kaart
 * aanpast en `npm run routes` vergeet. En een scherm kan naar een adres duwen dat
 * nergens staat; dat compileert, want het is gewoon een string, en het valt pas op
 * als iemand op de knop drukt en op een leeg scherm belandt.
 *
 * Draaien: `npm run routes:check`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fouten = [];

/** Alle bestanden onder een map, als pad -> inhoud. */
function inhoud(dir) {
  const uit = new Map();
  const loop = (map) => {
    for (const naam of readdirSync(map, { withFileTypes: true })) {
      const pad = join(map, naam.name);
      if (naam.isDirectory()) loop(pad);
      else uit.set(relative(root, pad), readFileSync(pad, 'utf8'));
    }
  };
  if (existsSync(dir)) loop(dir);
  return uit;
}

/**
 * 1. Lopen de gemaakte bestanden nog gelijk met de kaart?
 *
 * De generator opnieuw draaien en het resultaat vergelijken met wat er stond. Dat
 * is minder omslachtig dan het lijkt: de bestanden zijn één regel lang en de
 * generator is de enige die ze schrijft.
 */
const gemaakt = ['app/(tabs)/(home)', 'app/(tabs)/kalender', 'app/(tabs)/tickets', 'app/(tabs)/broodjes', 'app/(tabs)/meer', 'app/(oud)'];
const voor = new Map(gemaakt.flatMap((d) => [...inhoud(join(root, d))]));
execFileSync('node', [join(root, 'scripts/genereer-routes.mjs')], { stdio: 'pipe' });
const na = new Map(gemaakt.flatMap((d) => [...inhoud(join(root, d))]));
for (const [pad, tekst] of na) {
  if (voor.get(pad) !== tekst) fouten.push(`${pad} liep achter op src/navigation.ts; draai npm run routes`);
}
for (const pad of voor.keys()) {
  if (!na.has(pad)) fouten.push(`${pad} hoort niet meer bij src/navigation.ts; draai npm run routes`);
}

/** 2. Bestaat elk adres waar een scherm naartoe duwt? */
const routes = new Set();
(function loop(dir) {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) {
      loop(pad);
      continue;
    }
    if (!naam.endsWith('.tsx') || naam === '_layout.tsx') continue;
    const url = `/${relative(join(root, 'app'), pad)
      .replace(/\.tsx$/, '')
      .replace(/\/index$/, '')
      .split('/')
      .filter((deel) => !deel.startsWith('('))
      .join('/')}`;
    routes.add(url.replace(/\[\w+\]/g, '*') || '/');
  }
})(join(root, 'app'));

const bronnen = [];
(function loop(dir) {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) loop(pad);
    else if (/\.tsx?$/.test(naam)) bronnen.push(pad);
  }
})(join(root, 'src'));

// `push('/x')`, `replace(\`/x/${y}\`)`, `pathname: '/x'`.
const ADRES = /(?:push|replace|navigate)\(\s*['"`](\/[^'"`\s)]*)['"`]|pathname:\s*['"`](\/[^'"`\s]*)['"`]/g;

for (const bron of bronnen) {
  const tekst = readFileSync(bron, 'utf8');
  for (const [, a, b] of tekst.matchAll(ADRES)) {
    const adres = (a ?? b).split('?')[0].replace(/\$\{[^}]*\}/g, '*').replace(/\/$/, '') || '/';
    if (!routes.has(adres)) {
      fouten.push(`${relative(root, bron)}: ${adres} bestaat niet als route`);
    }
  }
}

/**
 * 3. De vertaaltabel van het CMS.
 *
 * `nativeRouteFor` geeft zijn adres als waarde terug in plaats van het ergens in
 * te tikken, dus de scan hierboven ziet die niet. Het is net de tabel die verkeerd
 * kan komen te staan wanneer een scherm hernoemd wordt.
 */
const tabel = readFileSync(join(root, 'src/nativeRoute.ts'), 'utf8');
const blok = tabel.match(/const NATIVE_ROUTES[^{]*\{([\s\S]*?)\n\};/);
for (const [, adres] of (blok?.[1] ?? '').matchAll(/:\s*'(\/[^']*)'/g)) {
  if (!routes.has(adres)) fouten.push(`src/nativeRoute.ts: ${adres} bestaat niet als route`);
}

if (fouten.length) {
  console.error(`${fouten.length} probleem(en):\n\n${fouten.join('\n')}`);
  process.exit(1);
}
console.log(`${routes.size} routes, alle adressen kloppen`);
