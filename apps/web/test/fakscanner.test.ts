import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FAKSCANNER_CONFIG,
  earnedReward,
  fakDayStart,
  isDoublePeriod,
  parseFakscannerConfig,
  pointsForScan,
  rewardProgress,
} from '@/lib/fakscanner';

const config = DEFAULT_FAKSCANNER_CONFIG;

/** Wat de klok in Brussel aanwijst op dat instant; leest makkelijker in een assert. */
function brusselsClock(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

describe('het begin van de bardag', () => {
  it('houdt een avond die over middernacht loopt bij dezelfde dag', () => {
    // Wie om 23u50 scant en om 00u10 nog eens, was op één avond aan de bar.
    const avond = fakDayStart(config, new Date('2026-08-14T23:50:00+02:00'));
    const nacht = fakDayStart(config, new Date('2026-08-15T00:10:00+02:00'));
    const bijnaOchtend = fakDayStart(config, new Date('2026-08-15T05:59:00+02:00'));
    expect(brusselsClock(avond)).toBe('14/08/2026, 06:00');
    expect(nacht.getTime()).toBe(avond.getTime());
    expect(bijnaOchtend.getTime()).toBe(avond.getTime());
  });

  it('begint een nieuwe dag op het ingestelde uur', () => {
    const ochtend = fakDayStart(config, new Date('2026-08-15T06:00:00+02:00'));
    expect(brusselsClock(ochtend)).toBe('15/08/2026, 06:00');
    expect(fakDayStart(config, new Date('2026-08-15T14:00:00+02:00')).getTime()).toBe(
      ochtend.getTime(),
    );
  });

  it('rekent in Brusselse tijd, niet in UTC', () => {
    // 22:30 UTC is in de zomer al 00:30 in Brussel, en dus nog dezelfde bardag.
    expect(brusselsClock(fakDayStart(config, new Date('2026-08-14T22:30:00Z')))).toBe(
      '14/08/2026, 06:00',
    );
  });

  it('volgt een rollover van middernacht wanneer die zo ingesteld staat', () => {
    const middernacht = { ...config, dayRolloverTime: '00:00' };
    expect(brusselsClock(fakDayStart(middernacht, new Date('2026-08-15T00:10:00+02:00')))).toBe(
      '15/08/2026, 00:00',
    );
  });

  it('kan ook op een half uur beginnen', () => {
    const half = { ...config, dayRolloverTime: '05:30' };
    expect(brusselsClock(fakDayStart(half, new Date('2026-08-15T05:29:00+02:00')))).toBe(
      '14/08/2026, 05:30',
    );
    expect(brusselsClock(fakDayStart(half, new Date('2026-08-15T05:31:00+02:00')))).toBe(
      '15/08/2026, 05:30',
    );
  });
});

describe('de nacht van de uurwissel', () => {
  // De bar is soms open wanneer de klok verspringt. De bardag hangt aan de
  // wandklok, dus die nacht duurt 23 of 25 uur maar blijft één bardag.
  it('blijft één bardag wanneer de klok vooruit gaat (laatste zondag van maart)', () => {
    // 2027-03-28: om 02:00 springt de klok naar 03:00 (CET -> CEST).
    const voor = fakDayStart(config, new Date('2027-03-27T23:00:00+01:00'));
    const naSprong = fakDayStart(config, new Date('2027-03-28T04:00:00+02:00'));
    expect(brusselsClock(voor)).toBe('27/03/2027, 06:00');
    expect(naSprong.getTime()).toBe(voor.getTime());
    // En om 6u op de klok begint de volgende bardag gewoon.
    expect(brusselsClock(fakDayStart(config, new Date('2027-03-28T06:30:00+02:00')))).toBe(
      '28/03/2027, 06:00',
    );
  });

  it('blijft één bardag wanneer de klok achteruit gaat (laatste zondag van oktober)', () => {
    // 2026-10-25: om 03:00 springt de klok terug naar 02:00 (CEST -> CET), dus
    // 02:30 bestaat twee keer. Beide keren hoort de scan bij dezelfde bardag.
    const voor = fakDayStart(config, new Date('2026-10-24T23:00:00+02:00'));
    const eersteKeerHalfDrie = fakDayStart(config, new Date('2026-10-25T02:30:00+02:00'));
    const tweedeKeerHalfDrie = fakDayStart(config, new Date('2026-10-25T02:30:00+01:00'));
    expect(brusselsClock(voor)).toBe('24/10/2026, 06:00');
    expect(eersteKeerHalfDrie.getTime()).toBe(voor.getTime());
    expect(tweedeKeerHalfDrie.getTime()).toBe(voor.getTime());
    expect(brusselsClock(fakDayStart(config, new Date('2026-10-25T06:30:00+01:00')))).toBe(
      '25/10/2026, 06:00',
    );
  });

  it('houdt het dubbeltelvenster aan de wandklok in beide richtingen', () => {
    // 22:30 op de klok is 22:30, welke UTC-offset er die avond ook geldt.
    expect(isDoublePeriod(config, new Date('2027-03-27T22:30:00+01:00'))).toBe(true);
    expect(isDoublePeriod(config, new Date('2026-10-24T22:30:00+02:00'))).toBe(true);
    // En 21:30 valt er in beide gevallen buiten, ook al is dat in UTC hetzelfde
    // uur als het ene geval hierboven.
    expect(isDoublePeriod(config, new Date('2027-03-27T21:30:00+01:00'))).toBe(false);
  });
});

describe('het dubbeltelvenster', () => {
  it('telt dubbel binnen het venster en enkel erbuiten', () => {
    expect(isDoublePeriod(config, new Date('2026-08-14T22:30:00+02:00'))).toBe(true);
    expect(pointsForScan(config, new Date('2026-08-14T22:30:00+02:00'))).toBe(2);
    expect(isDoublePeriod(config, new Date('2026-08-14T21:59:00+02:00'))).toBe(false);
    expect(pointsForScan(config, new Date('2026-08-14T21:59:00+02:00'))).toBe(1);
  });

  it('sluit het einduur uit', () => {
    expect(isDoublePeriod(config, new Date('2026-08-14T23:00:00+02:00'))).toBe(false);
  });

  it('werkt ook wanneer het venster over middernacht loopt', () => {
    const laat = { ...config, doubleStart: '23:30', doubleEnd: '00:30' };
    expect(isDoublePeriod(laat, new Date('2026-08-14T23:45:00+02:00'))).toBe(true);
    expect(isDoublePeriod(laat, new Date('2026-08-15T00:15:00+02:00'))).toBe(true);
    expect(isDoublePeriod(laat, new Date('2026-08-15T01:00:00+02:00'))).toBe(false);
  });

  it('telt niets dubbel wanneer het venster uit staat of leeg is', () => {
    expect(isDoublePeriod({ ...config, doubleEnabled: false }, new Date('2026-08-14T22:30:00+02:00'))).toBe(
      false,
    );
    expect(
      isDoublePeriod({ ...config, doubleStart: '22:00', doubleEnd: '22:00' }, new Date('2026-08-14T22:30:00+02:00')),
    ).toBe(false);
  });
});

describe('de gratis pint', () => {
  it('geeft er een bij het passeren van een veelvoud', () => {
    expect(earnedReward(config, 9, 10)).toBe(true);
    expect(earnedReward(config, 19, 20)).toBe(true);
    expect(earnedReward(config, 8, 9)).toBe(false);
    expect(earnedReward(config, 10, 11)).toBe(false);
  });

  it('laat een pint niet verloren gaan wanneer een dubbeltelling erover springt', () => {
    // Van 9 naar 11 raakt de teller nooit exact op 10; die pint hoort er te zijn.
    expect(earnedReward(config, 9, 11)).toBe(true);
  });

  it('rekent de stand om naar verdiende pinten en punten tot de volgende', () => {
    expect(rewardProgress(config, 0)).toEqual({ beers: 0, toNext: 10 });
    expect(rewardProgress(config, 7)).toEqual({ beers: 0, toNext: 3 });
    expect(rewardProgress(config, 10)).toEqual({ beers: 1, toNext: 10 });
    expect(rewardProgress(config, 23)).toEqual({ beers: 2, toNext: 7 });
  });
});

describe('het lezen van de instellingen', () => {
  it('valt terug op de defaults bij lege of kapotte waarden', () => {
    expect(parseFakscannerConfig(null)).toEqual(DEFAULT_FAKSCANNER_CONFIG);
    expect(parseFakscannerConfig({ doubleStart: '25:00', rewardEvery: 0 })).toEqual(
      DEFAULT_FAKSCANNER_CONFIG,
    );
    expect(parseFakscannerConfig({ dayRolloverTime: '24:00' }).dayRolloverTime).toBe(
      DEFAULT_FAKSCANNER_CONFIG.dayRolloverTime,
    );
    // Een uur als getal is de oude vorm en geen geldige tijd meer.
    expect(parseFakscannerConfig({ dayRolloverTime: 6 }).dayRolloverTime).toBe(
      DEFAULT_FAKSCANNER_CONFIG.dayRolloverTime,
    );
  });

  it('neemt geldige waarden over', () => {
    expect(
      parseFakscannerConfig({
        rewardEvery: 12,
        doubleEnabled: false,
        doubleStart: '23:00',
        doubleEnd: '00:30',
        dayRolloverTime: '04:00',
      }),
    ).toEqual({
      rewardEvery: 12,
      doubleEnabled: false,
      doubleStart: '23:00',
      doubleEnd: '00:30',
      dayRolloverTime: '04:00',
    });
  });
});
