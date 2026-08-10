import { describe, expect, it } from 'vitest';
import {
  fieldsOnPath,
  sectionPath,
  steps,
  wouldLoop,
  type BranchField,
  type BranchOption,
  type BranchSection,
} from '@/lib/forms/branching';

function section(
  id: string,
  sortOrder: number,
  extra: Partial<BranchSection> = {}
): BranchSection {
  return { id, sortOrder, nextSectionId: null, endsForm: false, ...extra };
}

function field(id: string, sectionId: string | null, type = 'SHORT_TEXT'): BranchField {
  return { id, type, sectionId, sortOrder: 0 };
}

function option(
  fieldId: string,
  code: string,
  extra: Partial<BranchOption> = {}
): BranchOption {
  return { fieldId, code, nextSectionId: null, endsForm: false, ...extra };
}

const sections = [section('intro', 0), section('leden', 1), section('gasten', 2), section('slot', 3)];

describe('het pad door de secties', () => {
  it('loopt gewoon door wanneer er niets aangewezen is', () => {
    expect(sectionPath(sections, [], [], {})).toEqual(['intro', 'leden', 'gasten', 'slot']);
  });

  it('springt op basis van het gekozen antwoord', () => {
    const fields = [field('soort', 'intro', 'SINGLE_CHOICE')];
    const options = [
      option('soort', 'lid', { nextSectionId: 'leden' }),
      option('soort', 'gast', { nextSectionId: 'gasten' }),
    ];

    expect(sectionPath(sections, fields, options, { soort: { options: ['gast'] } })).toEqual([
      'intro',
      'gasten',
      'slot',
    ]);
    expect(sectionPath(sections, fields, options, { soort: { options: ['lid'] } })).toEqual([
      'intro',
      'leden',
      'gasten',
      'slot',
    ]);
  });

  it('beëindigt het formulier wanneer een optie dat zegt', () => {
    const fields = [field('komt', 'intro', 'SINGLE_CHOICE')];
    const options = [option('komt', 'nee', { endsForm: true })];
    expect(sectionPath(sections, fields, options, { komt: { options: ['nee'] } })).toEqual([
      'intro',
    ]);
  });

  it('volgt het standaardvervolg van een sectie', () => {
    const eigen = [
      section('intro', 0, { nextSectionId: 'slot' }),
      section('leden', 1),
      section('slot', 2),
    ];
    expect(sectionPath(eigen, [], [], {})).toEqual(['intro', 'slot']);
  });

  it('laat een antwoord het standaardvervolg overrulen', () => {
    const eigen = [
      section('intro', 0, { nextSectionId: 'slot' }),
      section('leden', 1),
      section('slot', 2),
    ];
    const fields = [field('soort', 'intro', 'SINGLE_CHOICE')];
    const options = [option('soort', 'lid', { nextSectionId: 'leden' })];
    expect(sectionPath(eigen, fields, options, { soort: { options: ['lid'] } })).toEqual([
      'intro',
      'leden',
      'slot',
    ]);
  });

  it('stopt bij een sectie die het einde aankondigt', () => {
    const eigen = [section('intro', 0, { endsForm: true }), section('slot', 1)];
    expect(sectionPath(eigen, [], [], {})).toEqual(['intro']);
  });

  it('bevriest niet op een kring maar stopt', () => {
    // Kan enkel via oudere data of een half verwijderde sectie; de editor
    // houdt zulke sprongen tegen.
    const kring = [
      section('a', 0, { nextSectionId: 'b' }),
      section('b', 1, { nextSectionId: 'a' }),
    ];
    expect(sectionPath(kring, [], [], {})).toEqual(['a', 'b']);
  });

  it('stopt wanneer de doelsectie niet meer bestaat', () => {
    const eigen = [section('intro', 0, { nextSectionId: 'verwijderd' })];
    expect(sectionPath(eigen, [], [], {})).toEqual(['intro']);
  });

  it('negeert een sprong uit een verborgen veld', () => {
    // Het veld staat er niet, dus zijn antwoord mag de route niet bepalen.
    const fields = [field('soort', 'intro', 'SINGLE_CHOICE')];
    const options = [option('soort', 'gast', { nextSectionId: 'gasten' })];
    const zichtbaar = new Set<string>();
    expect(
      sectionPath(sections, fields, options, { soort: { options: ['gast'] } }, zichtbaar)
    ).toEqual(['intro', 'leden', 'gasten', 'slot']);
  });
});

