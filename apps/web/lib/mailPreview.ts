/**
 * Hulpstukken voor het mailvoorbeeld in het beheer (`components/admin/MailPreview`).
 *
 * Puur, zodat de vulling van een sjabloon te testen is zonder een render.
 */

/**
 * De `{plaatshouders}` die na het invullen nog in de tekst staan.
 *
 * Die verdwijnen niet, en dat is met opzet: een tikfout in een sjabloon
 * (`{contactpersoom}`) hoort zichtbaar te zijn voor de mail vertrekt, terwijl
 * een leeggemaakte plek onopgemerkt naar een professor of een huurder gaat. Het
 * voorbeeld noemt ze daarom apart op.
 */
export function remainingPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{([a-z]+)\}/gi)) {
    found.add(match[1]!.toLowerCase());
  }
  return Array.from(found).sort();
}

/**
 * Vult `{plaatshouders}` in met de meegegeven waarden. Een onbekende naam blijft
 * staan; zie hierboven.
 *
 * Dezelfde regel als de renderers van de sjablonen zelf, hier apart zodat een
 * voorbeeld ook te maken is voor teksten die nog niet bewaard zijn.
 */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z]+)\}/gi, (match, name: string) => {
    const value = values[name.toLowerCase()];
    return value === undefined ? match : value;
  });
}
