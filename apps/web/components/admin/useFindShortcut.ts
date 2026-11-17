"use client";

import { type RefObject, useEffect } from "react";

/**
 * Cmd+F (Ctrl+F op Windows en Linux) zet de cursor in het zoekveld van een
 * beheerlijst in plaats van de zoekbalk van de browser te openen.
 *
 * De zoekbalk van de browser vindt enkel wat er op het scherm staat, en in een
 * lijst met dichtgeklapte categorieën of 100 rijen per keer is dat het
 * grootste deel niet. Staat de cursor al in het veld, dan krijg je de zoekbalk
 * van de browser alsnog: een tweede Cmd+F blijft dus wat je gewoon bent.
 */
export function useFindShortcut(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      const input = ref.current;
      if (!input || document.activeElement === input || input.offsetParent === null) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}
