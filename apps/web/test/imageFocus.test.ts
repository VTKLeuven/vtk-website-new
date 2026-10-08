import { describe, expect, it } from "vitest";
import {
  CENTER_FOCUS,
  clampFocusAxis,
  clampImageZoom,
  cropBox,
  fitZoom,
  focusPosition,
  mobileCropFrom,
  photoCropStyle,
  readImageFocus,
  readMobileCrop,
  toImageFocus,
} from "@/lib/imageFocus";

describe("clampFocusAxis", () => {
  it("laat een waarde binnen [0, 1] staan", () => {
    expect(clampFocusAxis(0)).toBe(0);
    expect(clampFocusAxis(0.23)).toBe(0.23);
    expect(clampFocusAxis(1)).toBe(1);
  });

  it("knipt buiten het bereik af in plaats van te weigeren", () => {
    expect(clampFocusAxis(-3)).toBe(0);
    expect(clampFocusAxis(42)).toBe(1);
  });

  it("leest de tekstvorm uit een formulierveld", () => {
    expect(clampFocusAxis("0.75")).toBe(0.75);
  });

  // De val waar dit veld op stukging: Number(null) en Number("") zijn 0, dus
  // zonder deze uitzondering betekent "geen waarde" stil de linkerbovenhoek.
  it("valt bij een ontbrekende waarde terug op het midden en niet op 0", () => {
    expect(clampFocusAxis(null)).toBe(0.5);
    expect(clampFocusAxis(undefined)).toBe(0.5);
    expect(clampFocusAxis("")).toBe(0.5);
    expect(clampFocusAxis("linksboven")).toBe(0.5);
    expect(clampFocusAxis(Number.NaN)).toBe(0.5);
  });
});

describe("toImageFocus", () => {
  it("maakt een punt van twee losse assen", () => {
    expect(toImageFocus(0.2, "0.9")).toEqual({ x: 0.2, y: 0.9 });
  });

  it("geeft het midden voor een rij die de kolommen nog niet heeft", () => {
    expect(toImageFocus(null, null)).toEqual(CENTER_FOCUS);
  });
});

describe("focusPosition", () => {
  it("schrijft het punt als object-position", () => {
    expect(focusPosition({ x: 0.5, y: 0.5 })).toBe("50.0% 50.0%");
    expect(focusPosition({ x: 0, y: 0.125 })).toBe("0.0% 12.5%");
  });

  it("valt zonder punt terug op het midden", () => {
    expect(focusPosition(null)).toBe("50.0% 50.0%");
    expect(focusPosition(undefined)).toBe("50.0% 50.0%");
  });
});

describe("readImageFocus", () => {
  it("leest wat het veld meestuurt", () => {
    const form = new FormData();
    form.set("imageFocusX", "0.1000");
    form.set("imageFocusY", "0.8000");
    expect(readImageFocus(form)).toEqual({ x: 0.1, y: 0.8 });
  });

  // Een formulier zonder dit veld (of een geknoeide waarde) is geen invoerfout:
  // de uitsnede is een verfijning, dus het antwoord is gewoon het midden.
  it("geeft het midden wanneer het veld ontbreekt", () => {
    expect(readImageFocus(new FormData())).toEqual(CENTER_FOCUS);
  });
});

