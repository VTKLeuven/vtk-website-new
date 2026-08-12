import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_CLOSE,
  HIGHLIGHT_OPEN,
  MAX_QUERY_LENGTH,
  compareResults,
  isUsableQuery,
  normalizeForMatch,
  normalizeQuery,
  prefixTsQuery,
  snippetParts,
  sortResults,
  type SearchResult,
} from '@/lib/search';

// De sentinels als losse namen: in de broncode zijn het onzichtbare
// controltekens, en een test die je niet kan lezen bewijst niets.
const OPEN = HIGHLIGHT_OPEN;
const CLOSE = HIGHLIGHT_CLOSE;

describe('de zoekterm opschonen', () => {
  it('geeft een lege string voor lege invoer', () => {
    expect(normalizeQuery(undefined)).toBe('');
    expect(normalizeQuery(null)).toBe('');
    expect(normalizeQuery('   ')).toBe('');
  });

  it('haalt controltekens eruit en houdt één spatie tussen de woorden', () => {
    // De NUL accepteert Postgres niet in een `text`, en de twee sentinels van
    // ts_headline mogen nooit uit de invoer zelf komen.
    expect(normalizeQuery(`cantus\u0000${OPEN}${CLOSE}   2026\n`)).toBe('cantus 2026');
  });

  it('laat aanhalingstekens en operatoren staan, want die betekenen iets', () => {
    expect(normalizeQuery('  "job fair" -bedrijf ')).toBe('"job fair" -bedrijf');
  });

  it('kapt absurd lange invoer af op een woordgrens', () => {
    const query = normalizeQuery(`${'a'.repeat(60)} ${'b'.repeat(70)}`);
    expect(query).toBe('a'.repeat(60));
    expect(query.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
  });

  it('kapt hard af wanneer er geen woordgrens in zit', () => {
    const query = normalizeQuery('x'.repeat(300));
    expect(query).toBe('x'.repeat(MAX_QUERY_LENGTH));
  });
});

describe('is er genoeg getypt', () => {
  it('zoekt niet op minder dan twee tekens', () => {
    expect(isUsableQuery('')).toBe(false);
    expect(isUsableQuery('a')).toBe(false);
  });

  it('zoekt vanaf twee tekens', () => {
    expect(isUsableQuery('ab')).toBe(true);
    expect(isUsableQuery('cantus')).toBe(true);
  });
});

describe('het fragment opsplitsen', () => {
  it('markeert wat tussen de sentinels staat', () => {
    expect(snippetParts(`De ${OPEN}cantus${CLOSE} begint om acht uur`)).toEqual([
      { text: 'De ', highlight: false },
      { text: 'cantus', highlight: true },
      { text: ' begint om acht uur', highlight: false },
    ]);
  });

  it('geeft niets terug voor een leeg fragment', () => {
    expect(snippetParts(null)).toEqual([]);
    expect(snippetParts('   ')).toEqual([]);
  });

  it('laat een openingssentinel zonder tegenhanger gewoon doorlopen', () => {
    // Een fragment kan middenin een gemarkeerd woord afgekapt zijn; de sentinel
    // mag dan nooit als teken op het scherm belanden.
    expect(snippetParts(`${OPEN}cantus begint`)).toEqual([
      { text: 'cantus begint', highlight: true },
    ]);
  });

  it('negeert een sluitsentinel zonder tegenhanger', () => {
    expect(snippetParts(`cantus${CLOSE} begint`)).toEqual([
      { text: 'cantus begint', highlight: false },
    ]);
  });

  it('haalt de markdown-resten eruit', () => {
    expect(snippetParts('een fragment dat ## middenin begint met **vet**')).toEqual([
      { text: 'een fragment dat middenin begint met vet', highlight: false },
    ]);
  });

  it('haalt ook een half opmaakteken eruit', () => {
    expect(snippetParts('inschrijven via de **[balie](/theokot)')).toEqual([
      { text: 'inschrijven via de balie', highlight: false },
    ]);
  });

  it('houdt de markering heel over een opmaakteken heen', () => {
    expect(snippetParts(`de ${OPEN}cantus${CLOSE} van **VTK**`)).toEqual([
      { text: 'de ', highlight: false },
      { text: 'cantus', highlight: true },
      { text: ' van VTK', highlight: false },
    ]);
  });
});

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    kind: 'page',
    id: 'a',
    href: '/info/theokot',
    title: 'Theokot',
    meta: null,
    rank: 0.1,
    snippet: [],
    ...overrides,
  };
}

