import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FAKSCANNER_CONFIG,
  earnedReward,
  fakDayKey,
  isDoublePeriod,
  parseFakscannerConfig,
  pointsForScan,
  rewardProgress,
} from '@/lib/fakscanner';

const config = DEFAULT_FAKSCANNER_CONFIG;

describe('de bardag van een scan', () => {
  it('houdt een avond die over middernacht loopt bij dezelfde dag', () => {
    // Wie om 23u50 scant en om 00u10 nog eens, was op één avond aan de bar.
    expect(fakDayKey(config, new Date('2026-08-14T23:50:00+02:00'))).toBe('2026-08-14');
    expect(fakDayKey(config, new Date('2026-08-15T00:10:00+02:00'))).toBe('2026-08-14');
    expect(fakDayKey(config, new Date('2026-08-15T05:59:00+02:00'))).toBe('2026-08-14');
  });

  it('begint een nieuwe dag op het ingestelde uur', () => {
    expect(fakDayKey(config, new Date('2026-08-15T06:00:00+02:00'))).toBe('2026-08-15');
    expect(fakDayKey(config, new Date('2026-08-15T14:00:00+02:00'))).toBe('2026-08-15');
  });

  it('rekent in Brusselse tijd, niet in UTC', () => {
    // 22:30 UTC is in de zomer al 00:30 in Brussel, en dus nog dezelfde bardag.
    expect(fakDayKey(config, new Date('2026-08-14T22:30:00Z'))).toBe('2026-08-14');
  });

  it('volgt een rollover van middernacht wanneer die zo ingesteld staat', () => {
    const midnight = { ...config, dayRolloverHour: 0 };
    expect(fakDayKey(midnight, new Date('2026-08-15T00:10:00+02:00'))).toBe('2026-08-15');
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
    const late = { ...config, doubleStart: '23:30', doubleEnd: '00:30' };
    expect(isDoublePeriod(late, new Date('2026-08-14T23:45:00+02:00'))).toBe(true);
    expect(isDoublePeriod(late, new Date('2026-08-15T00:15:00+02:00'))).toBe(true);
    expect(isDoublePeriod(late, new Date('2026-08-15T01:00:00+02:00'))).toBe(false);
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
    expect(parseFakscannerConfig({ dayRolloverHour: 24 }).dayRolloverHour).toBe(
      DEFAULT_FAKSCANNER_CONFIG.dayRolloverHour,
    );
  });

  it('neemt geldige waarden over', () => {
    expect(
      parseFakscannerConfig({
        rewardEvery: 12,
        doubleEnabled: false,
        doubleStart: '23:00',
        doubleEnd: '00:30',
        dayRolloverHour: 4,
      }),
    ).toEqual({
      rewardEvery: 12,
      doubleEnabled: false,
      doubleStart: '23:00',
      doubleEnd: '00:30',
      dayRolloverHour: 4,
    });
  });
});