describe("de uitsnede op een telefoon", () => {
  it("bestaat niet zonder punt: dan volgt de telefoon de gewone uitsnede", () => {
    expect(mobileCropFrom(null, null, null, null)).toBeNull();
    expect(mobileCropFrom(null, 0.4, 0.8, 1.78)).toBeNull();
  });

  it("neemt het punt, de zoom en de verhouding over; zonder zoom is dat 1", () => {
    expect(mobileCropFrom(0.3, 0.6, 0.85, 1.7778)).toEqual({ focus: { x: 0.3, y: 0.6 }, zoom: 0.85, ratio: 1.7778 });
    expect(mobileCropFrom(0.3, 0.6, null, null)).toEqual({ focus: { x: 0.3, y: 0.6 }, zoom: 1, ratio: null });
  });

  it("knipt de zoom op het bereik", () => {
    expect(clampImageZoom(0.1)).toBe(0.5);
    expect(clampImageZoom(9)).toBe(2);
    expect(clampImageZoom("")).toBe(1);
    expect(clampImageZoom("abc")).toBe(1);
  });

  it("leest het veld enkel wanneer het aan staat", () => {
    const form = new FormData();
    form.set("imageFocusMobileX", "0.2000");
    form.set("imageFocusMobileY", "0.7000");
    form.set("imageFocusMobileZoom", "0.80");
    form.set("imageFocusMobileRatio", "1.7778");
    expect(readMobileCrop(form)).toBeNull();
    form.set("imageFocusMobileOn", "true");
    expect(readMobileCrop(form)).toEqual({ focus: { x: 0.2, y: 0.7 }, zoom: 0.8, ratio: 1.7778 });
  });

  it("zet de telefoonwaarden enkel als variabelen wanneer er een eigen uitsnede is", () => {
    expect(photoCropStyle({ x: 0.5, y: 0.25 }, null)).toEqual({ "--photo-focus": "50.0% 25.0%" });
    expect(photoCropStyle(null, { focus: { x: 0.1, y: 0.5 }, zoom: 0.75, ratio: 1.6 })).toEqual({
      "--photo-focus": "50.0% 50.0%",
      "--photo-focus-m": "10.0% 50.0%",
      "--photo-fx-m": "0.1000",
      "--photo-fy-m": "0.5000",
      "--photo-zoom-m": "0.75",
      "--photo-ratio": "1.6000",
    });
  });

  // Zonder verhouding valt er niet uit te zoomen: dan enkel het eigen punt.
  it("zet zonder verhouding enkel het punt voor de telefoon", () => {
    expect(photoCropStyle(null, { focus: { x: 0.1, y: 0.5 }, zoom: 0.75, ratio: null })).toEqual({
      "--photo-focus": "50.0% 50.0%",
      "--photo-focus-m": "10.0% 50.0%",
    });
  });

  // De fout waar de eerste versie op stukging: een liggende affiche in een
  // 4/3-kader, uitgezoomd, moet links en rechts méér tonen, niet enkel kleiner.
  it("toont uitgezoomd meer van de randen in plaats van de uitsnede te verkleinen", () => {
    const filled = cropBox(16 / 9, 4 / 3, { x: 0.5, y: 0.5 }, 1);
    expect(filled.height).toBeCloseTo(100);
    expect(filled.width).toBeCloseTo(133.33, 1);
    expect(filled.left).toBeCloseTo(-16.67, 1);

    const whole = cropBox(16 / 9, 4 / 3, { x: 0.5, y: 0.5 }, 0.75);
    expect(whole.width).toBeCloseTo(100);
    expect(whole.left).toBeCloseTo(0);
    expect(whole.height).toBeCloseTo(75);
    expect(whole.top).toBeCloseTo(12.5);
  });

  it("houdt het gekozen punt op zijn plaats bij het zoomen", () => {
    const crop = cropBox(16 / 9, 4 / 3, { x: 0.2, y: 0.5 }, 1.5);
    // Het punt op 20% van de foto staat op 20% van het kader.
    expect(crop.left + 0.2 * crop.width).toBeCloseTo(20);
  });

  // De knop "Hele foto in beeld": een liggende 16/9-affiche in het 4/3-kader
  // van een telefoon past op 75%.
  it("rekent uit welke zoom de hele foto in het kader laat passen", () => {
    expect(fitZoom(16 / 9, 4 / 3)).toBe(0.75);
    expect(fitZoom(4 / 3, 4 / 3)).toBe(1);
    expect(fitZoom(3 / 4, 4 / 3)).toBe(0.56);
    expect(fitZoom(0, 4 / 3)).toBe(1);
  });
});
