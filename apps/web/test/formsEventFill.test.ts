import { describe, expect, it } from 'vitest';
import { applyEventFill, type EventChoice, type FillField } from '@/lib/forms/eventFill';

function choice(id: string, overrides: Partial<EventChoice['fill']> = {}): EventChoice {
  return {
    id,
    label: id,
    own: true,
    draft: false,
    fill: {
      title: `Titel ${id}`,
      date: '2026-10-21',
      startTime: '20:00',
      endTime: '23:30',
      location: 'Doc\'s Bar',
      groupSlug: 'activiteiten',
      groupName: 'Activiteiten',
      ...overrides,
    },
  };
}

const evenement: FillField = {
  id: 'f-evenement',
  code: 'evenement',
  type: 'CALENDAR_EVENT',
  config: {
    fills: {
      TITLE: 'naam',
      DATE: 'datum',
      START_TIME: 'beginuur',
      END_TIME: 'einduur',
      LOCATION: 'locatie',
      POST: 'post',
    },
  },
  options: [],
};

const fields: FillField[] = [
  evenement,
  { id: 'f-naam', code: 'naam', type: 'SHORT_TEXT', config: {}, options: [] },
  { id: 'f-datum', code: 'datum', type: 'DATE', config: {}, options: [] },
  { id: 'f-beginuur', code: 'beginuur', type: 'TIME', config: {}, options: [] },
  { id: 'f-einduur', code: 'einduur', type: 'TIME', config: {}, options: [] },
  { id: 'f-locatie', code: 'locatie', type: 'SHORT_TEXT', config: {}, options: [] },
  {
    id: 'f-post',
    code: 'post',
    type: 'SINGLE_CHOICE',
    config: { allowOther: true },
    options: [{ code: 'activiteiten' }, { code: 'onthaal' }, { code: 'internationaal' }],
  },
];

describe('een evenement kiezen', () => {
  it('vult de aangeduide velden in', () => {
    const result = applyEventFill({}, fields, evenement, choice('a'), null);
    expect(result).toEqual({
      'f-evenement': { text: 'a' },
      'f-naam': { text: 'Titel a' },
      'f-datum': { text: '2026-10-21' },
      'f-beginuur': { text: '20:00' },
      'f-einduur': { text: '23:30' },
      'f-locatie': { text: "Doc's Bar" },
      'f-post': { options: ['activiteiten'], text: null },
    });
  });

  it('laat met de hand aangepaste velden staan bij een ander evenement', () => {
    const first = applyEventFill({}, fields, evenement, choice('a'), null);
    const edited = { ...first, 'f-locatie': { text: 'Agora' } };
    const result = applyEventFill(edited, fields, evenement, choice('b'), choice('a'));
    expect(result['f-naam']).toEqual({ text: 'Titel b' });
    expect(result['f-locatie']).toEqual({ text: 'Agora' });
  });

  it('overschrijft geen veld dat al ingevuld was voor er een evenement gekozen werd', () => {
    const result = applyEventFill({ 'f-naam': { text: 'Eigen naam' } }, fields, evenement, choice('a'), null);
    expect(result['f-naam']).toEqual({ text: 'Eigen naam' });
  });

  it('maakt enkel de meegevulde waarden leeg wanneer het evenement leeg wordt', () => {
    const first = applyEventFill({}, fields, evenement, choice('a'), null);
    const edited = { ...first, 'f-locatie': { text: 'Agora' } };
    const result = applyEventFill(edited, fields, evenement, null, choice('a'));
    expect(result['f-evenement']).toEqual({});
    expect(result['f-naam']).toEqual({});
    expect(result['f-locatie']).toEqual({ text: 'Agora' });
  });

  it('zet een post zonder eigen optie in "Andere"', () => {
    const result = applyEventFill(
      {},
      fields,
      evenement,
      choice('a', { groupSlug: 'sport', groupName: 'Sport' }),
      null
    );
    expect(result['f-post']).toEqual({ options: [], text: 'Sport' });
  });

  it('laat de uren leeg bij een evenement van de hele dag', () => {
    const result = applyEventFill(
      {},
      fields,
      evenement,
      choice('a', { startTime: null, endTime: null }),
      null
    );
    expect(result['f-beginuur']).toEqual({});
    expect(result['f-einduur']).toEqual({});
  });

  it('negeert een doelveld van het verkeerde type', () => {
    const wrong: FillField = { ...evenement, config: { fills: { DATE: 'naam' } } };
    const result = applyEventFill({}, fields, wrong, choice('a'), null);
    expect(result['f-naam']).toBeUndefined();
  });
});
