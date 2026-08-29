import { cashTotal, type CashCounts } from './fakbar-format';

/**
 * De rekensom achter het week- en avondoverzicht.
 *
 * Wat hier staat, staat er omdat de gegevens het dragen. Het weekoverzicht toonde
 * eerder `const totalOmzet = 2676.20` en `€91,28` per avond, hardgecodeerd in de
 * JSX en voor elke week hetzelfde; dat is geen overzicht maar een screenshot.
 * Elk getal hieronder komt uit een veld dat iemand ook echt invult.
 */

export type EveningLike = {
  bancontactRevenue: number;
  cashToSafe: number;
  cashCount: Partial<CashCounts> | null;
  consumption: { quantity: number; category: string; item: { salesPrice: number } }[];
};

export type EveningTotals = {
  /** Wat er die avond effectief binnenkwam: cash naar de kluis plus Bancontact. */
  revenue: number;
  /** Drank die weg is zonder omzet: tappersdrank, mislukte pinten, bonnen, ... */
  lostRevenue: number;
  /** Wat er in de kassa geteld is (bonnen tellen niet mee). */
  counted: number;
  /**
   * Wat er na het afromen in de kassa blijft staan. Negatief betekent dat er
   * meer naar de kluis geboekt is dan er geteld werd, en dat is altijd een
   * telfout of een vergeten telling.
   */
  cashInDrawer: number;
};

export function eveningTotals(evening: EveningLike): EveningTotals {
  const counted = cashTotal(evening.cashCount);
  const lostRevenue = evening.consumption
    .filter((row) => row.category !== 'VERKOOP')
    .reduce((total, row) => total + row.quantity * row.item.salesPrice, 0);

  return {
    revenue: evening.cashToSafe + evening.bancontactRevenue,
    lostRevenue,
    counted,
    cashInDrawer: counted - evening.cashToSafe,
  };
}

export type WeekTotals = {
  revenue: number;
  lostRevenue: number;
  cash: number;
  bancontact: number;
  /** Aantal avonden waarvan de kassa geteld is. */
  countedEvenings: number;
};

export function weekTotals(evenings: EveningLike[]): WeekTotals {
  return evenings.reduce<WeekTotals>(
    (total, evening) => {
      const one = eveningTotals(evening);
      return {
        revenue: total.revenue + one.revenue,
        lostRevenue: total.lostRevenue + one.lostRevenue,
        cash: total.cash + evening.cashToSafe,
        bancontact: total.bancontact + evening.bancontactRevenue,
        countedEvenings: total.countedEvenings + (evening.cashCount ? 1 : 0),
      };
    },
    { revenue: 0, lostRevenue: 0, cash: 0, bancontact: 0, countedEvenings: 0 },
  );
}

export type StockCountLike = {
  beginOpslag: number;
  levering: number;
  naarPost: number;
  naarFrigo: number;
  eindOpslag: number;
  beginTelling: number;
  eindTelling: number;
};

export type StockRowTotals = {
  /** Stuks die door de toog gegaan zijn: wat er stond plus bijgevuld, min wat er overblijft. */
  sold: number;
  /**
   * Wat de opslag zegt dat er zou moeten staan, min wat er geteld is. Nul is
   * goed. Niet-nul betekent dat er iets niet geboekt is: een levering, een
   * transfer naar een andere post, of een telfout.
   */
  storageDelta: number;
};

export function stockRowTotals(count: StockCountLike): StockRowTotals {
  return {
    sold: count.beginTelling + count.naarFrigo - count.eindTelling,
    storageDelta:
      count.beginOpslag + count.levering - count.naarFrigo - count.naarPost - count.eindOpslag,
  };
}

/**
 * Wat de stocktelling zegt dat de week had moeten opbrengen: verkochte stuks
 * maal de verkoopprijs. Zonder telling is dit `null` in plaats van 0; "we weten
 * het niet" en "er is niets verkocht" mogen niet hetzelfde tonen.
 */
export function theoreticalRevenue(
  counts: (StockCountLike & { item: { salesPrice: number } })[],
): number | null {
  const filled = counts.filter((count) => count.beginTelling > 0 || count.eindTelling > 0 || count.naarFrigo > 0);
  if (filled.length === 0) return null;
  return filled.reduce((total, count) => total + stockRowTotals(count).sold * count.item.salesPrice, 0);
}
