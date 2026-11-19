import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTO_COLOR_COUNT,
  CUSTOM_COLOR_START,
  DRIVER_COLOR_COUNT,
  DRIVER_COLOR_NAMES,
  NEW_DRIVER_COLOR_INDEX,
  customColorCss,
  driverColorIndex,
  driverColorVar,
  isCustomDriverColor,
  isDriverColorIndex,
  isVehiclePattern,
  parseCustomColor,
  serializeCustomColor,
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

describe('een eigen kleur met schuiven', () => {
  it('bewaart en leest dezelfde kleur terug', () => {
    const color = { hue: 210, chroma: 60, tone: 35 };
    expect(serializeCustomColor(color)).toBe('210,60,35');
    expect(parseCustomColor('210,60,35')).toEqual(color);
    expect(parseCustomColor(serializeCustomColor(CUSTOM_COLOR_START))).toEqual(CUSTOM_COLOR_START);
  });

  it('aanvaardt de uiterste standen van elke schuif', () => {
    expect(isCustomDriverColor({ hue: 0, chroma: 0, tone: 0 })).toBe(true);
    expect(isCustomDriverColor({ hue: 359, chroma: 100, tone: 100 })).toBe(true);
  });

  it('weigert alles wat de schuiven niet kunnen geven', () => {
    // Een tint van 360 is dezelfde als 0, en de schuif stopt op 359: zo is er één
    // schrijfwijze per kleur en vergelijkt "staat er al" op de tekst.
    for (const bad of [
      { hue: 360, chroma: 0, tone: 0 },
      { hue: -1, chroma: 0, tone: 0 },
      { hue: 10, chroma: 101, tone: 0 },
      { hue: 10, chroma: 0, tone: 101 },
      { hue: 1.5, chroma: 0, tone: 0 },
      { hue: Number.NaN, chroma: 0, tone: 0 },
      { hue: '10', chroma: 0, tone: 0 },
      { hue: 10, chroma: 0 },
      null,
      42,
    ]) {
      expect(isCustomDriverColor(bad)).toBe(false);
    }
  });

  it('negeert een tekst in de databank die geen kleur is', () => {
    // Een handmatige update of een tekst uit een latere versie mag geen kleur
    // `NaN` opleveren: dat is een blok zonder vulling, en dat leest als "geen
    // chauffeur".
    for (const bad of ['', null, undefined, '1,2', '1,2,3,4', '360,0,0', 'a,b,c', ' 10,10,10', '10,10,-1', '10.5,10,10', '1e2,10,10']) {
      expect(parseCustomColor(bad)).toBeNull();
    }
  });

  it('laat een eigen kleur winnen van het palet en van de hash', () => {
    const id = 'user_arthur';
    const custom = { hue: 20, chroma: 80, tone: 50 };
    expect(driverColorVar(id, { [id]: custom })).toBe(customColorCss(custom));
    expect(driverColorVar(id, { [id]: custom })).not.toBe(driverColorVar(id));
    expect(driverColorVar(id, { [id]: 5 })).toBe('var(--driver-5)');
  });

  it('geeft een chauffeur met een eigen kleur geen paletnummer', () => {
    // `driverColorIndex` blijft de hash geven: een eigen kleur heeft geen nummer,
    // en wie de kleur nodig heeft, vraagt `driverColorVar`.
    const id = 'user_arthur';
    expect(driverColorIndex(id, { [id]: { hue: 20, chroma: 80, tone: 50 } })).toBe(driverColorIndex(id));
  });

  it('valt terug op de hash wanneer de eigen kleur onzin is', () => {
    const id = 'user_arthur';
    const bad = { hue: 999, chroma: 0, tone: 0 };
    expect(driverColorVar(id, { [id]: bad })).toBe(driverColorVar(id));
  });

  it('rekent de helderheid uit de tokens en niet uit de kleur zelf', () => {
    // Daarom verandert een eigen kleur mee wanneer de modus wisselt, zonder dat
    // er iets opnieuw opgeslagen wordt.
    const css = customColorCss({ hue: 250, chroma: 50, tone: 100 });
    expect(css).toContain('var(--driver-l0)');
    expect(css).toContain('var(--driver-l1)');
    expect(css).toContain('var(--driver-c-max)');
    expect(css).toContain(' 250)');
  });
});

