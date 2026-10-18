#!/usr/bin/env node
/**
 * Welke apps een reeks commits raakt, gelezen uit hun Dockerfile.
 *
 *   node scripts/affected-apps.mjs <basis-sha> [doel-sha]
 *
 * Schrijft de geraakte apps (`web logistiek fakbar`) met een spatie ertussen
 * naar stdout, of niets wanneer er geen enkele geraakt is. Zonder basis, of
 * wanneer die basis niet te vergelijken valt (een force-push, een sha die er
 * niet is), komen alle apps terug: bij twijfel bouwen.
 *
 * **De Dockerfile is de bron van waarheid.** Een app is geraakt wanneer een
 * gewijzigd bestand in haar buildcontext zit en een `COPY` van haar Dockerfile
 * het meeneemt (niet `COPY --from`, dat komt uit een eerdere stage), of wanneer
 * haar Dockerfile zelf verandert. `.dockerignore` geldt ook hier. Dat is precies
 * waarop Docker op de server zijn cache baseert, dus de CI-build en de deploy
 * kunnen niet uit elkaar lopen: wat hier "niet geraakt" is, is daar een
 * cache-hit. Zie infra/deploy.sh en .github/workflows/deploy-dev.yml.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APPS = ["web", "logistiek", "fakbar"];

/**
 * Verandert de CI-build zelf, dan bouwt ze alles: anders test een wijziging
 * aan de workflow of aan dit script precies niets.
 */
const ALWAYS_ALL = [".github/workflows/deploy-dev.yml", "scripts/affected-apps.mjs", ".dockerignore"];

/** De bronpaden van elke `COPY` die uit de buildcontext leest. */
export function copySources(dockerfile) {
  const lines = dockerfile.replace(/\\\r?\n/g, " ").split(/\r?\n/);
  const sources = [];
  for (const line of lines) {
    const tokens = line.trim().split(/\s+/);
    if (tokens[0]?.toUpperCase() !== "COPY") continue;
    if (tokens.some((token) => token.startsWith("--from"))) continue;
    const args = tokens.slice(1).filter((token) => !token.startsWith("--"));
    for (const source of args.slice(0, -1)) {
      sources.push(source.replace(/^\.\//, "").replace(/\/$/, "").replace(/^\.$/, ""));
    }
  }
  return sources;
}

function globToRegExp(pattern) {
  let out = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      out += ".*";
      index += 1;
      if (pattern[index + 1] === "/") index += 1;
    } else if (char === "*") {
      out += "[^/]*";
    } else if (char === "?") {
      out += "[^/]";
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return out;
}

/** De regels uit `.dockerignore`, in volgorde; een `!` zet iets weer terug. */
export function ignoreRules(dockerignore) {
  return dockerignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const negate = line.startsWith("!");
      const pattern = (negate ? line.slice(1) : line).replace(/^\/+/, "").replace(/\/+$/, "");
      // Een patroon sluit ook alles eronder uit: `docs` neemt docs/a.md mee.
      return { negate, regex: new RegExp(`^${globToRegExp(pattern)}(/.*)?$`) };
    });
}

/** Valt dit bestand buiten de buildcontext? De laatste regel die past, wint. */
export function isIgnored(file, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.regex.test(file)) ignored = !rule.negate;
  }
  return ignored;
}

function coveredBy(file, source) {
  if (source === "") return true;
  if (/[*?]/.test(source)) return new RegExp(`^${globToRegExp(source)}(/.*)?$`).test(file);
  return file === source || file.startsWith(`${source}/`);
}

/**
 * De apps die deze gewijzigde bestanden raken.
 *
 * `read` leest een bestand uit de repo, zodat een test zelf Dockerfiles kan
 * meegeven.
 */
export function affectedApps(changedFiles, read) {
  if (changedFiles.some((file) => ALWAYS_ALL.includes(file))) return [...APPS];
  const rules = ignoreRules(read(".dockerignore"));
  return APPS.filter((app) => {
    const dockerfilePath = `infra/docker/${app}.Dockerfile`;
    if (changedFiles.includes(dockerfilePath)) return true;
    const sources = copySources(read(dockerfilePath));
    return changedFiles.some(
      (file) => !isIgnored(file, rules) && sources.some((source) => coveredBy(file, source)),
    );
  });
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  const [base, head = "HEAD"] = process.argv.slice(2);

  let changed;
  if (base) {
    try {
      // `--no-renames`: een verplaatst bestand telt op zijn oude én zijn nieuwe
      // plek, want het verdwijnt uit de ene buildcontext en komt in de andere.
      changed = execFileSync("git", ["diff", "--name-only", "--no-renames", base, head], {
        cwd: root,
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean);
    } catch {
      changed = null;
    }
  }

  const apps = changed ? affectedApps(changed, read) : APPS;
  process.stdout.write(`${apps.join(" ")}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
