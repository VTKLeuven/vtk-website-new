/**
 * De bevestigingsmail van Colruyt Collect&Go uitlezen.
 *
 * Wie voor de kring boodschappen bestelt, krijgt een mail met alle producten,
 * aantallen en prijzen en een reservatienummer. Die lijst met de hand overtypen
 * in de flesserke-voorraad is een half uur per bestelling; dit leest ze uit.
 *
 * Bewust zonder HTML-dep: de mail heeft een text/plain-deel, en de HTML-variant
 * wordt hier eerst plat gemaakt. Dat betekent wel dat dezelfde gegevens er in
 * twee vormen kunnen aankomen (de cellen "1 stuk(s)" en "€ 2,78/st" staan in de
 * platte tekst aan elkaar geplakt, maar kunnen na het strippen van tags op twee
 * regels landen), dus elke regel-herkenning hieronder aanvaardt beide.
 *
 * Puur en zonder database, zodat de hele mail in een unit test kan.
 */

export type CollectEnGoUnitValue = 'PIECE' | 'WEIGHT';

export type ParsedCollectEnGoLine = {
  sortIndex: number;
  /** De categoriekop van Colruyt ("Diepvries"), niet onze eigen categorie. */
  category: string | null;
  productName: string;
  /** Vrije notitie van de besteller; in de praktijk de acti ("Acti - livecantus"). */
  note: string | null;
  unit: CollectEnGoUnitValue;
  /** Aantal stuks; bij een gewichtslijn een naar boven afgerond werkgetal. */
  quantity: number;
  /** De hoeveelheid zoals ze in de mail stond ("1,0 Kg"), enkel bij WEIGHT. */
  quantityText: string | null;
  unitPriceCents: number | null;
  /** Waarop de eenheidsprijs slaat: "st" of "Kg". */
  unitPriceBasis: string | null;
  /** Wat er voor deze lijn aangerekend wordt, dus ná een eventuele promo. */
  totalPriceCents: number | null;
  /** Leeggoed op deze lijn ("leeggoed € 22,50"), positief. */
  depositCents: number | null;
  /** Promo op deze lijn, negatief bewaard zoals de mail ze schrijft. */
  lineDiscountCents: number | null;
};

export type ParsedCollectEnGoOrder = {
  reservationNumber: string;
  customerName: string | null;
  pickupPoint: string | null;
  pickupFrom: Date | null;
  pickupUntil: Date | null;
  orderedAt: Date | null;
  subtotalCents: number | null;
  discountCents: number | null;
  serviceCostCents: number | null;
  totalCents: number | null;
  lines: ParsedCollectEnGoLine[];
  /** De platte tekst waaruit dit gelezen is; gaat mee naar de database. */
  rawText: string;
  /**
   * Wat er niet klopte zonder dat het parsen faalde (lijnentotaal ≠ subtotaal,
   * ontbrekend afhaalmoment, ...). Het importscherm toont ze: stil verkeerd
   * inlezen is erger dan een waarschuwing te veel.
   */
  warnings: string[];
};

export type ParseResult =
  | { ok: true; order: ParsedCollectEnGoOrder }
  | { ok: false; error: string };

// Collect&Go schrijft "mrt.", sommige mails "maa."; allebei is maart.
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mrt: 3, maa: 3, apr: 4, mei: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  euro: '€', eacute: 'é', egrave: 'è', euml: 'ë', iuml: 'ï',
  ccedil: 'ç', agrave: 'à', ouml: 'ö', uuml: 'ü', hellip: '…',
  ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", middot: '·',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * HTML naar platte tekst, zonder dep. Blok-elementen worden een regeleinde;
 * `<style>`/`<script>`/comments verdwijnen volledig, want anders belandt de CSS
 * van de mail tussen de producten.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|li|h[1-6]|table|tbody|section|span)>/gi, '\n')
    .replace(/<(p|div|tr|li|h[1-6]|table)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return normalizeText(decodeEntities(text));
}

