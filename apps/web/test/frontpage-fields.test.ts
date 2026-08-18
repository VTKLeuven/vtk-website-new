import { describe, expect, it } from 'vitest';
import { FRONTPAGE_MODULES, getFrontpageModule } from '@/lib/frontpage/registry';
import { pickField, readFieldValues } from '@/lib/frontpage/fields';
import { pickActiveTakeover } from '@/lib/frontpage/resolve';

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

/**
 * De keuze welke frontpage live staat, wordt op één plek gemaakt
 * (`pickActiveTakeover`). Dat was ooit twee keer geïmplementeerd: de homepage
 * sorteerde in de database, waar Postgres bij `ORDER BY ... DESC` NULL vóóraan
 * zet, en het beheerscherm mapte diezelfde NULL op 0 en zette hem achteraan. Een
 * handmatig aangezette frontpage zonder venster won dan op de site, terwijl het
 * beheer bij de geplande zei dat die live stond.
 */
describe('pickActiveTakeover', () => {
  const row = (over: Partial<Parameters<typeof pickActiveTakeover>[0][number]>) => ({
    layout: 'urenloop',
    startsAt: null as Date | null,
    endsAt: null as Date | null,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  });
  const now = new Date('2026-10-21T21:00:00Z');

  it('laat een geplande frontpage winnen van een handmatig aangezette zonder venster', () => {
    const scheduled = row({ layout: 'jobfair', startsAt: new Date('2026-10-21T20:00:00Z') });
    const manual = row({ layout: 'urenloop', startsAt: null });
    // Beide volgordes moeten hetzelfde resultaat geven; anders bepaalt de
    // databasevolgorde de uitkomst, en dat was precies de fout.
    expect(pickActiveTakeover([manual, scheduled], now)?.layout).toBe('jobfair');
    expect(pickActiveTakeover([scheduled, manual], now)?.layout).toBe('jobfair');
  });

  it('kiest bij twee geplande de laatst gestarte', () => {
    const early = row({ layout: 'urenloop', startsAt: new Date('2026-10-01T00:00:00Z') });
    const late = row({ layout: 'jobfair', startsAt: new Date('2026-10-20T00:00:00Z') });
    expect(pickActiveTakeover([early, late], now)?.layout).toBe('jobfair');
  });

  it('negeert wat niet live is', () => {
    expect(pickActiveTakeover([row({ active: false })], now)).toBeNull();
    expect(pickActiveTakeover([row({ endsAt: new Date('2026-10-01T00:00:00Z') })], now)).toBeNull();
    expect(pickActiveTakeover([row({ startsAt: new Date('2026-12-01T00:00:00Z') })], now)).toBeNull();
  });

  it('negeert de standaard en een layout die niet meer bestaat', () => {
    expect(pickActiveTakeover([row({ layout: 'default' })], now)).toBeNull();
    expect(pickActiveTakeover([row({ layout: 'weggehaald' })], now)).toBeNull();
  });
});
