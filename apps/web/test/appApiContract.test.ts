import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_API_VERSION,
  appLocaleFrom,
  appPushRegisterSchema,
  appPushUnregisterSchema,
} from '@/lib/app-api/contract';
import { compareVersions, minimumAppVersion } from '@/lib/app-api/version';

/**
 * Het contract met de VTK-app.
 *
 * Twee dingen worden hier bewaakt. Eerst de vorm zelf: wat de app binnenkrijgt en
 * wat ze mag sturen. En daarnaast, in de laatste test, of de kopie in de app-repo
 * nog gelijk is aan het origineel; dat is de enige goedkope bescherming tegen de
 * drift die een gekopieerd bestand nu eenmaal heeft.
 */
describe('app-api contract', () => {
  it('heeft een versie in het pad en in de payload', () => {
    expect(APP_API_VERSION).toBe(1);
  });

  it('valt terug op Nederlands bij een onbekende taal', () => {
    expect(appLocaleFrom('en')).toBe('en');
    expect(appLocaleFrom('nl')).toBe('nl');
    expect(appLocaleFrom('fr')).toBe('nl');
    expect(appLocaleFrom(null)).toBe('nl');
  });

  it('aanvaardt enkel een echt Expo-pushtoken', () => {
    const valid = { token: 'ExponentPushToken[abcdefghijklmnop]', platform: 'ios' as const };
    expect(appPushRegisterSchema.parse(valid).token).toBe(valid.token);
    expect(appPushRegisterSchema.parse({ ...valid, platform: 'android' }).platform).toBe('android');

    expect(() => appPushRegisterSchema.parse({ ...valid, token: 'zomaar-een-string' })).toThrow();
    expect(() => appPushRegisterSchema.parse({ ...valid, platform: 'web' })).toThrow();
    expect(() => appPushUnregisterSchema.parse({ token: '' })).toThrow();
  });

  it('vergelijkt versies op major, minor en patch', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.9', '1.1.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    // Een niet-gezette of onzinnige omgevingsvariabele mag niemand buitensluiten.
    expect(minimumAppVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  /**
   * De app-repo staat naast deze repo op een ontwikkelmachine, maar niet in CI.
   * Daar slaat deze test zichzelf over: hem laten falen zou de pipeline laten
   * afhangen van een map die er niet hoort te zijn.
   */
  it('is byte-voor-byte gelijk aan de kopie in de app-repo', () => {
    const original = new URL('../lib/app-api/contract.ts', import.meta.url).pathname;
    const copy = `${process.env.HOME}/vtk-app/src/api/contract.ts`;

    let copied: string;
    try {
      copied = readFileSync(copy, 'utf8');
    } catch {
      return; // app-repo staat hier niet; niets te vergelijken
    }

    expect(copied).toBe(readFileSync(original, 'utf8'));
  });
});
