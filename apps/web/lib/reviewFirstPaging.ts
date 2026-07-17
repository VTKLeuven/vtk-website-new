/**
 * Paginatie over twee blokken die samen één lijst vormen: eerst de pagina's die
 * dit werkingsjaar nog nagekeken moeten worden, daarna de rest.
 *
 * Waarom dit bestaat: "na te kijken" is een BEREKENDE toestand (het
 * jaarlijks-vinkje plus "niet bewerkt sinds de 15-juli-cutover"), geen kolom.
 * Prisma kan daar niet op ORDER BY'en, en het in ruwe SQL doen zou de
 * toegangs- en zoekfilters dupliceren. Daarom halen we per blok apart op en
 * schuift het venster van de paginatie er gewoon doorheen.
 *
 * Beide blokken zijn intern alfabetisch gesorteerd; deze functie zegt enkel
 * hoeveel rijen uit welk blok op de gevraagde pagina horen.
 */
export type ReviewFirstWindow = {
  reviewSkip: number;
  reviewTake: number;
  restSkip: number;
  restTake: number;
};

/**
 * @param offset  Aantal rijen voor deze pagina, over de hele lijst: (page-1)*size.
 * @param pageSize Rijen per pagina.
 * @param reviewTotal Totaal aantal "na te kijken" rijen (het eerste blok).
 */
export function reviewFirstWindow(
  offset: number,
  pageSize: number,
  reviewTotal: number,
): ReviewFirstWindow {
  const reviewTake = Math.max(0, Math.min(pageSize, reviewTotal - offset));
  return {
    reviewSkip: Math.min(offset, reviewTotal),
    reviewTake,
    restSkip: Math.max(0, offset - reviewTotal),
    restTake: pageSize - reviewTake,
  };
}
