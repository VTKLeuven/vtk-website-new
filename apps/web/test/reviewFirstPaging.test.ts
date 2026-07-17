import { describe, expect, it } from "vitest";
import { reviewFirstWindow } from "@/lib/reviewFirstPaging";

/**
 * Referentiemodel: de oude implementatie haalde ALLE pagina's op, zette de na te
 * kijken vooraan en sneed er een pagina uit. Dat gedrag moet identiek blijven,
 * nu we per blok query'en. De tests vergelijken de twee tegen elkaar.
 */
function naive(reviewTotal: number, restTotal: number, offset: number, pageSize: number) {
  const review = Array.from({ length: reviewTotal }, (_, i) => `review-${i}`);
  const rest = Array.from({ length: restTotal }, (_, i) => `rest-${i}`);
  return [...review, ...rest].slice(offset, offset + pageSize);
}

/** Wat de echte pagina doet: twee queries (skip/take per blok) en samenvoegen. */
function stitched(reviewTotal: number, restTotal: number, offset: number, pageSize: number) {
  const review = Array.from({ length: reviewTotal }, (_, i) => `review-${i}`);
  const rest = Array.from({ length: restTotal }, (_, i) => `rest-${i}`);
  const w = reviewFirstWindow(offset, pageSize, reviewTotal);
  return [
    ...(w.reviewTake > 0 ? review.slice(w.reviewSkip, w.reviewSkip + w.reviewTake) : []),
    ...(w.restTake > 0 ? rest.slice(w.restSkip, w.restSkip + w.restTake) : []),
  ];
}

describe("reviewFirstWindow", () => {
  it("zet de na te kijken pagina's vooraan op pagina 1", () => {
    const w = reviewFirstWindow(0, 25, 3);
    expect(w).toEqual({ reviewSkip: 0, reviewTake: 3, restSkip: 0, restTake: 22 });
  });

  it("vraagt niets uit het review-blok zodra dat voorbij is", () => {
    // 3 na te kijken, pagina 2 (offset 25): alles komt uit de rest.
    const w = reviewFirstWindow(25, 25, 3);
    expect(w.reviewTake).toBe(0);
    expect(w).toMatchObject({ restSkip: 22, restTake: 25 });
  });

  it("splitst een pagina die precies over de grens valt", () => {
    // 30 na te kijken: pagina 2 begint op 25, dus 5 review + 20 rest.
    const w = reviewFirstWindow(25, 25, 30);
    expect(w).toEqual({ reviewSkip: 25, reviewTake: 5, restSkip: 0, restTake: 20 });
  });

  it("vult een volledige pagina uit het review-blok als dat groot genoeg is", () => {
    const w = reviewFirstWindow(0, 25, 100);
    expect(w).toEqual({ reviewSkip: 0, reviewTake: 25, restSkip: 0, restTake: 0 });
  });

  it("zonder na te kijken pagina's is het gewoon de rest", () => {
    const w = reviewFirstWindow(50, 25, 0);
    expect(w).toEqual({ reviewSkip: 0, reviewTake: 0, restSkip: 50, restTake: 25 });
  });

  // De echte garantie: over elke combinatie exact dezelfde rijen als het oude
  // "alles ophalen en sorteren"-gedrag, inclusief alle randgevallen.
  it("levert dezelfde rijen als alles-ophalen-en-snijden, voor elke grens", () => {
    const sizes = [1, 3, 25];
    for (const pageSize of sizes) {
      for (let reviewTotal = 0; reviewTotal <= 12; reviewTotal += 1) {
        for (let restTotal = 0; restTotal <= 12; restTotal += 1) {
          const total = reviewTotal + restTotal;
          const pages = Math.max(1, Math.ceil(total / pageSize));
          for (let page = 1; page <= pages; page += 1) {
            const offset = (page - 1) * pageSize;
            expect(
              stitched(reviewTotal, restTotal, offset, pageSize),
              `size=${pageSize} review=${reviewTotal} rest=${restTotal} page=${page}`,
            ).toEqual(naive(reviewTotal, restTotal, offset, pageSize));
          }
        }
      }
    }
  });

  it("vraagt nooit meer dan één pagina aan rijen op", () => {
    for (let reviewTotal = 0; reviewTotal <= 30; reviewTotal += 1) {
      for (let offset = 0; offset <= 60; offset += 5) {
        const w = reviewFirstWindow(offset, 25, reviewTotal);
        expect(w.reviewTake + w.restTake).toBe(25);
        expect(w.reviewTake).toBeGreaterThanOrEqual(0);
        expect(w.restTake).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
