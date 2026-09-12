import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// De deps-stage van elke Dockerfile kopieert enkel de package.json van elke
// workspace en niet heel packages/, want anders draait `npm install` opnieuw
// zodra er één regel in een package verandert (en dat is bij bijna elke deploy
// zo). Docker kan met een glob geen mapstructuur bewaren, dus die lijst is
// handwerk: voeg iemand een package toe zonder de Dockerfiles bij te werken,
// dan ontbreekt die workspace in de image. Voor een package waar de app van
// afhangt, faalt de build luid (npm zoekt @vtk/... op de registry), maar voor
// een nieuwe package die nog nergens geïmporteerd wordt, valt dat pas veel
// later op. Deze test vangt beide gevallen hier op.
const repoRoot = path.join(__dirname, '..', '..', '..');
const packagesDir = path.join(repoRoot, 'packages');

const workspaces = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(path.join(packagesDir, name, 'package.json')))
  .sort();

const dockerfiles = ['web', 'logistiek', 'fakbar'];

describe('deps-stage van de productie-images', () => {
  it.each(dockerfiles)('%s.Dockerfile kopieert elke workspace-manifest', (app) => {
    const dockerfile = readFileSync(
      path.join(repoRoot, 'infra', 'docker', `${app}.Dockerfile`),
      'utf8',
    );
    const depsStage = dockerfile.slice(0, dockerfile.indexOf('\nFROM node:${NODE_VERSION}-alpine AS builder'));

    expect(workspaces.length).toBeGreaterThan(0);
    for (const workspace of workspaces) {
      expect(depsStage).toContain(
        `COPY packages/${workspace}/package.json packages/${workspace}/package.json`,
      );
    }
  });
});
