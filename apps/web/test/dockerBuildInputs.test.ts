import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// De builder-stage van elke Dockerfile kopieert enkel wat die build leest, en
// niet meer de hele repo: zo is een app waaraan niets veranderde bij een deploy
// een cache-hit in plaats van een volledige `next build`. Logistiek en fakbar
// sommen daarvoor op welke packages ze gebruiken. Importeert een van beide
// later een package die daar niet bij staat (rechtstreeks, of via een andere
// package), dan faalt de build pas op de server; deze test vangt dat voor de
// push. Ze leest de echte imports en niet de package.json: fakbar importeert
// @vtk/mail zonder het te declareren.
const repoRoot = path.join(__dirname, '..', '..', '..');
const apps = ['web', 'logistiek', 'fakbar'] as const;

const SKIP = new Set(['node_modules', '.next', 'test', 'e2e', 'test-results', 'playwright-report']);
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs|css)$/;

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (SOURCE.test(entry.name) || entry.name === 'tsconfig.json') out.push(full);
  }
  return out;
}

function vtkImports(dir: string): Set<string> {
  const found = new Set<string>();
  for (const file of filesUnder(dir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/['"]@vtk\/([a-z0-9-]+)/g)) {
      found.add(match[1]!);
    }
  }
  return found;
}

/** Alles wat een app nodig heeft, ook wat een package die ze gebruikt zelf importeert. */
function transitivePackages(app: string): string[] {
  const seen = new Set<string>();
  const queue = [...vtkImports(path.join(repoRoot, 'apps', app))];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const dir = path.join(repoRoot, 'packages', name);
    if (statSync(dir, { throwIfNoEntry: false })?.isDirectory()) queue.push(...vtkImports(dir));
  }
  return [...seen].sort();
}

/** De bronnen van de COPY's in de builder-stage die uit de buildcontext lezen. */
function builderCopies(app: string): string[] {
  const dockerfile = readFileSync(path.join(repoRoot, 'infra', 'docker', `${app}.Dockerfile`), 'utf8');
  const start = dockerfile.indexOf(' AS builder');
  const stage = dockerfile.slice(start, dockerfile.indexOf('\nFROM ', start));
  return [...stage.matchAll(/^COPY (?!--from)(\S+) /gm)].map((match) => match[1]!.replace(/\/$/, ''));
}

describe('builder-stage van de productie-images', () => {
  it.each(apps)('%s.Dockerfile kopieert elke package die de app gebruikt', (app) => {
    const copied = builderCopies(app);
    const needed = transitivePackages(app);
    expect(needed.length).toBeGreaterThan(0);
    for (const name of needed) {
      expect(
        copied.includes('packages') || copied.includes(`packages/${name}`),
        `${app} gebruikt @vtk/${name}, maar infra/docker/${app}.Dockerfile kopieert packages/${name} niet in de builder-stage`,
      ).toBe(true);
    }
  });

  it.each(apps)('%s.Dockerfile kopieert de app zelf en niet meer de hele repo', (app) => {
    const copied = builderCopies(app);
    expect(copied).toContain(`apps/${app}`);
    expect(copied).not.toContain('.');
  });

  it('volgt een import via een andere package', () => {
    // @vtk/auth importeert @vtk/db; zonder die stap zou een app die enkel auth
    // importeert, een kapotte image opleveren.
    expect(transitivePackages('fakbar')).toEqual(expect.arrayContaining(['auth', 'db', 'mail', 'tsconfig', 'ui']));
  });
});

describe('welke apps de CI-build bouwt (scripts/affected-apps.mjs)', () => {
  const read = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8');
  const load = () => import(pathToFileURL(path.join(repoRoot, 'scripts', 'affected-apps.mjs')).href);

  it.each([
    [['docs/design-decisions.md'], []],
    [['apps/logistiek/app/page.tsx'], ['logistiek']],
    [['apps/fakbar/app/page.tsx', 'docs/x.md'], ['fakbar']],
    [['packages/i18n/src/messages/nl.json'], ['web']],
    [['packages/gallery/src/index.ts'], ['web', 'fakbar']],
    [['packages/db/prisma/schema.prisma'], ['web', 'logistiek', 'fakbar']],
    [['package-lock.json'], ['web', 'logistiek', 'fakbar']],
    [['packages/i18n/package.json'], ['web', 'logistiek', 'fakbar']],
    [['apps/web/test/foo.test.ts', 'apps/web/e2e/x.spec.ts'], []],
    [['infra/docker/fakbar.Dockerfile'], ['fakbar']],
    [['infra/docker-compose.yml', 'infra/deploy.sh', 'mobile/app.json', 'README.md'], []],
    [['.github/workflows/deploy-dev.yml'], ['web', 'logistiek', 'fakbar']],
  ])('%j bouwt %j', async (changed, expected) => {
    const { affectedApps } = await load();
    expect(affectedApps(changed, read)).toEqual(expected);
  });

  it('leest .dockerignore zoals Docker: een map sluit alles eronder uit, ! zet terug', async () => {
    const { ignoreRules, isIgnored } = await load();
    const rules = ignoreRules('docs\napps/*/test\n**/node_modules\n!docs/keep.md\n');
    expect(isIgnored('docs/a/b.md', rules)).toBe(true);
    expect(isIgnored('docs/keep.md', rules)).toBe(false);
    expect(isIgnored('apps/web/test/x.ts', rules)).toBe(true);
    expect(isIgnored('apps/web/lib/test.ts', rules)).toBe(false);
    expect(isIgnored('packages/ui/node_modules/x/index.js', rules)).toBe(true);
    expect(isIgnored('design-tokens.css', ignoreRules('design'))).toBe(false);
  });
});
