import { describe, expect, it } from 'vitest';
import { matchContacts, normaliseBelgianPhone, parseVcards } from '@/lib/vcard';

/**
 * De gsm-lijst inlezen (F4.3).
 *
 * De gevallen hieronder komen uit de echte export van september 2026, want dat
 * is waar de import op losgelaten wordt. Het nummer met de dubbele nul zat er
 * echt in; zie de comment bij `normaliseBelgianPhone`.
 */

const card = (name: string, tel: string) =>
  ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, `TEL;type=OTHER;type=VOICE;type=pref:${tel}`, 'END:VCARD'].join('\r\n');

describe('parseVcards', () => {
  it('leest naam en nummer uit een export van macOS', () => {
    const text = [card('Kyrill Adriaenssens', '0032470123456'), card('Wout Jansen', '0032471234567')].join('\r\n');
    expect(parseVcards(text)).toEqual([
      { name: 'Kyrill Adriaenssens', phone: '0032470123456' },
      { name: 'Wout Jansen', phone: '0032471234567' },
    ]);
  });

  it('bouwt de naam uit N wanneer FN ontbreekt', () => {
    const text = ['BEGIN:VCARD', 'N:Adriaenssens;Kyrill;;;', 'TEL:0032470123456', 'END:VCARD'].join('\r\n');
    expect(parseVcards(text)[0].name).toBe('Kyrill Adriaenssens');
  });

  /**
   * RFC 6350 vouwt midden in de tekst en zet er een spatie voor die bij het
   * uitvouwen weer weg moet. Een vouw die toevallig op een woordgrens valt,
   * levert dus geen extra spatie op; daar staat de spatie vóór de knip.
   */
  it('plakt een gevouwen regel weer aan elkaar', () => {
    const text = ['BEGIN:VCARD', 'FN:Kyrill Adri', ' aenssens', 'TEL:0032470123456', 'END:VCARD'].join('\r\n');
    expect(parseVcards(text)[0].name).toBe('Kyrill Adriaenssens');
  });

  it('neemt het eerste nummer wanneer er meerdere staan', () => {
    const text = ['BEGIN:VCARD', 'FN:Wout', 'TEL;type=CELL:0032470123456', 'TEL;type=HOME:0032471234567', 'END:VCARD'].join('\r\n');
    expect(parseVcards(text)[0].phone).toBe('0032470123456');
  });

  it('laat een contact zonder nummer vallen', () => {
    const text = ['BEGIN:VCARD', 'FN:Wout', 'END:VCARD'].join('\r\n');
    expect(parseVcards(text)).toEqual([]);
  });
});

describe('normaliseBelgianPhone', () => {
  it('maakt van 0032 de nationale vorm met spaties', () => {
    expect(normaliseBelgianPhone('0032470123456')).toEqual({ ok: true, phone: '0470 12 34 56' });
  });

  it('aanvaardt +32 en losse spaties', () => {
    expect(normaliseBelgianPhone('+32 470 12 34 56')).toEqual({ ok: true, phone: '0470 12 34 56' });
  });

  it('laat een nummer dat al nationaal staat met rust', () => {
    expect(normaliseBelgianPhone('0470/12.34.56')).toEqual({ ok: true, phone: '0470 12 34 56' });
  });

  /**
   * Het geval uit de echte lijst: iemand plakte 0032 voor een nummer dat zelf al
   * met een nul begon. `+3257...` en `057...` zijn twee verschillende nummers, en
   * raden welk van de twee bedoeld is, is precies wat een import niet mag doen.
   */
  it('weigert 0032 met de nationale nul erachter', () => {
    expect(normaliseBelgianPhone('0032057123456')).toEqual({ ok: false, reason: 'dubbele-nul' });
  });

  it('houdt een vaste lijn heel, zonder te groeperen', () => {
    expect(normaliseBelgianPhone('003216123456')).toEqual({ ok: true, phone: '016123456' });
  });

  /**
   * Ook uit de echte lijst, en de reden dat de lengte hier telt: `0032` plus
   * negen cijfers met een vaste-lijnzone wordt na het omrekenen een keurig
   * uitziend `057…`-nummer met één cijfer te veel. Dat glipt er ongemerkt in
   * zodra je enkel op de vorm kijkt.
   */
  it('weigert een vaste lijn met een cijfer te veel', () => {
    expect(normaliseBelgianPhone('0032571234567')).toEqual({ ok: false, reason: 'geen-belgisch-nummer' });
  });

  it('weigert een leeg veld en een buitenlands nummer', () => {
    expect(normaliseBelgianPhone('')).toEqual({ ok: false, reason: 'leeg' });
    expect(normaliseBelgianPhone('+31612345678')).toEqual({ ok: false, reason: 'geen-belgisch-nummer' });
  });
});

describe('matchContacts', () => {
  const people = [
    { id: 'u1', name: 'Kyrill Adriaenssens' },
    { id: 'u2', name: 'Wout Jansen' },
    { id: 'u3', name: 'Wout Peeters' },
    { id: 'u4', name: 'Jonas De Smet' },
    { id: 'u5', name: 'Jonas De Smet' },
  ];

  it('koppelt op de volledige naam, ook met accenten en hoofdletters', () => {
    const result = matchContacts([{ name: 'KYRILL ADRIAENSSENS', phone: '0032470123456' }], people);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].person.id).toBe('u1');
    expect(result.matched[0].how).toBe('naam');
    expect(result.matched[0].phone).toBe('0470 12 34 56');
  });

  it('koppelt een omgedraaide naam', () => {
    const result = matchContacts([{ name: 'Jansen Wout', phone: '0032471234567' }], people);
    expect(result.matched[0].person.id).toBe('u2');
    expect(result.matched[0].how).toBe('omgedraaide-naam');
  });

  it('kiest niet tussen twee mensen met dezelfde naam', () => {
    const result = matchContacts([{ name: 'Jonas De Smet', phone: '0032470123456' }], people);
    expect(result.matched).toEqual([]);
    expect(result.ambiguous[0].candidates.map((person) => person.id)).toEqual(['u4', 'u5']);
  });

  /** Nooit op een deel van een naam: twee Wouters zijn twee Wouters. */
  it('koppelt niet op een halve naam', () => {
    const result = matchContacts([{ name: 'Wout', phone: '0032470123456' }], people);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
  });

  it('houdt een onleesbaar nummer apart van een naam die wel klopt', () => {
    const result = matchContacts([{ name: 'Wout Jansen', phone: '0032057123456' }], people);
    expect(result.matched).toEqual([]);
    expect(result.badPhone[0]).toMatchObject({ reason: 'dubbele-nul' });
    expect(result.badPhone[0].person.id).toBe('u2');
  });
});
