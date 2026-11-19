import { describe, expect, it } from 'vitest';
import { envSaysProduction } from '@vtk/db/productionGuard';

// De seed weigert op productie (packages/db/src/productionGuard.ts). Valt deze
// herkenning stil weg, dan staan de prototype-accounts weer op /praesidium.
describe('envSaysProduction', () => {
  it('herkent vtk.be in BETTER_AUTH_URL of VTK_MAIN_URL', () => {
    expect(envSaysProduction({ BETTER_AUTH_URL: 'https://vtk.be' })).toBe(true);
    expect(envSaysProduction({ VTK_MAIN_URL: '"https://www.vtk.be/"' })).toBe(true);
  });

  it('ziet dev en lokaal niet als productie', () => {
    expect(envSaysProduction({ BETTER_AUTH_URL: 'https://dev.vtk.be' })).toBe(false);
    expect(envSaysProduction({ BETTER_AUTH_URL: 'http://localhost:3000' })).toBe(false);
    expect(envSaysProduction({})).toBe(false);
  });
});
