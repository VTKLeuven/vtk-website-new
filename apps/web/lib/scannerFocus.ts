/**
 * Moet deze toets naar het scanveld van de afhaalbalie, ook al staat de focus
 * ergens anders?
 *
 * De kaartlezer en de QR-lezer gedragen zich als een toetsenbord: ze tikken wat
 * ze lezen en sluiten af met Enter. Dat komt enkel in het veld terecht als dat
 * veld de focus heeft, en na een klik op "Opgehaald" of "Bonnetjes gebruiken"
 * staat die op die knop. De volgende student scande dan in het niets. Daarom
 * vangt de balie elke gewone toets op de pagina op en zet de focus in het
 * scanveld voor de browser het teken verwerkt; het teken zelf landt daar dan
 * vanzelf.
 *
 * Wat er níét heen gaat:
 * - toetsen met Ctrl, Cmd of Alt: dat zijn sneltoetsen (kopiëren, zoeken, een
 *   tabblad sluiten), geen invoer;
 * - speciale toetsen (Tab, Escape, pijltjes, Enter, spatie): die horen bij
 *   het element dat de focus heeft, anders kan je niet meer met het
 *   toetsenbord door de pagina;
 * - alles terwijl je al in een ander tekstveld typt, of terwijl er een
 *   bevestigingsvenster open staat: daar is de invoer voor dat venster bedoeld.
 */
export function shouldRedirectToScanner(
  key: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  target: { tagName: string; isContentEditable?: boolean } | null,
  dialogOpen: boolean,
): boolean {
  if (dialogOpen) return false;
  if (key.ctrlKey || key.metaKey || key.altKey) return false;
  // Een afdrukbaar teken heeft een `key` van precies één teken ("a", "7", ";",
  // "."); speciale toetsen heten "Enter", "Tab", "ArrowUp" enzovoort.
  if (key.key.length !== 1) return false;
  // De spatie drukt een knop in; een kaart of pas bevat er geen.
  if (key.key === " ") return false;
  if (target) {
    const tag = target.tagName.toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
    if (target.isContentEditable) return false;
  }
  return true;
}
