import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// De productiecontainer draait `next start` op een image die maar een handvol
// bestanden uit apps/web bevat. next.config.ts hoort daarbij, maar Next 16
// transpileert die bij elke start apart (next-config-ts/transpile-config.js
// leest exact dat ene bestand). Een relatieve import wordt daarbij geen bundel:
// hij blijft een `require()` naar de bron. Staat die bron niet in de image, dan
// crasht de container in een herstartlus met "Cannot find module", en dat zie je
// niet tijdens het builden, want daar staat de hele repo nog naast de config.
//
// Deze test kijkt daarom of elke map waar next.config.ts uit importeert ook
// echt in de runner-stage van de Dockerfile gekopieerd wordt.
const appDir = path.join(__dirname, '..');
const config = readFileSync(path.join(appDir, 'next.config.ts'), 'utf8');
const dockerfile = readFileSync(
  path.join(appDir, '..', '..', 'infra', 'docker', 'web.Dockerfile'),
  'utf8',
);

function relativeImports(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/(?:from|require\()\s*['"](\.[^'"]+)['"]/g)) {
    found.add(match[1]);
  }
  return [...found];
}

// De runner-stage begint bij de laatste FROM; COPY-regels daarvoor gaan naar de
// build-stages en zeggen niets over wat de container uiteindelijk bij zich heeft.
function runnerCopiedPaths(): string[] {
  const runnerStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
  return [...runnerStage.matchAll(/^COPY --from=\S+ \/repo\/(\S+)/gm)].map((m) => m[1]);
}

describe('next.config.ts in de productie-image', () => {
  it('heeft elk bestand dat het importeert naast zich staan', () => {
    const copied = runnerCopiedPaths();
    for (const specifier of relativeImports(config)) {
      const target = path.posix.normalize(path.posix.join('apps/web', specifier));
      const covered = copied.some(
        (copiedPath) => target === copiedPath || target.startsWith(`${copiedPath}/`),
      );
      expect(covered, `next.config.ts importeert ${specifier}, maar ${target} wordt niet gekopieerd in de runner-stage van infra/docker/web.Dockerfile`).toBe(true);
    }
  });

  it('herkent een import die niet meegaat naar de image', () => {
    // Zonder deze controle zou de test hierboven ook slagen als de regex niets
    // vindt, en dan bewaakt ze niets meer.
    expect(relativeImports(config).length).toBeGreaterThan(0);
    expect(relativeImports('import { X } from "./verzonnen/pad";')).toEqual(['./verzonnen/pad']);
    const copied = runnerCopiedPaths();
    expect(copied.some((p) => 'apps/web/verzonnen/pad'.startsWith(p))).toBe(false);
  });
});
