import { describe, expect, it } from 'vitest';
import {
  AUTO_COLOR_COUNT,
  DRIVER_COLOR_COUNT,
  DRIVER_COLOR_NAMES,
  NEW_DRIVER_COLOR_INDEX,
  driverColorIndex,
  driverColorVar,
  isDriverColorIndex,
  isVehiclePattern,
  vehiclePatternClass,
} from '../lib/driver-colors';

describe('driverColorIndex', () => {
  it('geeft dezelfde persoon altijd dezelfde kleur', () => {
    // Dit is de hele reden dat het een hash is en geen teller: de kleur mag niet
    // verspringen tussen twee renders van dezelfde week.
    expect(driverColorIndex('user_arthur')).toBe(driverColorIndex('user_arthur'));
  });

  it('blijft binnen de tokens die globals.css kent', () => {
    for (const id of ['a', 'user_1', 'ckz9x0000abcd', '']) {
      const index = driverColorIndex(id || 'x');
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(DRIVER_COLOR_COUNT);
    }
  });

  it('geeft 0 zonder chauffeur', () => {
    expect(driverColorIndex(null)).toBe(0);
    expect(driverColorIndex(undefined)).toBe(0);
    expect(driverColorVar(null)).toBe('var(--driver-none)');
  });

  it('laat een ingestelde kleur winnen van de hash', () => {
    const id = 'user_arthur';
    const other = driverColorIndex(id) === 3 ? 4 : 3;
    expect(driverColorIndex(id, { [id]: other })).toBe(other);
    expect(driverColorVar(id, { [id]: other })).toBe(`var(--driver-${other})`);
  });

  it('valt terug op de hash voor wie geen kleur gekozen heeft', () => {
    expect(driverColorIndex('user_lotte', { user_arthur: 2 })).toBe(driverColorIndex('user_lotte'));
  });

  it('negeert een onzinnige kleur uit de databank', () => {
    // Een handmatige update of een oud palet mag geen `var(--driver-99)` opleveren:
    // dat token bestaat niet en het blok zou kleurloos worden, wat er uitziet als
    // "geen chauffeur".
    const id = 'user_arthur';
    for (const bad of [0, -1, 99, 1.5, Number.NaN]) {
      expect(driverColorIndex(id, { [id]: bad })).toBe(driverColorIndex(id));
    }
  });
});

describe('isDriverColorIndex', () => {
  it('aanvaardt enkel hele getallen binnen het palet', () => {
    expect(isDriverColorIndex(1)).toBe(true);
    expect(isDriverColorIndex(DRIVER_COLOR_COUNT)).toBe(true);
    expect(isDriverColorIndex(0)).toBe(false);
    expect(isDriverColorIndex(DRIVER_COLOR_COUNT + 1)).toBe(false);
    expect(isDriverColorIndex(2.5)).toBe(false);
    expect(isDriverColorIndex(null)).toBe(false);
  });
});

describe('vehiclePatternClass', () => {
  it('geeft de klasse voor een gekend patroon', () => {
    expect(vehiclePatternClass('diagonal')).toBe('trip-pattern-diagonal');
    expect(vehiclePatternClass('dots')).toBe('trip-pattern-dots');
  });

  it('geeft een lege string voor geen patroon', () => {
    // Een lege string en geen undefined: de aanroeper plakt dit in een
    // klassenlijst die hij daarna filtert, en "undefined" mag daar niet in staan.
    expect(vehiclePatternClass(null)).toBe('');
    expect(vehiclePatternClass(undefined)).toBe('');
    expect(vehiclePatternClass('none')).toBe('');
    expect(vehiclePatternClass('ruitjes')).toBe('');
  });
});

describe('isVehiclePattern', () => {
  it('herkent enkel de patronen waarvoor er CSS bestaat', () => {
    expect(isVehiclePattern('grid')).toBe(true);
    expect(isVehiclePattern('none')).toBe(true);
    expect(isVehiclePattern('stippen')).toBe(false);
    expect(isVehiclePattern(3)).toBe(false);
  });
});

describe('het palet van veertig (F6.7)', () => {
  it('houdt de automatische kleur van iedereen gelijk aan die van voor de uitbreiding', () => {
    // Het doel was "laat ieder zijn huidige kleur behouden". Deze waarden zijn de
    // uitkomst van de hash toen het palet 24 groot was. Verhoog je de modulus,
    // dan faalt dit, en dan krijgt elke chauffeur zonder gekozen kleur er een
    // andere.
    const verwacht: Record<string, number> = {
      user_arthur: 18,
      user_lotte: 12,
      ckz9x0000abcd: 1,
      a: 23,
      user_1: 21,
      cm4f2k0001xyz: 1,
      'driver-42': 5,
    };
    for (const [id, index] of Object.entries(verwacht)) {
      expect(driverColorIndex(id)).toBe(index);
    }
    expect(AUTO_COLOR_COUNT).toBe(24);
  });

  it('geeft de hash nooit een van de nieuwe kleuren', () => {
    for (let n = 0; n < 500; n += 1) {
      expect(driverColorIndex(`chauffeur-${n}`)).toBeLessThanOrEqual(AUTO_COLOR_COUNT);
    }
  });

  it('laat het team wel een van de nieuwe kleuren kiezen', () => {
    expect(isDriverColorIndex(AUTO_COLOR_COUNT + 1)).toBe(true);
    expect(isDriverColorIndex(DRIVER_COLOR_COUNT)).toBe(true);
    expect(driverColorIndex('user_arthur', { user_arthur: DRIVER_COLOR_COUNT })).toBe(DRIVER_COLOR_COUNT);
  });

  it('heeft een naam voor elke kleur en een nieuwe chauffeur start op Salie', () => {
    expect(DRIVER_COLOR_NAMES).toHaveLength(DRIVER_COLOR_COUNT);
    expect(new Set(DRIVER_COLOR_NAMES).size).toBe(DRIVER_COLOR_COUNT);
    expect(DRIVER_COLOR_NAMES[NEW_DRIVER_COLOR_INDEX - 1]).toBe('Salie');
  });
});
