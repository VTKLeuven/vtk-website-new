import { money, shortDate } from '@/components/bo-budget/format';
import { shopOfUrl, SHOPS } from '@/lib/priceCheck/shops';
import { allCostRows, type CalcContext } from './calc';
import { fixedPriceOf } from './fixed';
import { liveCheck, openCheck, shopName } from './prices';
import type { BudgetContent, CostRow } from './types';

/*
 * De stand van de prijs van één regel, voor de kolom Controle van het budget:
 * klopt, loopt, zelf nagekeken, of wat er scheelt. En de telling over het hele
 * budget, voor het blok "Prijzen bij de webshops" boven de secties. Puur: de
 * editor, de download en de tests zeggen hetzelfde.
 */

export type ControlState =
  | 'ok'
  | 'fixed'
  | 'confirmed'
  | 'waiting'
  | 'changed'
  | 'notfound'
  | 'failed'
  | 'byhand'
  | 'nolink'
  | 'nosource'
  | 'offfixed';

export type ControlTone = 'ok' | 'muted' | 'bad' | 'low';

export const CONTROL_TONE: Record<ControlState, ControlTone> = {
  ok: 'ok',
  fixed: 'ok',
  confirmed: 'ok',
  waiting: 'muted',
  byhand: 'muted',
  changed: 'bad',
  notfound: 'bad',
  nolink: 'bad',
  nosource: 'bad',
  offfixed: 'bad',
  failed: 'low',
};

export type Control = {
  state: ControlState;
  /** De uitleg in de tooltip: wat, wanneer en door wie. */
  tip: string;
  /** Een kort woord naast het icoon, enkel voor wat aandacht vraagt. */
  word?: string;
  /** Mag iemand zeggen dat hij de prijs zelf nakeek? De site kon ze niet bevestigen. */
  offer: boolean;
  /** De prijs die de winkel nu vraagt, om over te nemen. */
  shopPrice?: number;
};

/** "13 nov, 14:02", of enkel de dag bij een bevestiging van voor de site het uur bijhield. */
export function checkedWhen(iso: string, nl: boolean): string {
  if (iso.length <= 10) return shortDate(iso, nl);
  return new Date(iso).toLocaleString(nl ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
  });
}

export function hostLabel(url: string | undefined): string {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '');
  } catch {
    return 'Webshop';
  }
}

/** De naam van de winkel van een regel: gekend, Collect&Go, of de host van de link. */
export function shopLabel(row: CostRow): string {
  const url = row.source?.url?.trim();
  const shopId = shopOfUrl(url);
  return shopId ? SHOPS[shopId].name : row.source?.type === 'collectgo' ? 'Collect&Go' : hostLabel(url);
}

function confirmedTip(row: CostRow, nl: boolean): string {
  const who = row.checkedBy || (nl ? 'iemand' : 'someone');
  return nl
    ? `Zelf nagekeken door ${who} op ${checkedWhen(row.checkedAt ?? '', nl)}`
    : `Checked by ${who} on ${checkedWhen(row.checkedAt ?? '', nl)}`;
}

/**
 * Hoe het staat met de prijs van een regel. Null voor een regel zonder prijs om
 * na te kijken (een forfait, de rest, de servicekost, de prijs van de zaal).
 */
