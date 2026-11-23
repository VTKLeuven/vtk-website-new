import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLANNER_PREFS,
  parsePlannerPrefs,
  serializePlannerPrefs,
} from '@/components/transport-calendar/prefs';
import { DEFAULT_TRIP_FIELDS, ZOOM_MAX, ZOOM_MIN } from '@/components/transport-calendar/types';

describe('de cookie met de kijkvoorkeuren van de planning', () => {
  it('geeft null zonder cookie, zodat de browser nog uit localStorage kan overnemen', () => {
    expect(parsePlannerPrefs(undefined)).toBeNull();
    expect(parsePlannerPrefs('')).toBeNull();
  });

  it('leest terug wat hij schreef', () => {
    const prefs = {
      zoom: 1.25,
      fields: { ...DEFAULT_TRIP_FIELDS, driver: false, requester: true },
      nightOpen: true,
      availability: true,
      narrow: false,
    };
    expect(parsePlannerPrefs(serializePlannerPrefs(prefs))).toEqual(prefs);
  });

  it('leest ook de versie die de browser met encodeURIComponent schreef', () => {
    const encoded = encodeURIComponent(serializePlannerPrefs({ ...DEFAULT_PLANNER_PREFS, availability: true }));
    expect(parsePlannerPrefs(encoded)?.availability).toBe(true);
  });

  it('laat een onbekend smal scherm onbekend', () => {
    expect(parsePlannerPrefs(serializePlannerPrefs(DEFAULT_PLANNER_PREFS))?.narrow).toBeNull();
  });

  it('klemt een zoom buiten het bereik en valt bij onzin terug op passend', () => {
    expect(parsePlannerPrefs('z=999')?.zoom).toBe(ZOOM_MAX);
    expect(parsePlannerPrefs('z=0.1')?.zoom).toBe(ZOOM_MIN);
    expect(parsePlannerPrefs('z=abc')?.zoom).toBe(ZOOM_MIN);
  });

  it('geeft een veld dat later bijkomt zijn standaard in plaats van uit', () => {
    // Een cookie van toen er maar drie velden waren.
    const prefs = parsePlannerPrefs('v=101');
    expect(prefs?.fields.time).toBe(true);
    expect(prefs?.fields.title).toBe(false);
    expect(prefs?.fields.event).toBe(true);
    expect(prefs?.fields.vehicle).toBe(DEFAULT_TRIP_FIELDS.vehicle);
    expect(prefs?.fields.driver).toBe(DEFAULT_TRIP_FIELDS.driver);
  });

  it('gooit niet bij een kapotte waarde', () => {
    expect(parsePlannerPrefs('%E0%A4%A')).toBeNull();
  });
});
