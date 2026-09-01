import { describe, expect, it } from 'vitest';
import {
  MAX_HOUR_PX,
  MIN_HOUR_PX,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  ZOOM_WHEEL_MAX_PX,
  clampZoom,
  hourPxFor,
  wheelPixels,
  zoomByWheel,
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

describe('wheelPixels', () => {
  it('neemt pixels over zoals ze binnenkomen', () => {
    expect(wheelPixels({ deltaY: 120, deltaMode: 0 })).toBe(120);
  });

  it('rekent regels en pagina\'s om naar pixels', () => {
    // Firefox en sommige muizen melden regels of pagina's. Zonder omrekening
    // zoomt dezelfde muis daar honderd keer trager dan in Chrome.
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBeGreaterThan(30);
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 })).toBeGreaterThan(300);
  });
});

describe('zoomByWheel', () => {
  it('zoomt in bij omhoog scrollen en uit bij omlaag', () => {
    expect(zoomByWheel(2, -20)).toBeGreaterThan(2);
    expect(zoomByWheel(2, 20)).toBeLessThan(2);
  });

  it('houdt één trackpadgebeurtenis klein', () => {
    // Dit is waar het over ging: de eerste versie deed 1,25x per gebeurtenis, en
    // een trackpad vuurt er dertig per gebaar. Eén stapje mag dus maar een paar
    // procent zijn, anders slaat één veeg tegen het maximum aan.
    expect(zoomByWheel(1, -8)).toBeLessThan(1.03);
  });

  it('blijft vloeiend over een heel gebaar', () => {
    // Dertig kleine stapjes samen horen een merkbare maar beheersbare zoom te
    // geven, niet het hele bereik.
    let zoom = ZOOM_MIN;
    for (let step = 0; step < 30; step += 1) zoom = zoomByWheel(zoom, -8);
    expect(zoom).toBeGreaterThan(1.2);
    expect(zoom).toBeLessThan(2.5);
  });

  it('vlakt één enorme gebeurtenis af', () => {
    // Een versnelde trackpadveeg meldt soms honderden pixels in één keer; zonder
    // grens springt de kalender dan alsnog een heel bereik door.
    expect(zoomByWheel(1, -5000)).toBe(zoomByWheel(1, -ZOOM_WHEEL_MAX_PX));
  });

  it('blijft binnen de grenzen', () => {
    expect(zoomByWheel(ZOOM_MIN, 500)).toBe(ZOOM_MIN);
    expect(zoomByWheel(ZOOM_MAX, -500)).toBe(ZOOM_MAX);
  });
});
