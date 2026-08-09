import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  trackAftermovie,
  trackCheckoutStart,
  trackEmptySearch,
  trackMagazineDownload,
  trackMagazineNewTab,
  trackMagazineView,
} from '@/lib/analytics-client';

const issue = {
  id: 'bakske-2025-2026-s2w6',
  kind: 'bakske',
  publicationTitle: "'t Bakske",
  issueLabel: 'Semester 2, week 6',
};

afterEach(() => vi.unstubAllGlobals());

describe('meten zonder toestemming', () => {
  it('doet niets wanneer er geen browser is', () => {
    // Deze module wordt vanuit een client component geïmporteerd, maar die
    // rendert eerst op de server. Zou hij daar `window` aanraken, dan valt de
    // pagina om nog voor iemand ze ziet.
    expect(() => trackMagazineView(issue)).not.toThrow();
  });

  it('doet niets wanneer het script niet geladen is', () => {
    // Precies de situatie na "enkel noodzakelijke cookies": `window.umami`
    // bestaat dan niet, en meten mag nooit een voorwaarde zijn om de site te
    // kunnen gebruiken.
    vi.stubGlobal('window', {});
    expect(() => trackMagazineView(issue)).not.toThrow();
    expect(() => trackMagazineDownload(issue)).not.toThrow();
    expect(() => trackMagazineNewTab(issue)).not.toThrow();
  });

  it('doet niets wanneer umami er wel is maar niet bruikbaar', () => {
    vi.stubGlobal('window', { umami: {} });
    expect(() => trackMagazineView(issue)).not.toThrow();
  });
});

describe('meten met toestemming', () => {
  it('stuurt een paginaweergave met het adres van het nummer', () => {
    const track = vi.fn();
    vi.stubGlobal('window', { umami: { track } });

    trackMagazineView(issue);

    expect(track).toHaveBeenCalledTimes(1);
    // Umami geeft de standaard eigenschappen door aan onze functie; die moeten
    // bewaard blijven, anders raakt het website-id kwijt en telt niets mee.
    const build = track.mock.calls[0][0] as (props: Record<string, unknown>) => unknown;
    expect(build({ website: 'abc', referrer: '/media' })).toEqual({
      website: 'abc',
      referrer: '/media',
      url: '/media/bakske/2025-2026-s2w6',
      title: "'t Bakske - Semester 2, week 6",
    });
  });

  it('stuurt downloaden en een nieuw tabblad als gebeurtenis, niet als paginaweergave', () => {
    const track = vi.fn();
    vi.stubGlobal('window', { umami: { track } });

    trackMagazineDownload(issue);
    trackMagazineNewTab(issue);

    expect(track.mock.calls[0]).toEqual([
      'magazine-download',
      { publicatie: 'bakske', nummer: 'bakske-2025-2026-s2w6' },
    ]);
    expect(track.mock.calls[1]).toEqual([
      'magazine-nieuw-tabblad',
      { publicatie: 'bakske', nummer: 'bakske-2025-2026-s2w6' },
    ]);
  });
});

describe('de overige metingen', () => {
  it('stuurt een mislukte zoekopdracht met de term erbij', () => {
    const track = vi.fn();
    vi.stubGlobal('window', { umami: { track } });

    trackEmptySearch('  fakbar openingsuren  ');

    expect(track).toHaveBeenCalledWith('zoeken-zonder-resultaat', {
      zoekterm: 'fakbar openingsuren',
    });
  });

  it('stuurt niets bij een lege zoekterm', () => {
    const track = vi.fn();
    vi.stubGlobal('window', { umami: { track } });

    trackEmptySearch('   ');

    expect(track).not.toHaveBeenCalled();
  });

  it('meet een aftermovie en een begonnen bestelling', () => {
    const track = vi.fn();
    vi.stubGlobal('window', { umami: { track } });

    trackAftermovie({ id: 'galabal-aftermovie', title: 'Galabal' });
    trackCheckoutStart({ slug: 'galabal-2026', title: 'Galabal 2026' });

    expect(track.mock.calls[0]).toEqual([
      'aftermovie',
      { video: 'galabal-aftermovie', titel: 'Galabal' },
    ]);
    // Geen bestelnummer: dat hoort bij een persoon.
    expect(track.mock.calls[1]).toEqual([
      'afrekenen-gestart',
      { evenement: 'galabal-2026', titel: 'Galabal 2026' },
    ]);
    expect(JSON.stringify(track.mock.calls[1])).not.toMatch(/order|bestelling/i);
  });
});
