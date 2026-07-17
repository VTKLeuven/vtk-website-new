#!/usr/bin/env node
/**
 * Bewaakt dat package-lock.json de native binaries voor ELK platform bevat.
 *
 * npm laat bij een incrementele `npm install` soms de optionalDependencies van
 * andere platforms uit de lockfile vallen (npm/cli#4828). De lockfile blijft
 * dan werken op de machine waar hij geschreven is, maar `npm ci` op een ander
 * platform installeert de binary niet: Linux (server/CI) en macOS krijgen dan
 * een pakket zonder .node-bestand en alles crasht pas bij het builden.
 *
 * Dit is al twee keer gebeurd (@rolldown/binding-*, lightningcss-*), telkens
 * onopgemerkt tot een ander platform stukging. Vandaar deze check.
 *
 * Fix bij een failure: `rm -rf node_modules package-lock.json && npm install`
 * en commit de lockfile. Een verse resolve haalt alle platforms binnen.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

/**
 * Namen van native-binary pakketten: ze eindigen op een platform-tripel zoals
 * `-linux-x64-gnu`, `-darwin-arm64`, `-win32-x64-msvc`, `-wasm32-wasi`. Enkel
 * die optionalDependencies moeten compleet zijn; gewone optionele deps (bv.
 * fsevents-achtige extra's) mogen ontbreken.
 */
const PLATFORM_PKG =
  /-(android|darwin|freebsd|linux|linuxmusl|win32|wasm32|openharmony)-[a-z0-9]+(-(gnu|musl|msvc|gnueabihf|wasi|eabi))?$/;

/** Alle pakketnamen die in de lockfile een entry hebben (hoisted of genest). */
const present = new Set();
for (const path of Object.keys(lock.packages)) {
  const i = path.lastIndexOf("node_modules/");
  if (i !== -1) present.add(path.slice(i + "node_modules/".length));
}

const missing = [];
for (const [path, meta] of Object.entries(lock.packages)) {
  for (const name of Object.keys(meta.optionalDependencies ?? {})) {
    if (!PLATFORM_PKG.test(name)) continue;
    if (present.has(name)) continue;
    const owner = path === "" ? "<root>" : path.replace(/^node_modules\//, "");
    missing.push({ owner, name });
  }
}

if (missing.length === 0) {
  const count = [...present].filter((n) => PLATFORM_PKG.test(n)).length;
  console.log(`package-lock.json OK: ${count} platform-binaries aanwezig.`);
  process.exit(0);
}

const byOwner = new Map();
for (const { owner, name } of missing) {
  if (!byOwner.has(owner)) byOwner.set(owner, []);
  byOwner.get(owner).push(name);
}

console.error(
  `package-lock.json mist ${missing.length} native binary-entries. ` +
    `npm ci breekt hierdoor op de platforms die ontbreken (Linux op de server en in CI, macOS bij de meeste devs).\n`,
);
for (const [owner, names] of byOwner) {
  console.error(`  ${owner}:`);
  for (const name of names.sort()) console.error(`    - ${name}`);
}
console.error(
  "\nOorzaak: npm liet de optionalDependencies van andere platforms vallen (npm/cli#4828).\n" +
    "Fix: rm -rf node_modules package-lock.json && npm install, en commit de lockfile.",
);
process.exit(1);
