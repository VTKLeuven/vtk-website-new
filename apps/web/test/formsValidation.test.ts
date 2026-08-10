import { describe, expect, it } from 'vitest';
import { claimedOptionCodes, validateSubmission, type ValidationField } from '@/lib/forms/validation';

function field(overrides: Partial<ValidationField> & { id: string }): ValidationField {
  return {
    code: overrides.id,
    type: 'SHORT_TEXT',
    required: false,
    config: {},
    options: [],
    ...overrides,
  };
}

describe('verplichte velden', () => {
  it('weigert een leeg verplicht veld', () => {
    const result = validateSubmission({
      fields: [field({ id: 'naam', required: true })],
      conditions: [],
      answers: { naam: { text: '   ' } },
    });
    expect(result.errors).toEqual({ naam: 'REQUIRED' });
  });

  it('maakt een verborgen veld nooit verplicht', () => {
    // Dit is het geval waar zulke systemen op vastlopen: het veld staat op
    // verplicht, de bezoeker heeft het nooit gezien, en indienen lukt niet.
    const result = validateSubmission({
      fields: [
        field({ id: 'komt', type: 'SINGLE_CHOICE', options: [{ code: 'ja' }, { code: 'nee' }] }),
        field({ id: 'partner', required: true }),
      ],
      conditions: [
        { fieldId: 'partner', sourceFieldId: 'komt', operator: 'EQUALS', value: 'ja' },
      ],
      answers: { komt: { options: ['nee'] } },
    });
    expect(result.errors).toEqual({});
    expect(result.visible.has('partner')).toBe(false);
  });

  it('bewaart geen antwoord op een verborgen veld', () => {
    // De client verbergt het veld al, maar wie het antwoord toch opstuurt, mag
    // het niet in de database krijgen.
    const result = validateSubmission({
      fields: [
        field({ id: 'komt', type: 'SINGLE_CHOICE', options: [{ code: 'ja' }, { code: 'nee' }] }),
        field({ id: 'partner' }),
      ],
      conditions: [
        { fieldId: 'partner', sourceFieldId: 'komt', operator: 'EQUALS', value: 'ja' },
      ],
      answers: { komt: { options: ['nee'] }, partner: { text: 'Smokkelwaar' } },
    });
    expect(result.cleaned.partner).toBeUndefined();
    expect(result.cleaned.komt).toEqual({ options: ['nee'], text: null });
  });

  it('vraagt een verplicht toestemmingsvinkje met een eigen foutcode', () => {
    const result = validateSubmission({
      fields: [field({ id: 'akkoord', type: 'CONSENT', required: true })],
      conditions: [],
      answers: { akkoord: { checked: false } },
    });
    expect(result.errors).toEqual({ akkoord: 'CONSENT_REQUIRED' });
  });
});