/**
 * Het hart van waarom dit geen vrij kleurenwiel is: bij elke stand van de drie
 * schuiven moet de tekst in het blok nog 4.5:1 halen, ook met de strengste
 * arcering van een voertuig eroverheen. Dit leest de tokens uit `theme.css` zelf,
 * zodat wie daar een grens opschuift, hier ziet wat dat kost.
 */
describe('de leesbaarheid van een eigen kleur', () => {
  const css = readFileSync(path.resolve(__dirname, '../app/design/theme.css'), 'utf8');

  function block(start: string): string {
    const from = css.indexOf(start);
    if (from < 0) throw new Error(`Blok niet gevonden in theme.css: ${start}`);
    return css.slice(from, css.indexOf('\n}', from));
  }

  function token(source: string, name: string): string {
    const match = source.match(new RegExp(`--${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`Token --${name} ontbreekt in theme.css`);
    return match[1].trim();
  }

  function rgb(value: string): [number, number, number] {
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) return [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16)) as [number, number, number];
    const rgba = value.match(/^rgba?\(([^)]+)\)/);
    if (!rgba) throw new Error(`Geen kleur: ${value}`);
    return rgba[1].split(',').slice(0, 3).map((part) => Number(part)) as [number, number, number];
  }

  function alpha(value: string): number {
    return Number(value.match(/^rgba\(([^)]+)\)/)![1].split(',')[3]);
  }

  /** oklch naar sRGB (0 tot 255), afgeknipt aan de rand van het gamut. */
  function oklchToRgb(lightness: number, chroma: number, hue: number): [number, number, number] {
    const radians = (hue * Math.PI) / 180;
    const a = chroma * Math.cos(radians);
    const b = chroma * Math.sin(radians);
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    return linear.map((value) => {
      const clipped = Math.min(1, Math.max(0, value));
      return 255 * (clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055);
    }) as [number, number, number];
  }

  function luminance(color: [number, number, number]): number {
    const [r, g, b] = color.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a: [number, number, number], b: [number, number, number]): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  }

  for (const [mode, start] of [
    ['licht', ':root {'],
    ['donker', ":root[data-theme='dark'] {"],
  ] as const) {
    it(`houdt de tekst leesbaar in de ${mode}e modus, bij elke tint, levendigheid en kracht`, () => {
      const tokens = block(start);
      const l0 = Number(token(tokens, 'driver-l0'));
      const l1 = Number(token(tokens, 'driver-l1'));
      const cMax = Number(token(tokens, 'driver-c-max'));
      const ink = rgb(token(tokens, 'driver-ink'));
      // De strengste arcering is het vlak dat het meest van de vulling afhaalt.
      const overlayValue = token(tokens, 'driver-pattern-strong');
      const overlay = rgb(overlayValue);
      const overlayAlpha = alpha(overlayValue);

      let worst = Infinity;
      for (let hue = 0; hue < 360; hue += 3) {
        for (const chroma of [0, 25, 50, 75, 100]) {
          for (const tone of [0, 50, 100]) {
            const lightness = l0 + (l1 - l0) * (tone / 100);
            const fill = oklchToRgb(lightness, cMax * (chroma / 100), hue);
            const shown = fill.map((channel, index) => channel * (1 - overlayAlpha) + overlay[index] * overlayAlpha) as [number, number, number];
            worst = Math.min(worst, contrast(shown, ink));
          }
        }
      }
      expect(worst).toBeGreaterThanOrEqual(4.5);
    });
  }
});