export function controlOf(content: BudgetContent, ctx: CalcContext, row: CostRow, nl: boolean): Control | null {
  if (row.rest || row.service || row.forfait) return null;
  const confirmed: Control | null = row.checkedAt
    ? { state: 'confirmed', tip: confirmedTip(row, nl), offer: false }
    : null;
  const s = row.source;
  if (!s) {
    if (confirmed) return confirmed;
    const fixed = fixedPriceOf(content, ctx, row);
    if (fixed?.exact)
      return {
        state: 'fixed',
        tip: nl ? 'Vaste prijs uit de instellingen' : 'Fixed price from the settings',
        offer: false,
      };
    if (fixed)
      return {
        state: 'offfixed',
        word: nl ? `vast is ${money(fixed.price)}` : `fixed is ${money(fixed.price, false)}`,
        tip: nl ? 'Deze prijs wijkt af van de vaste prijs' : 'This price differs from the fixed price',
        offer: true,
      };
    return {
      state: 'nosource',
      tip: nl ? 'Geen bron: geen link, offerte of vaste prijs' : 'No source: no link, quote or fixed price',
      offer: true,
    };
  }
  if (s.type === 'locatie') return null;
  if (s.type !== 'webshop' && s.type !== 'collectgo') return confirmed;

  const url = s.url?.trim();
  const isLink = !!url && /^https?:\/\//i.test(url);
  const shopId = shopOfUrl(url);
  const label = shopLabel(row);
  const open = openCheck(row);
  const live = liveCheck(row);
  if (open?.status === 'changed') {
    const excl = open.basis === 'excl' ? ' excl.' : '';
    const price = open.price ?? 0;
    return {
      state: 'changed',
      word: nl ? `winkel: ${money(price)}${excl}` : `shop: ${money(price, false)}${excl}`,
      tip: nl ? `${shopName(open.shop)} vraagt nu ${money(price)}${excl}` : `The shop now asks ${money(price, false)}`,
      offer: true,
      shopPrice: open.price ?? undefined,
    };
  }
  if (open?.status === 'notfound')
    return {
      state: 'notfound',
      word: nl ? 'niet meer te vinden' : 'not found',
      tip: nl ? `Het product staat niet meer bij ${label}` : `The product is no longer at ${label}`,
      offer: true,
    };
  if (open?.status === 'failed')
    return {
      state: 'failed',
      word: nl ? 'geen antwoord' : 'no answer',
      tip: nl
        ? `Geen antwoord van ${label}${open.reason ? ` (${open.reason})` : ''}. De site probeert het over vier uur opnieuw.`
        : `No answer from ${label}. The site tries again in four hours.`,
      offer: true,
    };
  if (live?.status === 'ok')
    return {
      state: 'ok',
      tip: nl
        ? `Prijs klopt bij ${label}, nagekeken ${checkedWhen(live.at, nl)}`
        : `Price correct at ${label}, checked ${checkedWhen(live.at, nl)}`,
      offer: false,
    };
  if (confirmed) return confirmed;
  if (!isLink)
    return {
      state: 'nolink',
      word: nl ? 'geen link' : 'no link',
      tip: nl ? 'Geen link naar het product' : 'No link to the product',
      offer: true,
    };
  if (shopId && SHOPS[shopId].live)
    return {
      state: 'waiting',
      tip: nl
        ? 'Wordt vanzelf nagekeken, om de vier uur tot het BO'
        : 'Checked automatically every four hours until the meeting',
      offer: true,
    };
  return {
    state: 'byhand',
    tip: nl
      ? 'De site kan deze winkel niet zelf nakijken: kijk de prijs zelf na'
      : 'The site cannot check this shop: check the price yourself',
    offer: true,
  };
}

/** De standen die over een prijs bij een webshop gaan, in de volgorde van het blok Prijzen. */
export const PRICE_STATES = [
  'ok',
  'confirmed',
  'changed',
  'notfound',
  'failed',
  'waiting',
  'byhand',
  'nolink',
] as const;
export type PriceState = (typeof PRICE_STATES)[number];

export type PriceSummary = {
  /** Regels met een webshop of Collect&Go als bron. */
  rows: number;
  /** Waarvan de site er zelf kan nakijken (een link naar één product bij een gekende winkel). */
  counts: Record<PriceState, number>;
  /** Wanneer de laatste volledige ronde liep (ISO), of null. */
  lastRound: string | null;
};

/** Hoe het staat met de prijzen bij de webshops van een budget, geteld per stand. */
export function priceSummary(content: BudgetContent, ctx: CalcContext): PriceSummary {
  const counts = Object.fromEntries(PRICE_STATES.map((s) => [s, 0])) as Record<PriceState, number>;
  let rows = 0;
  for (const row of allCostRows(content)) {
    const type = row.source?.type;
    if ((type !== 'webshop' && type !== 'collectgo') || row.rest || row.forfait || row.service) continue;
    rows += 1;
    const control = controlOf(content, ctx, row, true);
    const state = control?.state;
    if (state && (PRICE_STATES as readonly string[]).includes(state)) counts[state as PriceState] += 1;
  }
  return { rows, counts, lastRound: content.pricesAt ?? null };
}