describe('validatie per type', () => {
  it('controleert e-mail, URL, tijd en datum', () => {
    const fields = [
      field({ id: 'mail', type: 'EMAIL' }),
      field({ id: 'site', type: 'URL' }),
      field({ id: 'uur', type: 'TIME' }),
      field({ id: 'dag', type: 'DATE' }),
    ];
    const result = validateSubmission({
      fields,
      conditions: [],
      answers: {
        mail: { text: 'geen adres' },
        site: { text: 'javascript:alert(1)' },
        uur: { text: '25:00' },
        dag: { text: '01-03-2027' },
      },
    });
    expect(result.errors).toEqual({
      mail: 'EMAIL',
      site: 'URL',
      uur: 'TIME',
      dag: 'DATE',
    });
  });

  it('houdt een getal binnen zijn bereik', () => {
    const fields = [field({ id: 'aantal', type: 'NUMBER', config: { min: 1, max: 4, integerOnly: true } })];
    expect(
      validateSubmission({ fields, conditions: [], answers: { aantal: { number: 9 } } }).errors
    ).toEqual({ aantal: 'NUMBER_TOO_LARGE' });
    expect(
      validateSubmission({ fields, conditions: [], answers: { aantal: { number: 2.5 } } }).errors
    ).toEqual({ aantal: 'NUMBER_INTEGER' });
    expect(
      validateSubmission({ fields, conditions: [], answers: { aantal: { number: 3 } } }).errors
    ).toEqual({});
  });

  it('dwingt een patroon af met een r-nummer als voorbeeld', () => {
    const fields = [
      field({ id: 'rnummer', type: 'PROFILE', config: { profileField: 'RNUMBER' } }),
    ];
    expect(
      validateSubmission({ fields, conditions: [], answers: { rnummer: { text: '1234567' } } })
        .errors
    ).toEqual({ rnummer: 'RNUMBER' });
    expect(
      validateSubmission({ fields, conditions: [], answers: { rnummer: { text: 'r0123456' } } })
        .errors
    ).toEqual({});
  });

  it('weigert een optie die niet bestaat of gearchiveerd is', () => {
    const fields = [
      field({
        id: 'shift',
        type: 'SINGLE_CHOICE',
        options: [{ code: 'vroeg' }, { code: 'laat', archivedAt: new Date() }],
      }),
    ];
    expect(
      validateSubmission({ fields, conditions: [], answers: { shift: { options: ['nacht'] } } })
        .errors
    ).toEqual({ shift: 'UNKNOWN_OPTION' });
    expect(
      validateSubmission({ fields, conditions: [], answers: { shift: { options: ['laat'] } } })
        .errors
    ).toEqual({ shift: 'UNKNOWN_OPTION' });
  });

  it('bewaakt het aantal aangeduide checkboxes', () => {
    const fields = [
      field({
        id: 'dagen',
        type: 'MULTIPLE_CHOICE',
        config: { minChecked: 2, maxChecked: 3 },
        options: [{ code: 'ma' }, { code: 'di' }, { code: 'wo' }, { code: 'do' }],
      }),
    ];
    expect(
      validateSubmission({ fields, conditions: [], answers: { dagen: { options: ['ma'] } } }).errors
    ).toEqual({ dagen: 'TOO_FEW_CHOICES' });
    expect(
      validateSubmission({
        fields,
        conditions: [],
        answers: { dagen: { options: ['ma', 'di', 'wo', 'do'] } },
      }).errors
    ).toEqual({ dagen: 'TOO_MANY_CHOICES' });
    expect(
      validateSubmission({ fields, conditions: [], answers: { dagen: { options: ['ma', 'di'] } } })
        .errors
    ).toEqual({});
  });

  it('laat één keuze niet stiekem meerdere opties opsturen', () => {
    const fields = [
      field({ id: 'keuze', type: 'SINGLE_CHOICE', options: [{ code: 'a' }, { code: 'b' }] }),
    ];
    expect(
      validateSubmission({ fields, conditions: [], answers: { keuze: { options: ['a', 'b'] } } })
        .errors
    ).toEqual({ keuze: 'TOO_MANY_CHOICES' });
  });

  it('weigert een vrije tekst wanneer "Andere" niet aanstaat', () => {
    const fields = [
      field({ id: 'keuze', type: 'SINGLE_CHOICE', options: [{ code: 'a' }] }),
    ];
    expect(
      validateSubmission({
        fields,
        conditions: [],
        answers: { keuze: { options: ['a'], text: 'iets anders' } },
      }).errors
    ).toEqual({ keuze: 'OTHER_NOT_ALLOWED' });
  });

  it('controleert aantal en type van geüploade bestanden', () => {
    const fields = [
      field({ id: 'cv', type: 'FILE', config: { maxFiles: 2, allowedExtensions: ['pdf'] } }),
    ];
    expect(
      validateSubmission({
        fields,
        conditions: [],
        answers: {},
        fileCounts: { cv: { count: 3, extensions: ['pdf', 'pdf', 'pdf'] } },
      }).errors
    ).toEqual({ cv: 'TOO_MANY_FILES' });
    expect(
      validateSubmission({
        fields,
        conditions: [],
        answers: {},
        fileCounts: { cv: { count: 1, extensions: ['exe'] } },
      }).errors
    ).toEqual({ cv: 'FILE_TYPE' });
  });

  it('telt een bestand als antwoord op een verplicht uploadveld', () => {
    const fields = [field({ id: 'cv', type: 'FILE', required: true })];
    expect(
      validateSubmission({ fields, conditions: [], answers: {} }).errors
    ).toEqual({ cv: 'REQUIRED' });
    expect(
      validateSubmission({
        fields,
        conditions: [],
        answers: {},
        fileCounts: { cv: { count: 1, extensions: ['pdf'] } },
      }).errors
    ).toEqual({});
  });
});

