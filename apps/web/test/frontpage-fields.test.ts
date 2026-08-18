import { describe, expect, it } from 'vitest';
import { FRONTPAGE_MODULES, getFrontpageModule } from '@/lib/frontpage/registry';
import { pickField, readFieldValues } from '@/lib/frontpage/fields';

/**
 * The admin form posts a front page's own fields under `field.<name>`, next to
 * its own controls (`layout`, `startsAt`, `endsAt`, `active`).
 *
 * That prefix is not decoration. The 24-urenloop declares fields called
 * `startsAt` and `endsAt` for the start gun and the finish, which are a
 * different thing from the window in which the front page is shown. Without the
 * prefix both pairs land in one form under one name, `formData.get("startsAt")`
 * returns whichever comes first, and the schedule silently swallows the event's
 * own start time. Saving a date then appears to do nothing.
 */
const FIELD_PREFIX = 'field.';
const FORM_CONTROLS = ['layout', 'startsAt', 'endsAt', 'active'];

describe('frontpage field names', () => {
  it('houdt de velden van een frontpage los van de formulierknoppen', () => {
    // Precies het geval dat ooit misging: de urenloop heeft een eigen startsAt.
    const urenloop = getFrontpageModule('urenloop');
    expect(urenloop).not.toBeNull();
    expect(Object.keys(urenloop!.fields)).toContain('startsAt');

    const form = new FormData();
    form.set('startsAt', '2026-11-01T09:00'); // het venster van de frontpage
    form.set(`${FIELD_PREFIX}startsAt`, '2026-10-21T20:00'); // het startschot

    expect(form.get('startsAt')).toBe('2026-11-01T09:00');
    expect(form.get(`${FIELD_PREFIX}startsAt`)).toBe('2026-10-21T20:00');
  });

  it('laat geen enkel veld op een formulierknop botsen', () => {
    for (const layoutModule of FRONTPAGE_MODULES) {
      for (const name of Object.keys(layoutModule.fields)) {
        expect(`${FIELD_PREFIX}${name}`).not.toBe(
          FORM_CONTROLS.find((control) => control === `${FIELD_PREFIX}${name}`),
        );
        expect(FORM_CONTROLS).not.toContain(`${FIELD_PREFIX}${name}`);
      }
    }
  });

  it('geeft elke frontpage een eigen id', () => {
    const ids = FRONTPAGE_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('readFieldValues', () => {
  const schema = getFrontpageModule('urenloop')!.fields;

  it('houdt enkel gevulde velden over die de layout kent', () => {
    const values = readFieldValues(
      { titleNl: 'Test', leegVeld: '   ', onbekend: 'x', stat1Value: '530 m' },
      schema,
    );
    expect(values.titleNl).toBe('Test');
    expect(values.stat1Value).toBe('530 m');
    // Niet gedeclareerd door deze layout, dus genegeerd.
    expect(values.onbekend).toBeUndefined();
  });

  it('overleeft een kapotte of lege JSON-kolom', () => {
    expect(readFieldValues(null, schema)).toEqual({});
    expect(readFieldValues('kapot', schema)).toEqual({});
    expect(readFieldValues([1, 2], schema)).toEqual({});
  });
});

describe('pickField', () => {
  it('kiest de taal van de bezoeker', () => {
    const values = { titleNl: 'Loop mee', titleEn: 'Run with us' };
    expect(pickField(values, 'title', 'nl')).toBe('Loop mee');
    expect(pickField(values, 'title', 'en')).toBe('Run with us');
  });

  it('valt terug op de ingevulde taal als de andere leeg is', () => {
    expect(pickField({ titleNl: 'Enkel NL' }, 'title', 'en')).toBe('Enkel NL');
    expect(pickField({ titleEn: 'Only EN' }, 'title', 'nl')).toBe('Only EN');
  });

  it('geeft niets terug wanneer beide talen leeg zijn', () => {
    expect(pickField({}, 'title', 'nl')).toBeUndefined();
  });
});
