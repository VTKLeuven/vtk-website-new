import { describe, expect, it } from 'vitest';
import { planPhoneImport, teamPhone, type PhoneHolder } from '@/lib/phone-import';
import { matchContacts, parseVcards } from '@/lib/vcard';

/**
 * Welk vinkje aan staat wanneer het importscherm opengaat (F4.3).
 *
 * De vraag achter elk geval hieronder is dezelfde: mag de lijst dit nummer
 * zomaar vervangen? Enkel een nummer dat het team zelf vastlegde, is een
 * bevestigd nummer; de rest is een gok die toevallig klopte.
 */

const card = (name: string, tel: string) =>
  ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, `TEL;type=CELL:${tel}`, 'END:VCARD'].join('\r\n');

const driver = (
  id: string,
  name: string,
  phone: string | null = null,
  phoneSource: PhoneHolder['phoneSource'] = null
): PhoneHolder => ({ id, name, phone, phoneSource });

/** De lijst naast de chauffeurs leggen, zoals het scherm het doet. */
function plan(cards: string[], drivers: PhoneHolder[]) {
  return planPhoneImport(matchContacts(parseVcards(cards.join('\r\n')), drivers).matched);
}

describe('teamPhone', () => {
  it('telt enkel een nummer dat het team zelf vastlegde', () => {
    expect(teamPhone(driver('1', 'Wout Jansen', '0470 12 34 56', 'TEAM'))).toBe('0470 12 34 56');
    expect(teamPhone(driver('1', 'Wout Jansen', '0470 12 34 56', 'PROFILE'))).toBeNull();
    expect(teamPhone(driver('1', 'Wout Jansen', '0470 12 34 56', 'HISTORY'))).toBeNull();
    expect(teamPhone(driver('1', 'Wout Jansen'))).toBeNull();
  });
});

describe('planPhoneImport', () => {
  it('vinkt aan wie nog geen nummer heeft', () => {
    const result = plan([card('Wout Jansen', '0032470123456')], [driver('1', 'Wout Jansen')]);
    expect(result.fresh.map((match) => match.phone)).toEqual(['0470 12 34 56']);
    expect(result.different).toHaveLength(0);
    expect(result.same).toHaveLength(0);
  });

  it('laat een nummer van het team staan en vinkt het niet aan', () => {
    const result = plan([card('Wout Jansen', '0032470123456')], [driver('1', 'Wout Jansen', '0471 00 00 00', 'TEAM')]);
    expect(result.fresh).toHaveLength(0);
    expect(result.different.map((match) => match.person.id)).toEqual(['1']);
  });

  it('vinkt wél aan over een nummer van een profiel of een oude aanvraag', () => {
    // Dit is de reden dat de import bestaat: zo'n nummer is nooit bevestigd.
    const result = plan(
      [card('Wout Jansen', '0032470123456'), card('Lies Peeters', '0032471234567')],
      [driver('1', 'Wout Jansen', '0471 00 00 00', 'PROFILE'), driver('2', 'Lies Peeters', '0472 00 00 00', 'HISTORY')]
    );
    expect(result.fresh.map((match) => match.person.id).sort()).toEqual(['1', '2']);
    expect(result.different).toHaveLength(0);
  });

  it('geeft geen vinkje aan wie precies dit nummer al heeft', () => {
    const result = plan([card('Wout Jansen', '0032470123456')], [driver('1', 'Wout Jansen', '0470 12 34 56', 'TEAM')]);
    expect(result.same.map((match) => match.person.id)).toEqual(['1']);
    expect(result.fresh).toHaveLength(0);
    expect(result.different).toHaveLength(0);
  });

  it('telt een onleesbaar nummer niet mee, ook niet als leeg vakje', () => {
    // `0032` plus de nationale nul: matchContacts houdt die apart, en dan hoort
    // er hier niets te staan. Anders kreeg deze chauffeur een vinkje voor een
    // nummer dat er niet is.
    const result = plan([card('Sofie Bruggeman', '0032573712678')], [driver('1', 'Sofie Bruggeman')]);
    expect(result.fresh).toHaveLength(0);
    expect(result.different).toHaveLength(0);
    expect(result.same).toHaveLength(0);
  });
});