describe('opschonen', () => {
  it('bewaart per type enkel de kolom die erbij hoort', () => {
    const result = validateSubmission({
      fields: [
        field({ id: 'tekst' }),
        field({ id: 'getal', type: 'NUMBER' }),
        field({ id: 'ja', type: 'BOOLEAN' }),
      ],
      conditions: [],
      answers: {
        // Restwaarden van een vorig veldtype mogen niet meeliften.
        tekst: { text: ' hallo ', number: 5, checked: true },
        getal: { number: 3, text: 'drie' },
        ja: { checked: true, text: 'ja' },
      },
    });
    expect(result.cleaned.tekst).toEqual({ text: 'hallo' });
    expect(result.cleaned.getal).toEqual({ number: 3 });
    expect(result.cleaned.ja).toEqual({ checked: true });
  });

  it('somt op welke opties met een quotum geclaimd worden', () => {
    const fields = [
      field({ id: 'shift', type: 'MULTIPLE_CHOICE', options: [{ code: 'vroeg' }, { code: 'laat' }] }),
      field({ id: 'naam' }),
    ];
    const cleaned = { shift: { options: ['vroeg', 'laat'] }, naam: { text: 'Jan' } };
    expect(claimedOptionCodes(fields, cleaned)).toEqual(['vroeg', 'laat']);
  });
});

describe('overgeslagen secties', () => {
  it('maakt een verplicht veld in een overgeslagen sectie niet verplicht', () => {
    // Precies hetzelfde principe als bij een verborgen veld: wie die tak nooit
    // zag, kan er niets aan doen en mag er niet op vastlopen.
    const result = validateSubmission({
      fields: [
        {
          ...field({ id: 'soort', type: 'SINGLE_CHOICE', options: [{ code: 'lid' }, { code: 'gast' }] }),
          sectionId: 'intro',
        },
        { ...field({ id: 'lidnummer', required: true }), sectionId: 'leden' },
        { ...field({ id: 'gastnaam', required: true }), sectionId: 'gasten' },
      ],
      conditions: [],
      answers: { soort: { options: ['gast'] }, gastnaam: { text: 'Marie' } },
      sections: [
        { id: 'intro', sortOrder: 0, nextSectionId: null, endsForm: false },
        { id: 'leden', sortOrder: 1, nextSectionId: null, endsForm: false },
        { id: 'gasten', sortOrder: 2, nextSectionId: null, endsForm: false },
      ],
      branchOptions: [
        { fieldId: 'soort', code: 'gast', nextSectionId: 'gasten', endsForm: false },
        { fieldId: 'soort', code: 'lid', nextSectionId: 'leden', endsForm: false },
      ],
    });

    expect(result.errors).toEqual({});
    expect(result.cleaned.gastnaam).toEqual({ text: 'Marie' });
  });

  it('bewaart geen antwoord uit een sectie die niet bezocht werd', () => {
    const result = validateSubmission({
      fields: [
        {
          ...field({ id: 'soort', type: 'SINGLE_CHOICE', options: [{ code: 'lid' }, { code: 'gast' }] }),
          sectionId: 'intro',
        },
        { ...field({ id: 'lidnummer' }), sectionId: 'leden' },
      ],
      conditions: [],
      answers: { soort: { options: ['gast'] }, lidnummer: { text: 'r0123456' } },
      sections: [
        { id: 'intro', sortOrder: 0, nextSectionId: null, endsForm: false },
        { id: 'leden', sortOrder: 1, nextSectionId: null, endsForm: false },
        { id: 'gasten', sortOrder: 2, nextSectionId: null, endsForm: false },
      ],
      branchOptions: [{ fieldId: 'soort', code: 'gast', nextSectionId: 'gasten', endsForm: false }],
    });

    expect(result.cleaned.lidnummer).toBeUndefined();
  });

  it('negeert alles na een optie die het formulier beëindigt', () => {
    const result = validateSubmission({
      fields: [
        {
          ...field({ id: 'komt', type: 'SINGLE_CHOICE', options: [{ code: 'ja' }, { code: 'nee' }] }),
          sectionId: 'intro',
        },
        { ...field({ id: 'menu', required: true }), sectionId: 'details' },
      ],
      conditions: [],
      answers: { komt: { options: ['nee'] } },
      sections: [
        { id: 'intro', sortOrder: 0, nextSectionId: null, endsForm: false },
        { id: 'details', sortOrder: 1, nextSectionId: null, endsForm: false },
      ],
      branchOptions: [{ fieldId: 'komt', code: 'nee', nextSectionId: null, endsForm: true }],
    });

    expect(result.errors).toEqual({});
  });
});
