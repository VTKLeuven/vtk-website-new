import { describe, expect, it } from "vitest";
import {
  CENTER_FOCUS,
  clampFocusAxis,
  focusPosition,
  readImageFocus,
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