describe('velden op het pad', () => {
  it('houdt velden zonder sectie altijd bij', () => {
    const fields = [field('naam', null), field('lidnr', 'leden'), field('gastnaam', 'gasten')];
    const onPath = fieldsOnPath(fields, ['intro', 'gasten']);
    expect(onPath.has('naam')).toBe(true);
    expect(onPath.has('gastnaam')).toBe(true);
    expect(onPath.has('lidnr')).toBe(false);
  });
});

describe('stappen', () => {
  it('zet de losse velden als eerste stap voor de secties', () => {
    const fields = [field('naam', null), field('lidnr', 'leden')];
    expect(steps(sections, fields, [], {})).toEqual([
      { sectionId: null },
      { sectionId: 'intro' },
      { sectionId: 'leden' },
      { sectionId: 'gasten' },
      { sectionId: 'slot' },
    ]);
  });

  it('laat de eerste stap weg wanneer er geen losse velden zijn', () => {
    const fields = [field('lidnr', 'leden')];
    expect(steps(sections, fields, [], {})[0]).toEqual({ sectionId: 'intro' });
  });

  it('houdt één stap over wanneer er helemaal geen secties zijn', () => {
    expect(steps([], [field('naam', null)], [], {})).toEqual([{ sectionId: null }]);
  });
});

describe('kringen in de editor', () => {
  it('weigert een sectie die naar zichzelf springt', () => {
    expect(wouldLoop(sections, { fromSectionId: 'a', toSectionId: 'a' })).toBe(true);
  });

  it('weigert een sprong die terugkomt via de standaardvervolgen', () => {
    const keten = [
      section('a', 0),
      section('b', 1, { nextSectionId: 'a' }),
    ];
    expect(wouldLoop(keten, { fromSectionId: 'a', toSectionId: 'b' })).toBe(true);
  });

  it('laat een sprong vooruit toe', () => {
    expect(wouldLoop(sections, { fromSectionId: 'intro', toSectionId: 'slot' })).toBe(false);
  });
});

describe('sturen vanuit de eerste stap', () => {
  // Dit ging mis in de browser: de vraag stond bovenaan buiten elke sectie, en
  // haar sprong werd genegeerd omdat het pad gewoon bij de eerste sectie begon.
  const fields = [field('soort', null, 'SINGLE_CHOICE')];
  const options = [
    option('soort', 'lid', { nextSectionId: 'leden' }),
    option('soort', 'gast', { nextSectionId: 'gasten' }),
  ];
  const twee = [section('leden', 1), section('gasten', 2)];

  it('volgt de sprong van een vraag zonder sectie', () => {
    expect(sectionPath(twee, fields, options, { soort: { options: ['gast'] } })).toEqual([
      'gasten',
    ]);
    expect(sectionPath(twee, fields, options, { soort: { options: ['lid'] } })).toEqual([
      'leden',
      'gasten',
    ]);
  });

  it('begint gewoon bij de eerste sectie zolang er niets gekozen is', () => {
    expect(sectionPath(twee, fields, options, {})).toEqual(['leden', 'gasten']);
  });

  it('eindigt het formulier meteen wanneer de eerste stap dat zegt', () => {
    const stop = [option('soort', 'nee', { endsForm: true })];
    expect(sectionPath(twee, fields, stop, { soort: { options: ['nee'] } })).toEqual([]);
    expect(steps(twee, fields, stop, { soort: { options: ['nee'] } })).toEqual([
      { sectionId: null },
    ]);
  });
});
