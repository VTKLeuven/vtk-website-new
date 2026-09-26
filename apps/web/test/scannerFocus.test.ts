import { describe, expect, it } from "vitest";
import { shouldRedirectToScanner } from "@/lib/scannerFocus";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});
const button = { tagName: "BUTTON" };

describe("de kaartlezer aan de afhaalbalie", () => {
  it("stuurt een gewoon teken naar het scanveld, ook vanaf een knop", () => {
    expect(shouldRedirectToScanner(key("r"), button, false)).toBe(true);
    expect(shouldRedirectToScanner(key("7"), button, false)).toBe(true);
    // De kaartlezer tikt "serial;cardAppId".
    expect(shouldRedirectToScanner(key(";"), button, false)).toBe(true);
    expect(shouldRedirectToScanner(key("r"), null, false)).toBe(true);
  });

  it("laat sneltoetsen met rust", () => {
    expect(shouldRedirectToScanner(key("c", { metaKey: true }), button, false)).toBe(false);
    expect(shouldRedirectToScanner(key("f", { ctrlKey: true }), button, false)).toBe(false);
    expect(shouldRedirectToScanner(key("a", { altKey: true }), button, false)).toBe(false);
  });

  it("laat Tab, Enter, spatie en de pijltjes bij het element met de focus", () => {
    for (const special of ["Tab", "Enter", "Escape", "ArrowDown", "Backspace", " "]) {
      expect(shouldRedirectToScanner(key(special), button, false)).toBe(false);
    }
  });

  it("neemt geen invoer over uit een ander tekstveld of een open venster", () => {
    expect(shouldRedirectToScanner(key("a"), { tagName: "INPUT" }, false)).toBe(false);
    expect(shouldRedirectToScanner(key("a"), { tagName: "TEXTAREA" }, false)).toBe(false);
    expect(shouldRedirectToScanner(key("a"), { tagName: "DIV", isContentEditable: true }, false)).toBe(false);
    expect(shouldRedirectToScanner(key("a"), button, true)).toBe(false);
  });
});
