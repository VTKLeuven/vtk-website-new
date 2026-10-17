import type { AdminNavItem, AdminNavNode } from './AdminNav';

export type AdminNavMatch = {
  item: AdminNavItem;
  /** De groep waar de tab onder hangt, of null voor een losse tab. */
  group: string | null;
};

/** Kleine letters en zonder accenten: "cafe" vindt "Café". */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(value: string): string[] {
  return value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Het stuk van het pad dat elke tab gemeen heeft (`/nl/admin`), in segmenten.
 * Zonder dat te schrappen vond "admin" of "nl" elke tab.
 */
function sharedSegments(hrefs: string[]): string[] {
  const paths = hrefs.filter((href) => href.startsWith('/')).map((href) => href.split('/').filter(Boolean));
  if (paths.length === 0) return [];
  let prefix = paths[0];
  for (const path of paths.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < path.length && prefix[i] === path[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

type Haystack = { label: string; labelWords: string[]; group: string; groupWords: string[]; path: string };

/**
 * Hoe goed één zoekwoord past, lager is beter: het begin van het label, het
 * begin van een woord erin, ergens in het label, dan de groep, en als laatste
 * het pad (zo vindt "flows" ook "Mails & schermen" op /admin/it/flows).
 */
function tokenScore(token: string, hay: Haystack): number | null {
  if (hay.label.startsWith(token)) return 0;
  if (hay.labelWords.some((word) => word.startsWith(token))) return 1;
  if (hay.label.includes(token)) return 2;
  if (hay.groupWords.some((word) => word.startsWith(token))) return 3;
  if (hay.group.includes(token)) return 4;
  if (hay.path.includes(token)) return 5;
  return null;
}

/**
 * De tabs die bij een zoekopdracht passen, de beste eerst en bij gelijke stand
 * in de volgorde van de zijbalk. Elk woord moet ergens passen; het slechtst
 * passende woord bepaalt de plaats. Zonder zoekopdracht: elke tab, in volgorde.
 */
export function matchAdminNav(nodes: AdminNavNode[], query: string): AdminNavMatch[] {
  const entries = nodes.flatMap((node): AdminNavMatch[] =>
    node.type === 'item'
      ? [{ item: node.item, group: null }]
      : node.items.map((item) => ({ item, group: node.label }))
  );
  const tokens = words(fold(query));
  if (tokens.length === 0) return entries;

  const shared = sharedSegments(entries.map((entry) => entry.item.href)).length;
  const scored: { entry: AdminNavMatch; score: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const label = fold(entry.item.label);
    const group = fold(entry.group ?? '');
    const hay: Haystack = {
      label,
      labelWords: words(label),
      group,
      groupWords: words(group),
      path: entry.item.href.startsWith('/')
        ? fold(entry.item.href.split('/').filter(Boolean).slice(shared).join(' '))
        : '',
    };
    let worst = 0;
    for (const token of tokens) {
      const score = tokenScore(token, hay);
      if (score === null) return;
      worst = Math.max(worst, score);
    }
    scored.push({ entry, score: worst, order });
  });

  return scored.sort((a, b) => a.score - b.score || a.order - b.order).map(({ entry }) => entry);
}
