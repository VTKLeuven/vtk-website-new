import { describe, expect, it } from 'vitest';
import { isOnQuarterHour } from '@/lib/uitleen';
import { QUARTERS, clockLabel, joinMoment, quarterOptions, splitMoment } from '@/lib/quarter-time';

describe('QUARTERS', () => {
  it('loopt van 00:00 tot 23:45', () => {
    expect(QUARTERS).toHaveLength(96);
    expect(QUARTERS[0]).toBe('00:00');
    expect(QUARTERS[95]).toBe('23:45');
  });

  it('bevat enkel uren die de server aanvaardt', () => {
    // De reden dat deze lijst bestaat: wat je kan kiezen, moet door
    // `isOnQuarterHour` raken. Loopt dat ooit uiteen, dan krijgt de gebruiker
    // weer een foutmelding over iets wat het veld hem liet doen.
    for (const time of QUARTERS) {
      expect(isOnQuarterHour(new Date(`2026-09-10T${time}:00.000Z`))).toBe(true);
    }
  });
});

describe('splitMoment', () => {
  it('haalt datum en uur uit elkaar', () => {
    expect(splitMoment('2026-09-10T14:15')).toEqual({ date: '2026-09-10', time: '14:15' });
  });

  it('gooit seconden weg', () => {
    expect(splitMoment('2026-09-10T14:15:00')).toEqual({ date: '2026-09-10', time: '14:15' });
  });

  it('overleeft een lege of halve waarde', () => {
    expect(splitMoment('')).toEqual({ date: '', time: '' });
    expect(splitMoment('2026-09-10')).toEqual({ date: '2026-09-10', time: '' });
  });
});

describe('joinMoment', () => {
  it('voegt samen', () => {
    expect(joinMoment('2026-09-10', '14:15')).toBe('2026-09-10T14:15');
  });

  it('geeft leeg terug zolang een van de twee ontbreekt', () => {
    // Anders ziet een formulier dat enkel op "niet leeg" controleert een halve
    // datum als ingevuld en stuurt het die door.
    expect(joinMoment('2026-09-10', '')).toBe('');
    expect(joinMoment('', '14:15')).toBe('');
  });
});

describe('quarterOptions', () => {
  it('houdt de lijst zoals ze is voor een gewoon kwartier', () => {
    expect(quarterOptions('14:15')).toBe(QUARTERS);
    expect(quarterOptions('')).toBe(QUARTERS);
  });

  it('voegt een bestaand uur toe dat geen kwartier is', () => {
    // Zoals een oudere rit van 22:12: die mag niet uit zijn eigen keuzelijst
    // vallen, want dan lijkt het uur verdwenen.
    const options = quarterOptions('22:12');
    expect(options).toHaveLength(97);
    expect(options).toContain('22:12');
    expect(options.indexOf('22:12')).toBe(options.indexOf('22:00') + 1);
  });
});

describe('clockLabel (F6.25)', () => {
  it('zet minuten binnen de dag om naar een klok', () => {
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel(510)).toBe('08:30');
    expect(clockLabel(23 * 60 + 45)).toBe('23:45');
  });

  it('houdt 24:00 als het einde van de dag', () => {
    expect(clockLabel(24 * 60)).toBe('24:00');
  });

  it('toont 24:35 niet: dat is 00:35 de ochtend erna', () => {
    // De fout die Logistiek zag: een band tot 00:35 stond als "24:35" op het
    // scherm, want de omzetting vergeleek uren (`> 24`) in plaats van minuten.
    expect(clockLabel(24 * 60 + 35)).toBe('00:35');
    expect(clockLabel(24 * 60 + 1)).toBe('00:01');
    expect(clockLabel(24 * 60 + 59)).toBe('00:59');
  });

  it('loopt door tot het einde van de intekendag (05:00 de ochtend erna)', () => {
    expect(clockLabel(25 * 60)).toBe('01:00');
    expect(clockLabel(29 * 60)).toBe('05:00');
  });

  it('rondt af op een hele minuut zonder 60 te tonen', () => {
    expect(clockLabel(59.6)).toBe('01:00');
    expect(clockLabel(510.4)).toBe('08:30');
  });
});
