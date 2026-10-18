import type { CSSProperties, ReactNode } from "react";

/**
 * Tekst in losse woorden, elk met hun volgnummer in `--i`, zodat ze na elkaar
 * kunnen binnenkomen (vtk-motion.css). De spaties blijven gewone tekst tussen
 * de spans: zo breekt de regel normaal af en kopieer je nog steeds
 * "Kanweek 2026" en niet "Kanweek2026".
 *
 * Zonder animatie (geen ondersteuning, of `prefers-reduced-motion`) zijn het
 * gewone spans en verandert er niets aan de tekst.
 */
export function revealWords(text: string): ReactNode[] {
  let index = 0;
  return text.split(/(\s+)/).map((part, i) => {
    if (!part || /^\s+$/.test(part)) return part;
    const style = { "--i": index++ } as CSSProperties;
    return (
      <span key={i} className="vtk-word" style={style}>
        {part}
      </span>
    );
  });
}

/**
 * Zelfde idee per letter, voor een kort stuk tekst dat bij het scrollen een
 * golfje door zijn letters krijgt.
 *
 * Twee dingen zitten hier bewust in:
 *
 * - **Een lengtegrens.** Een hele vetgedrukte zin zou honderden spans en
 *   evenveel animaties opleveren, terwijl het effect enkel leesbaar is op een
 *   paar woorden. Langer dan dit blijft gewoon tekst.
 * - **De letters gaan verborgen voor een screenreader, met de hele tekst
 *   ernaast.** Elementgrenzen midden in een woord laten sommige screenreaders
 *   de letters los uitspreken; de `sr-only`-kopie houdt "praesidium" één woord.
 * - **De letters van een woord staan samen in een eigen span.** Elke letter is
 *   een `inline-block` zodra ze animeert, en naast een `inline-block` mag de
 *   regel altijd breken. Los naast elkaar brak een vetgedrukt woord dus midden
 *   in ("al / gemene richti / ng" in een smalle tabelkolom); het woord-span
 *   (vtk-motion.css) houdt het bij elkaar.
 */
export const LETTER_LIMIT = 60;

export function revealLetters(text: string): ReactNode {
  let index = 0;
  const words = text.split(/(\s+)/).map((part, w) => {
    if (!part || /^\s+$/.test(part)) return part;
    return (
      <span key={w} className="vtk-letters-word">
        {[...part].map((char, i) => {
          const style = { "--i": index++ } as CSSProperties;
          return (
            <span key={i} className="vtk-letter" style={style}>
              {char}
            </span>
          );
        })}
      </span>
    );
  });
  return (
    <>
      <span aria-hidden="true">{words}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