describe('de volgorde van de resultaten', () => {
  it('zet de hoogste rang vooraan', () => {
    const low = result({ id: 'laag', rank: 0.05 });
    const high = result({ id: 'hoog', rank: 0.4 });
    expect(sortResults([low, high]).map((r) => r.id)).toEqual(['hoog', 'laag']);
  });

  it('zet bij gelijke rang een pagina voor een evenement', () => {
    const event = result({ kind: 'event', id: 'evenement', title: 'Aperitief' });
    const page = result({ kind: 'page', id: 'pagina', title: 'Zeus' });
    expect(compareResults(page, event)).toBeLessThan(0);
    expect(compareResults(event, page)).toBeGreaterThan(0);
    // Ook wanneer de titel van het evenement alfabetisch eerst komt.
    expect(sortResults([event, page]).map((r) => r.id)).toEqual(['pagina', 'evenement']);
  });

  it('sorteert daarna alfabetisch op titel', () => {
    const b = result({ id: 'b', title: 'Bierbowling' });
    const a = result({ id: 'a', title: 'Aperitief' });
    expect(sortResults([b, a]).map((r) => r.title)).toEqual(['Aperitief', 'Bierbowling']);
  });

  it('valt terug op het id, zodat de volgorde niet per herlading wisselt', () => {
    const first = result({ id: '111', title: 'Cantus' });
    const second = result({ id: '222', title: 'Cantus' });
    expect(compareResults(first, second)).toBeLessThan(0);
    expect(sortResults([second, first]).map((r) => r.id)).toEqual(['111', '222']);
    expect(sortResults([first, second]).map((r) => r.id)).toEqual(['111', '222']);
    // Twee keer exact hetzelfde resultaat blijft gelijk, geen willekeur.
    expect(compareResults(first, first)).toBe(0);
  });

  it('muteert de lijst die binnenkomt niet', () => {
    const input = [result({ id: 'b', rank: 0.1 }), result({ id: 'a', rank: 0.9 })];
    sortResults(input);
    expect(input.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('zet bij gelijke rang een externe link tussen pagina en evenement', () => {
    // Een link naar een andere site is nuttig, maar wie op deze site zoekt, wil
    // eerst zien wat er hier staat.
    const page = result({ kind: 'page', id: 'p', title: 'Zeus' });
    const link = result({ kind: 'link', id: 'l', title: 'Aap' });
    const event = result({ kind: 'event', id: 'e', title: 'Aap' });
    expect(sortResults([event, link, page]).map((r) => r.id)).toEqual(['p', 'l', 'e']);
  });
});

describe('zoeken op woordbegin', () => {
  it('maakt van elke term een prefix', () => {
    // Zonder dit vindt "uitleen" de uitleendienst niet: de stammer zoekt op
    // hele woorden.
    expect(prefixTsQuery('uitleen')).toBe('uitleen:*');
    expect(prefixTsQuery('job fair')).toBe('job:* & fair:*');
  });

  it('gooit de operatoren van tsquery eruit in plaats van te crashen', () => {
    // `&`, `|` en `!` zijn syntaxis voor to_tsquery. Wie ze intypt hoort geen
    // databasefout te krijgen.
    expect(prefixTsQuery('piano & !kasteel')).toBe('piano:* & kasteel:*');
    // Het lidwoord 't valt hier weg als losse letter; "elixir" doet het werk.
    expect(prefixTsQuery("'t elixir")).toBe('elixir:*');
  });

  it('laat losse letters vallen', () => {
    // `a:*` matcht zowat elke rij en maakt de tweede poging waardeloos.
    expect(prefixTsQuery('a piano')).toBe('piano:*');
    expect(prefixTsQuery('a')).toBeNull();
    expect(prefixTsQuery('!!!')).toBeNull();
  });
});

describe('tekst vergelijkbaar maken', () => {
  it('haalt accenten, hoofdletters en leestekens weg', () => {
    expect(normalizeForMatch('Café  Théokot')).toBe('cafe theokot');
    expect(normalizeForMatch("POC's")).toBe('pocs');
  });
});
