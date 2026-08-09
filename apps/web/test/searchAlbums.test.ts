import { describe, expect, it } from 'vitest';
import { matchAlbums, type SearchableAlbum } from '@/lib/searchAlbums';

const album = (extra: Partial<SearchableAlbum> = {}): SearchableAlbum => ({
  id: 'immich-1',
  slug: 'galabal-2026',
  title: 'Galabal 2026',
  description: 'De fotos van het galabal in de Hallen van Schaarbeek.',
  date: '2026-03-14T00:00:00.000Z',
  year: 2026,
  photoCount: 214,
  ...extra,
});

describe('fotoalbums zoeken', () => {
  it('vindt een album op zijn titel en linkt naar de mediapagina', () => {
    const [result] = matchAlbums([album()], 'galabal', 'nl');
    expect(result.kind).toBe('album');
    expect(result.href).toBe('/media/galabal-2026');
    expect(result.title).toBe('Galabal 2026');
    expect(result.rank).toBeGreaterThan(0.5);
  });

  it('zet het taalvoorvoegsel voor een Engelse bezoeker', () => {
    const [result] = matchAlbums([album()], 'galabal', 'en');
    expect(result.href).toBe('/en/media/galabal-2026');
  });

  it('houdt de id van Immich aan en niet de slug', () => {
    // De slug wordt bij elke snapshot opnieuw uit de albumnaam afgeleid en kan
    // dus schuiven; de id niet.
    const [result] = matchAlbums([album()], 'galabal', 'nl');
    expect(result.id).toBe('immich-1');
  });

  it('vindt ook op een woord uit de beschrijving, maar lager', () => {
    const [result] = matchAlbums([album()], 'schaarbeek', 'nl');
    expect(result).toBeDefined();
    expect(result.rank).toBeLessThan(0.5);
  });

  it('geeft niets terug voor een term die nergens staat', () => {
    expect(matchAlbums([album()], 'kwibusfluitketel', 'nl')).toEqual([]);
  });

  it('zet de datum en het aantal fotos in de context', () => {
    const [result] = matchAlbums([album()], 'galabal', 'nl');
    expect(result.meta).toBe('14 maart 2026 · 214 foto’s'.replace('’', "'"));
  });

  it('valt terug op het jaar wanneer er geen datum is', () => {
    const [result] = matchAlbums([album({ date: null })], 'galabal', 'nl');
    expect(result.meta).toBe("2026 · 214 foto's");
  });

  it('overleeft een onleesbare datum uit Immich', () => {
    const [result] = matchAlbums([album({ date: 'geen datum', year: null })], 'galabal', 'nl');
    expect(result.meta).toBe("214 foto's");
  });

  it('schrijft één foto in het enkelvoud', () => {
    const [result] = matchAlbums([album({ date: null, year: null, photoCount: 1 })], 'galabal', 'nl');
    expect(result.meta).toBe('1 foto');
  });
});
