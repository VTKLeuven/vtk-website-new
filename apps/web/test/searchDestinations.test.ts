import { describe, expect, it } from 'vitest';
import {
  SEARCHABLE_ROUTES,
  buildDestinations,
  matchDestinations,
  scoreDestination,
  type DestinationTab,
  type SearchDestination,
} from '@/lib/searchDestinations';
import { STATIC_ROUTES } from '@/lib/sitemap';

const piano: SearchDestination = {
  id: '/piano',
  href: '/piano',
  title: 'Piano reserveren',
  description: 'Reserveer een tijdslot op de piano in het kasteel.',
  external: false,
};

const tab = (over: Partial<DestinationTab> = {}): DestinationTab => ({
  slug: 'info',
  labelNl: 'Info',
  labelEn: 'Info',
  introNl: null,
  introEn: null,
  externalUrl: null,
  visible: true,
  links: [],
  ...over,
});

describe('welke plekken doorzoekbaar zijn', () => {
  it('kent elke route die ook in de sitemap staat', () => {
    // Anders belooft de sitemap aan Google een pagina die de bezoeker met de
    // zoekfunctie van dezelfde site niet kan vinden.
    const searchable = new Set(SEARCHABLE_ROUTES.map((route) => route.path));
    for (const path of STATIC_ROUTES) {
      expect(searchable.has(path), `${path} staat in de sitemap maar is niet doorzoekbaar`).toBe(
        true
      );
    }
  });

  it('geeft elke vaste route een titel en een beschrijving uit de woordenlijst', () => {
    const destinations = buildDestinations([], 'nl');
    expect(destinations).toHaveLength(SEARCHABLE_ROUTES.length);
    for (const destination of destinations) {
      expect(destination.title.trim(), `${destination.href}: lege titel`).not.toBe('');
      expect(destination.description, `${destination.href}: lege beschrijving`).toBeTruthy();
    }
  });

  it('vertaalt de titels mee', () => {
    const nl = buildDestinations([], 'nl').find((d) => d.href === '/shift');
    const en = buildDestinations([], 'en').find((d) => d.href === '/shift');
    expect(nl?.title).toBe('Shiften');
    expect(en?.title).toBe('Shifts');
  });

  it('neemt de categorieën en hun menu-items mee', () => {
    const destinations = buildDestinations(
      [tab({ links: [{ id: 'l1', labelNl: 'Uitleendienst', labelEn: 'Equipment', url: '/x' }] })],
      'nl'
    );
    expect(destinations.some((d) => d.href === '/info')).toBe(true);
    expect(destinations.some((d) => d.href === '/x')).toBe(true);
  });

  it('laat een onzichtbare categorie weg', () => {
    const destinations = buildDestinations([tab({ visible: false })], 'nl');
    expect(destinations.some((d) => d.href === '/info')).toBe(false);
  });

  it('markeert een categorie met een eigen site als extern', () => {
    const destinations = buildDestinations(
      [tab({ slug: 'career', externalUrl: 'https://career.vtk.be' })],
      'nl'
    );
    const career = destinations.find((d) => d.href === 'https://career.vtk.be');
    expect(career?.external).toBe(true);
  });

  it('toont een adres maar één keer, ook als het menu het herhaalt', () => {
    // /piano is een vaste route en staat óók als menu-item onder Info. Twee
    // identieke resultaten onder elkaar leest als een fout.
    const destinations = buildDestinations(
      [tab({ links: [{ id: 'l1', labelNl: 'Piano reserveren', labelEn: 'Piano', url: '/piano' }] })],
      'nl'
    );
    expect(destinations.filter((d) => d.href === '/piano')).toHaveLength(1);
    // De vaste route wint, want die draagt een beschrijving.
    expect(destinations.find((d) => d.href === '/piano')?.description).toBeTruthy();
  });
});

describe('hoe goed een bestemming past', () => {
  it('vindt de pianopagina met "piano"', () => {
    // Dit is de klacht waarmee dit begon: "piano" leverde niets op, want /piano
    // is een eigen route en staat in geen enkele tabel die doorzocht werd.
    expect(scoreDestination(piano, 'piano')).toBeGreaterThan(0.9);
  });

  it('vindt ze ook halverwege het woord', () => {
    expect(scoreDestination(piano, 'pian')).toBeGreaterThan(0.9);
  });

  it('trekt zich niets aan van hoofdletters, accenten en leestekens', () => {
    const pocs: SearchDestination = {
      id: '/pocs',
      href: '/pocs',
      title: "POC's",
      description: null,
      external: false,
    };
    expect(scoreDestination(pocs, 'pocs')).toBe(1);
    expect(scoreDestination(pocs, 'POC')).toBeGreaterThan(0);

    const fakbar: SearchDestination = {
      id: '/x',
      href: '/x',
      title: "'t ElixIr",
      description: null,
      external: false,
    };
    expect(scoreDestination(fakbar, 'elixir')).toBeGreaterThan(0);
  });

  it('zet een treffer in de titel boven een treffer in de beschrijving', () => {
    const inTitle = scoreDestination(piano, 'reserveren');
    const inDescription = scoreDestination(piano, 'kasteel');
    expect(inTitle).toBeGreaterThan(inDescription);
    expect(inDescription).toBeGreaterThan(0);
  });

  it('matcht op woordbegin en niet zomaar ergens in een woord', () => {
    // Zonder die regel matcht "ano" op "Piano" en staat de lijst vol ruis.
    expect(scoreDestination(piano, 'ano')).toBe(0);
  });

  it('vraagt dat élke term voorkomt', () => {
    expect(scoreDestination(piano, 'piano kasteel')).toBeGreaterThan(0);
    expect(scoreDestination(piano, 'piano fanfare')).toBe(0);
  });
});

describe('bestemmingen als zoekresultaat', () => {
  it('zet het taalvoorvoegsel voor een intern adres en laat een extern adres staan', () => {
    const external: SearchDestination = {
      id: 'https://cudi.vtk.be',
      href: 'https://cudi.vtk.be',
      title: 'Boeken bestellen',
      description: null,
      external: true,
    };

    const [internalResult] = matchDestinations([piano], 'piano', 'en');
    const [externalResult] = matchDestinations([external], 'boeken', 'en');

    expect(internalResult.href).toBe('/en/piano');
    expect(internalResult.kind).toBe('page');
    expect(externalResult.href).toBe('https://cudi.vtk.be');
    expect(externalResult.kind).toBe('link');
  });

  it('laat wat niet past weg', () => {
    expect(matchDestinations([piano], 'cantus', 'nl')).toEqual([]);
  });
});
