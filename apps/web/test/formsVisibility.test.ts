import { describe, expect, it } from 'vitest';
import {
  visibleFieldIds,
  wouldCreateCycle,
  type VisibilityCondition,
} from '@/lib/forms/visibility';

const fields = [
  { id: 'komt', type: 'SINGLE_CHOICE' },
  { id: 'aantal', type: 'NUMBER' },
  { id: 'dieet', type: 'SHORT_TEXT' },
  { id: 'allergie', type: 'MULTIPLE_CHOICE' },
];

function condition(
  fieldId: string,
  sourceFieldId: string,
  operator: VisibilityCondition['operator'],
  value: string | null = null
): VisibilityCondition {
  return { fieldId, sourceFieldId, operator, value };
}

describe('conditionele zichtbaarheid', () => {
  it('toont een veld zonder condities altijd', () => {
    expect(visibleFieldIds(fields, [], {})).toEqual(
      new Set(['komt', 'aantal', 'dieet', 'allergie'])
    );
  });

  it('toont een afhankelijk veld enkel bij het juiste antwoord', () => {
    const conditions = [condition('aantal', 'komt', 'EQUALS', 'ja')];

    expect(visibleFieldIds(fields, conditions, {}).has('aantal')).toBe(false);
    expect(
      visibleFieldIds(fields, conditions, { komt: { options: ['nee'] } }).has('aantal')
    ).toBe(false);
    expect(
      visibleFieldIds(fields, conditions, { komt: { options: ['ja'] } }).has('aantal')
    ).toBe(true);
  });

  it('telt meerdere condities op hetzelfde veld samen als EN', () => {
    const conditions = [
      condition('dieet', 'komt', 'EQUALS', 'ja'),
      condition('dieet', 'allergie', 'INCLUDES', 'noten'),
    ];

    expect(
      visibleFieldIds(fields, conditions, { komt: { options: ['ja'] } }).has('dieet')
    ).toBe(false);
    expect(
      visibleFieldIds(fields, conditions, {
        komt: { options: ['ja'] },
        allergie: { options: ['noten', 'lactose'] },
      }).has('dieet')
    ).toBe(true);
  });

  it('houdt NOT_EQUALS dicht zolang de bronvraag onbeantwoord is', () => {
    // Anders staat het afhankelijke veld al open voor er iets ingevuld is, en
    // dat is nooit de bedoeling van "toon dit wanneer het antwoord niet X is".
    const conditions = [condition('dieet', 'komt', 'NOT_EQUALS', 'nee')];

    expect(visibleFieldIds(fields, conditions, {}).has('dieet')).toBe(false);
    expect(
      visibleFieldIds(fields, conditions, { komt: { options: ['nee'] } }).has('dieet')
    ).toBe(false);
    expect(
      visibleFieldIds(fields, conditions, { komt: { options: ['ja'] } }).has('dieet')
    ).toBe(true);
  });

  it('verbergt een veld waarvan de bron zelf verborgen is', () => {
    // Anders duikt een vraag op door een antwoord dat de bezoeker niet meer
    // ziet staan, bijvoorbeeld nadat hij zijn keuze wijzigde.
    const conditions = [
      condition('aantal', 'komt', 'EQUALS', 'ja'),
      condition('dieet', 'aantal', 'IS_ANSWERED'),
    ];

    const answers = { komt: { options: ['nee'] }, aantal: { number: 3 } };
    const visible = visibleFieldIds(fields, conditions, answers);
    expect(visible.has('aantal')).toBe(false);
    expect(visible.has('dieet')).toBe(false);
  });

  it('verbergt een veld waarvan de bronvraag niet meer bestaat', () => {
    const conditions = [condition('dieet', 'verwijderd', 'IS_ANSWERED')];
    expect(visibleFieldIds(fields, conditions, {}).has('dieet')).toBe(false);
  });

  it('herkent IS_ANSWERED voor lege en gevulde antwoorden', () => {
    const conditions = [condition('dieet', 'aantal', 'IS_ANSWERED')];

    expect(visibleFieldIds(fields, conditions, { aantal: {} }).has('dieet')).toBe(false);
    expect(
      visibleFieldIds(fields, conditions, { aantal: { text: '   ' } }).has('dieet')
    ).toBe(false);
    // Nul is een antwoord, ook al is het falsy.
    expect(visibleFieldIds(fields, conditions, { aantal: { number: 0 } }).has('dieet')).toBe(
      true
    );
  });
});

describe('kringverwijzingen', () => {
  it('weigert een veld dat van zichzelf afhangt', () => {
    expect(wouldCreateCycle([], { fieldId: 'a', sourceFieldId: 'a' })).toBe(true);
  });

  it('weigert een kring over meerdere velden', () => {
    const existing = [condition('b', 'a', 'IS_ANSWERED'), condition('c', 'b', 'IS_ANSWERED')];
    expect(wouldCreateCycle(existing, { fieldId: 'a', sourceFieldId: 'c' })).toBe(true);
  });

  it('laat een gewone keten toe', () => {
    const existing = [condition('b', 'a', 'IS_ANSWERED')];
    expect(wouldCreateCycle(existing, { fieldId: 'c', sourceFieldId: 'b' })).toBe(false);
  });

  it('laat twee velden toe die van dezelfde bron afhangen', () => {
    const existing = [condition('b', 'a', 'IS_ANSWERED')];
    expect(wouldCreateCycle(existing, { fieldId: 'c', sourceFieldId: 'a' })).toBe(false);
  });
});