/** Losse spaties, harde spaties en lege regels opruimen zonder regels te verliezen. */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ ​ \t]/g, ' ').replace(/ {2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * "€ 2,78", "€762,89", "€ -16,29" of "€ 1.234,56" naar centen.
 *
 * De punt is bij Colruyt een duizendtalscheiding en de komma de decimaal; een
 * punt met precies twee cijfers erachter en geen komma in de buurt behandelen we
 * toch als decimaal, want sommige mails schrijven "€ 2.78".
 */
export function parseEuroCents(input: string): number | null {
  const match = input.match(/-?\s*€\s*-?\s*[\d.,]+|-?\s*[\d.,]+\s*€/);
  if (!match) return null;
  const raw = match[0];
  const negative = /-/.test(raw);
  const digits = raw.replace(/[^\d.,]/g, '');
  if (!digits) return null;
  let normalized: string;
  if (digits.includes(',')) {
    normalized = digits.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{2}$/.test(digits)) {
    normalized = digits.replace(/\.(?=\d{3})/g, '');
  } else {
    normalized = digits.replace(/\./g, '');
  }
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) * (negative ? -1 : 1);
}

/** "10 jul. 2026" en "09-jul.-2026" (met optioneel "12:55:47") naar wall-clock delen. */
function parseDutchDate(input: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const match = input.match(
    /(\d{1,2})[-\s]*([a-z]{3,5})\.?[-\s]*(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i
  );
  if (!match) return null;
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return {
    year: Number.parseInt(match[3], 10),
    month,
    day: Number.parseInt(match[1], 10),
    hour: match[4] ? Number.parseInt(match[4], 10) : 0,
    minute: match[5] ? Number.parseInt(match[5], 10) : 0,
  };
}

/**
 * Een Belgische wall-clock (zoals ze in de mail staat) naar een echt moment.
 * Zelfde truc als `parseBrusselsDateTime` in lib/uitleen.ts: de offset opzoeken
 * via `Intl` in plaats van hem te veronderstellen.
 */
function brusselsDate(parts: { year: number; month: number; day: number; hour: number; minute: number }): Date | null {
  const pad = (value: number) => value.toString().padStart(2, '0');
  const iso = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
  const asUtc = new Date(`${iso}:00.000Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const local = Object.fromEntries(formatter.formatToParts(asUtc).map((part) => [part.type, part.value]));
  const localAsUtc = new Date(
    `${local.year}-${local.month}-${local.day}T${local.hour === '24' ? '00' : local.hour}:${local.minute}:00.000Z`
  );
  return new Date(asUtc.getTime() - (localAsUtc.getTime() - asUtc.getTime()));
}

const AMOUNT_ONLY = /^-?\s*€\s*-?\s*[\d.,]+$/;
const CATEGORY_COUNT = /^(\d+)\s+product(en)?$/i;
// "8 stuk(s)€ 1,10/st" en "12 stuk(s)€ 2,69/Kg"; de prijs mag ontbreken (HTML).
const PIECE_LINE = /^(\d+)\s*stuk\(s\)\s*(?:€\s*([\d.,]+)\s*\/\s*(st|kg))?\s*$/i;
// "1,0 Kg€ 1,49/Kg": een gewicht in plaats van een stuksaantal.
const WEIGHT_LINE = /^([\d.,]+)\s*(kg|g)\s*(?:€\s*([\d.,]+)\s*\/\s*(st|kg))?\s*$/i;
const UNIT_PRICE_LINE = /^€\s*([\d.,]+)\s*\/\s*(st|kg)\s*$/i;

/** Regels die uit de opmaak van de mail komen en niets over de bestelling zeggen. */
function isNoise(line: string): boolean {
  if (!line) return true;
  if (/^a .*icon/i.test(line)) return true; // alt-teksten: "a clock icon"
  if (/^(bekijk|klik|ontdek)\b/i.test(line)) return true;
  return false;
}

export function parseCollectEnGoMail(input: { text?: string | null; html?: string | null }): ParseResult {
  const fromText = input.text ? normalizeText(input.text) : '';
  const fromHtml = !fromText && input.html ? htmlToText(input.html) : '';
  const rawText = fromText || fromHtml;
  if (!rawText.trim()) return { ok: false, error: 'De mail is leeg.' };

  const reservationMatch = rawText.match(/reservatienummer\s*:?\s*(\d{5,})/i);
  if (!reservationMatch) {
    return { ok: false, error: 'Geen reservatienummer gevonden; is dit een Collect&Go-bevestiging?' };
  }
  const reservationNumber = reservationMatch[1];

  const lines = rawText.split('\n').map((line) => line.trim());
  const warnings: string[] = [];

  const customerName = rawText.match(/^\s*Naam\s*:\s*(.+)$/im)?.[1].trim() || null;

  // Afhaalpunt: de regels onder de kop tot de eerste lege regel.
  let pickupPoint: string | null = null;
  const pickupIndex = lines.findIndex((line) => /^Afhaalpunt$/i.test(line));
  if (pickupIndex >= 0) {
    const parts: string[] = [];
    // Stopt op een lege regel, maar ook op de volgende kop: uit de HTML komt het
    // adres soms zonder lege regel ertussen.
    for (let i = pickupIndex + 1; i < lines.length && parts.length < 6; i += 1) {
      const line = lines[i];
      if (!line) break;
      if (/^(Afhaalmoment|Jouw gegevens|Je reserveerde|Dit zetten we)/i.test(line)) break;
      if (isNoise(line)) continue;
      parts.push(line);
    }
    pickupPoint = parts.length > 0 ? parts.join(', ') : null;
  }

  // Afhaalmoment: "vrijdag - 10 jul. 2026" + "tussen 16:00 en 17:00".
  let pickupFrom: Date | null = null;
  let pickupUntil: Date | null = null;
  const momentIndex = lines.findIndex((line) => /^Afhaalmoment$/i.test(line));
  if (momentIndex >= 0) {
    const window = lines.slice(momentIndex + 1, momentIndex + 6).filter((line) => !isNoise(line));
    const date = window.map(parseDutchDate).find((parsed) => parsed !== null) ?? null;
    const times = window.join(' ').match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
    if (date) {
      pickupFrom = brusselsDate({
        ...date,
        hour: times ? Number.parseInt(times[1], 10) : 0,
        minute: times ? Number.parseInt(times[2], 10) : 0,
      });
      if (times) {
        pickupUntil = brusselsDate({
          ...date,
          hour: Number.parseInt(times[3], 10),
          minute: Number.parseInt(times[4], 10),
        });
      }
    }
  }
  if (!pickupFrom) warnings.push('Geen afhaalmoment gevonden in de mail.');

  const orderedParts = parseDutchDate(
    rawText.match(/boodschappen op\s+([^,]+),/i)?.[1] ?? ''
  );
  const orderedAt = orderedParts ? brusselsDate(orderedParts) : null;

  const start = lines.findIndex((line) => /Dit zetten we voor je klaar/i.test(line));
  const endCandidate = lines.findIndex((line, index) => index > start && /^Subtotaal\s*:?/i.test(line));
  const end = endCandidate === -1 ? lines.length : endCandidate;
  if (start === -1) return { ok: false, error: 'Geen productlijst gevonden in de mail.' };

  const parsed: ParsedCollectEnGoLine[] = [];
  let category: string | null = null;
  let buffer: string[] = [];

  const flush = (
    quantity: number,
    unit: CollectEnGoUnitValue,
    quantityText: string | null,
    unitPriceCents: number | null,
    unitPriceBasis: string | null
  ): void => {
    const parts = buffer.filter((line) => line && !isNoise(line));
    buffer = [];
    if (parts.length === 0) return;
    let name = parts[0];
    let totalPriceCents: number | null = null;
    const rest: string[] = [];
    for (const line of parts.slice(1)) {
      if (AMOUNT_ONLY.test(line) && totalPriceCents === null) {
        totalPriceCents = parseEuroCents(line);
        continue;
      }
      rest.push(line);
    }
    // Na het strippen van HTML kunnen naam en prijs op één regel staan.
    if (totalPriceCents === null) {
      const inline = name.match(/^(.*?)\s*(€\s*[\d.,]+)$/);
      if (inline) {
        name = inline[1].trim();
        totalPriceCents = parseEuroCents(inline[2]);
      }
    }
    parsed.push({
      sortIndex: parsed.length,
      category,
      productName: name,
      note: rest.length > 0 ? rest.join(' ') : null,
      unit,
      quantity,
      quantityText,
      unitPriceCents,
      unitPriceBasis,
      totalPriceCents,
      depositCents: null,
      lineDiscountCents: null,
    });
  };

  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i];
    if (!line || isNoise(line)) continue;

    // "leeggoed € 22,50 - € 16,29" hoort bij het product erboven.
    if (/^leeggoed\b/i.test(line)) {
      const previous = parsed[parsed.length - 1];
      if (previous) {
        const amounts = line.match(/-?\s*€\s*-?\s*[\d.,]+/g) ?? [];
        previous.depositCents = amounts[0] ? parseEuroCents(amounts[0]) : null;
        previous.lineDiscountCents = amounts[1] ? parseEuroCents(amounts[1]) : null;
      }
      continue;
    }

    // Een categoriekop is de regel vóór "6 producten".
    if (CATEGORY_COUNT.test(line)) {
      const heading = buffer.filter(Boolean).pop();
      if (heading) category = heading;
      buffer = [];
      continue;
    }

    const piece = line.match(PIECE_LINE);
    const weight = piece ? null : line.match(WEIGHT_LINE);
    if (piece || weight) {
      let priceRaw = piece ? piece[2] : weight![3];
      let basis = piece ? piece[3] : weight![4];
      // In de HTML-variant staat de eenheidsprijs op de volgende regel.
      if (!priceRaw) {
        const next = lines[i + 1]?.match(UNIT_PRICE_LINE);
        if (next) {
          priceRaw = next[1];
          basis = next[2];
          i += 1;
        }
      }
      const unitPriceCents = priceRaw ? parseEuroCents(`€ ${priceRaw}`) : null;
      const unitPriceBasis = basis ? (basis.toLowerCase() === 'st' ? 'st' : 'Kg') : null;
      if (piece) {
        flush(Number.parseInt(piece[1], 10), 'PIECE', null, unitPriceCents, unitPriceBasis);
      } else {
        const amount = Number.parseFloat(weight![1].replace(',', '.'));
        const grams = weight![2].toLowerCase() === 'g';
        const kilos = grams ? amount / 1000 : amount;
        flush(
          Math.max(1, Math.ceil(Number.isFinite(kilos) ? kilos : 1)),
          'WEIGHT',
          `${weight![1]} ${grams ? 'g' : 'Kg'}`,
          unitPriceCents,
          unitPriceBasis
        );
      }
      continue;
    }

    buffer.push(line);
  }

  const footer = lines.slice(end).join('\n');
  const amountAfter = (label: RegExp): number | null => {
    const index = lines.findIndex((line, position) => position >= end - 1 && label.test(line));
    if (index === -1) return null;
    const own = parseEuroCents(lines[index]);
    if (own !== null) return own;
    for (let i = index + 1; i < Math.min(index + 4, lines.length); i += 1) {
      const value = parseEuroCents(lines[i]);
      if (value !== null) return value;
    }
    return null;
  };

  const subtotalCents = end === lines.length ? null : amountAfter(/^Subtotaal\s*:?/i);
  const discountCents = footer ? amountAfter(/^Totaal\s+kortingen\s*:?/i) : null;
  const serviceCostCents = footer ? amountAfter(/^Servicekost\s*:?/i) : null;
  const totalCents = footer ? amountAfter(/^Totaal\s*:?\s*(€|$)/i) : null;

  if (parsed.length === 0) return { ok: false, error: 'Geen producten gevonden in de mail.' };

  if (subtotalCents !== null) {
    // De prijs per lijn is de prijs ná promo, terwijl het subtotaal de korting nog
    // niet aftrekt (die staat apart als "Totaal kortingen"). De korting telt hier
    // dus mee, anders waarschuwt elke bestelling met een promo. Kortingen worden
    // negatief bewaard, zoals de mail ze schrijft, dus ze gaan er weer af.
    const sum = parsed.reduce(
      (total, line) => total + (line.totalPriceCents ?? 0) - (line.lineDiscountCents ?? 0),
      0
    );
    if (Math.abs(sum - subtotalCents) > 1) {
      warnings.push(
        `De som van de lijnen (${(sum / 100).toFixed(2)}) verschilt van het subtotaal in de mail (${(subtotalCents / 100).toFixed(2)}). Kijk de lijst na voor je importeert.`
      );
    }
  }

  return {
    ok: true,
    order: {
      reservationNumber,
      customerName,
      pickupPoint,
      pickupFrom,
      pickupUntil,
      orderedAt,
      subtotalCents,
      discountCents,
      serviceCostCents,
      totalCents,
      lines: parsed,
      rawText,
      warnings,
    },
  };
}
