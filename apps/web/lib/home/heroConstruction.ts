/**
 * De constructietekening van het VTK-logo, uit `VTK technisch.ai`: de logovorm,
 * 23 lijnen en 2 cirkels, ongewijzigd overgenomen in de coordinaten van die pagina
 * (535 x 359, y naar beneden). Niets hiervan is overgetrokken of verzonnen; hoort
 * het logo te veranderen, leid dit dan opnieuw af uit het bronbestand.
 *
 * De volgorde is die waarin ze zich tekenen: horizontaal, verticaal, diagonaal,
 * en de cirkels het laatst. `line` is de naam van een lijn waarop een bestemming
 * staat in de opstelling "Op de lijnuiteinden".
 */
export const CONSTRUCTION_LOGO_D =
  "M142.44 259.99L142.44 194.08L187.03 159.7L187.03 194.08L267.29 131.04L267.29 159.7L282.16 159.7L282.16 194.08L267.29 194.08C270.26 202.68 273.24 208.41 282.16 208.41C288.1 208.41 294.04 208.41 297.02 205.54L297.02 153.96L335.67 122.45L335.67 179.75C343.09 175.63 346.69 169.95 347.55 159.7L386.2 159.7C386.2 162.56 386.41 165.54 385.64 168.75C383.64 177.35 378.77 187.32 372.82 195.92L386.11 206.83L386.2 259.99L347.55 231.33C326.69 249.04 305.94 259.99 282.16 259.99C261.35 259.99 234.59 248.53 219.73 228.47L187.03 259.99Z";

export type ConstructionLine = { d: string; line?: "kalender" | "midden" | "basis" | "cursusdienst" };

export const CONSTRUCTION_LINES: ConstructionLine[] = [
  { d: "M90.25 259.99L464 259.99", line: "basis" },
  { d: "M402.33 159L109.67 158.83", line: "midden" },
  { d: "M142.44 278L142.44 74.81", line: "kalender" },
  { d: "M187.03 184.64L187 74.81" },
  { d: "M187.03 278.17L187.03 259.99" },
  { d: "M282.16 74.81L282.16 277.69" },
  { d: "M187 125.83L187.03 124.33" },
  { d: "M297.02 74.81L297.5 277.69" },
  { d: "M335.43 74.81L335.91 277.69" },
  { d: "M385.98 73.33L386.46 276.21", line: "cursusdienst" },
  { d: "M267.56 76.79L268.04 279.67" },
  { d: "M185.18 161.52L38.75 272.25" },
  { d: "M154.92 184.44L245.63 114.63" },
  { d: "M148.25 224.17L93.7 266.69" },
  { d: "M194.73 252.56L167.83 278.17" },
  { d: "M344.5 115.33L282.16 166" },
  { d: "M335.67 134.41L352.94 120.5" },
  { d: "M282.16 177.5L297.02 165.53L335.67 134.41" },
  { d: "M282.16 182L406.5 275.17" },
  { d: "M372.82 195.92L475.25 276.21" },
  { d: "M401.22 218.35L267.56 112.33" },
  { d: "M297.5 130.33L313.33 142.67" },
  { d: "M160.25 276.21L277.75 171" },
  { d: "M348.5 154.98C348.5 175.7 332.15 192.5 311.99 192.5C291.83 192.5 275.48 175.7 275.48 154.98C275.48 134.26 291.83 117.47 311.99 117.47C332.15 117.47 348.5 134.26 348.5 154.98Z" },
  { d: "M376.94 159C376.94 209.88 335.71 251.12 284.82 251.12C233.93 251.12 192.7 209.88 192.7 159C192.7 108.12 233.93 66.87 284.82 66.87C335.71 66.87 376.94 108.12 376.94 159Z" },
];
