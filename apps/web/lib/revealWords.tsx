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
