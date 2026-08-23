/**
 * Adressen voorstellen: `voornaam.achternaam@vtk.be` en de kiesploegvarianten.
 *
 * Bewust sjablonen en geen vaste vorm in code: de conventie verschilt nu al per
 * ploeg (`kiesploeg2027.voornaam.achternaam`, `2027.g5`, `marketing.2027`), en
 * de volgende ploeg doet het weer anders. De sjablonen staan op de kiesploeg-rij.
 *
 * Geen `server-only`: pure functies, getest in `test/googleAddresses.test.ts`.
 */

/** De placeholders die een sjabloon mag gebruiken. */
export type AddressVars = {
  code?: string;
  voornaam?: string;
  achternaam?: string;
  post?: string;
};

/**
 * Een naamdeel zoals het in een adres past: kleine letters, accenten weg, en
 * alles wat geen letter of cijfer is eruit. "Van den Broeck" wordt dus
 * `vandenbroeck` en "Noël D'Hondt" wordt `noeldhondt`.
 *
 * Dat is een keuze, geen natuurwet: `van.den.broeck` was even verdedigbaar. Ze
 * staat hier één keer zodat elk adres dezelfde vorm krijgt, en het
 * voorbeeldscherm toont het resultaat voor er iets naar Google gaat.
 */
export function normaliseNamePart(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Vult een sjabloon in. Onbekende placeholders blijven staan, zichtbaar fout. */
export function renderTemplate(template: string, vars: AddressVars): string {
  return template.replace(/\{(code|voornaam|achternaam|post)\}/g, (match, key: string) => {
    const value = vars[key as keyof AddressVars];
    if (value === undefined) return match;
    return normaliseNamePart(value);
  });
}

/** Het volledige adres voor een sjabloon, zonder rekening te houden met botsingen. */
export function renderAddress(template: string, vars: AddressVars, domain: string): string {
  const local = renderTemplate(template, vars).replace(/^[.]+|[.]+$/g, "").replace(/\.{2,}/g, ".");
  return `${local}@${domain.toLowerCase()}`;
}

/**
 * Hetzelfde, maar wijkt uit wanneer het adres al bezet is: `jan.peeters2`,
 * `jan.peeters3`, ... Naamgenoten zijn zeldzaam maar ze bestaan, en twee mensen
 * op één adres is een probleem dat je pas maanden later merkt.
 *
 * `taken` bevat zowel primaire adressen als aliassen, in kleine letters.
 */
export function proposeAddress(
  template: string,
  vars: AddressVars,
  domain: string,
  taken: ReadonlySet<string>,
): string {
  const base = renderAddress(template, vars, domain);
  if (!taken.has(base)) return base;

  const [local, host] = base.split("@");
  for (let n = 2; n < 50; n += 1) {
    const candidate = `${local}${n}@${host}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Vijftig naamgenoten is geen realistisch geval; dan is er iets anders mis.
  throw new Error(`Geen vrij adres gevonden voor ${base}`);
}

/**
 * Een wachtwoord om één keer door te geven. Het account staat op
 * `changePasswordAtNextLogin`, dus dit is een doorgeefwachtwoord en geen
 * wachtwoord om mee te leven.
 *
 * Geen tekens die op elkaar lijken (l/1/I, O/0): dit wordt overgetypt.
 */
export function generatePassword(random: () => number = Math.random): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    out += alphabet[Math.floor(random() * alphabet.length)];
  }
  return out;
}
