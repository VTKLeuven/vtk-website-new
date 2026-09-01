import { describe, expect, it } from 'vitest';
import {
  MAX_HOUR_PX,
  MIN_HOUR_PX,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  clampZoom,
  hourPxFor,
} from '../components/transport-calendar/types';

/** Wat een pane van 24 uur hoog per uur overhoudt. */
function fitFor(paneHeight: number): number {
  return paneHeight / 24;
}

describe('clampZoom', () => {
  it('laat niet verder uitzoomen dan de hele dag', () => {
    // Onder 1 zie je de dag al helemaal en voeg je enkel wit toe; dat is geen
    // uitzoomen meer.
    expect(clampZoom(0.5)).toBe(ZOOM_MIN);
    expect(clampZoom(-3)).toBe(ZOOM_MIN);
  });

  it('houdt de bovengrens aan', () => {
    expect(clampZoom(100)).toBe(ZOOM_MAX);
  });

  it('valt terug op de standaard bij onzin', () => {
    // localStorage geeft strings terug, en `Number('abc')` is NaN: zonder deze
    // regel wordt de hoogte van elk uur NaN en is het rooster leeg. Infinity
    // gaat niet naar de bovengrens maar naar de standaard: dat is geen
    // "helemaal ingezoomd", dat is een kapotte waarde.
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_MIN);
  });
});

describe('hourPxFor', () => {
  it('laat de hele dag precies passen op zoom 1', () => {
    // Dit is de hele afspraak: zoom 1 betekent geen scrollbalk. 24 uur maal de
    // hoogte van een uur is exact de hoogte van het rooster.
    const fit = fitFor(720);
    expect(hourPxFor(fit, ZOOM_MIN) * 24).toBeCloseTo(720, 6);
  });

  it('maakt een uur hoger naarmate het venster groter is', () => {
    // Waarom volledig scherm nu wél iets doet: hetzelfde zoomniveau geeft op een
    // groter venster een hoger uur, dus de kalender vult het scherm.
    expect(hourPxFor(fitFor(1440), ZOOM_MIN)).toBeGreaterThan(hourPxFor(fitFor(720), ZOOM_MIN));
  });

  it('schaalt mee met de zoomfactor', () => {
    const fit = fitFor(720);
    expect(hourPxFor(fit, ZOOM_STEP)).toBeCloseTo(hourPxFor(fit, 1) * ZOOM_STEP, 6);
  });

  it('houdt een uur leesbaar op een korte pagina', () => {
    // 240px voor een hele dag is 10px per uur; dan liggen de uurlijnen op
    // elkaar. Dan scrolt het rooster liever.
    expect(hourPxFor(fitFor(240), ZOOM_MIN)).toBe(MIN_HOUR_PX);
  });

  it('loopt niet weg bij een absurde hoogte', () => {
    expect(hourPxFor(fitFor(100_000), ZOOM_MAX)).toBe(MAX_HOUR_PX);
  });
});
