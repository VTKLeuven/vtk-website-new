/*
 * De namen in de BO-map ontleden: de jaarmap ("2026 - 2027 Tortubois"), de
 * vergaderingen ("BO 5 - 20/09", "Schriftelijke goedkeuring") en de bestanden
 * ("26-27_Budget_Theokot_Frigo").
 *
 * De afspraak voor een bestandsnaam is `<jaar>_<Budget|Resultaat>_<post>_<activiteit>`,
 * maar in de praktijk wijkt een deel af, en dat mag: niemand moet een bestand
 * hernoemen om in dit overzicht te verschijnen. Wat we tegenkwamen:
 *
 * - `budget` in kleine letters, en `.xlsx` (soms met een spatie ervoor) achteraan;
 * - een dubbelpunt in plaats van een underscore (`Sport: VTKlimmen`);
 * - de post vóór het soort (`26-27_Cultuur_Budget_VTK-Reis_Vluchten`);
 * - helemaal geen soort (`26-27_Development_ECC`), dan beslist de map;
 * - spaties in de activiteit (`Pirates of the fakbar`).
 *
 * Alles hier is puur, zodat de herkenning getest kan worden zonder Drive.
 */

export type BoKind = "BUDGET" | "RESULT";

/**
 * Een naam als sleutel: kleine letters, zonder accenten, enkel letters en
 * cijfers. "Familie- en vriendencantus" en "Familie en Vriendencantus" worden
 * hetzelfde, en dat is precies wat het koppelen van een budget aan zijn
 * resultaat nodig heeft.
 */
export function normalizeKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// ---------------------------------------------------------------------------
// Bestanden
// ---------------------------------------------------------------------------

export type ParsedDocumentName = {
  /** Werkingsjaar uit het voorvoegsel: "26-27" is 2026. Null zonder voorvoegsel. */
  year: number | null;
  /** Wat de naam zegt; null wanneer ze het niet zegt. */
  kind: BoKind | null;
  /** De post zoals ze in de naam staat. */
  post: string | null;
  /** Al de rest, leesbaar gemaakt: de activiteit. */
  activity: string | null;
};

const EXTENSION = /\.(xlsx|xlsm|xls|ods|csv|pdf|docx?)\s*$/i;

/**
 * Het jaar vooraan, in elke schrijfwijze die we tegenkwamen: "26-27", "26_27",
 * "2627", "26 27" en "2026-2027". Het tweede getal moet het jaar na het eerste
 * zijn, zodat "2026/09/07" (een datum) er niet als jaar doorglipt.
 */
const YEAR_PREFIX = /^(?:20)?(\d{2})\s*[-_./ ]?\s*(?:20)?(\d{2})(?=[\s_:-]|$)/;

/** Een datum vooraan ("2026/09/07 Eetstand ..."): geen post, geen activiteit. */
const DATE_PREFIX = /^(?:\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})(?=[\s_:-]|$)[\s_:-]*/;

function kindOf(segment: string): BoKind | null {
  const key = normalizeKey(segment);
  if (key === "budget" || key === "budgetten") return "BUDGET";
  if (key === "resultaat" || key === "resultaten") return "RESULT";
  return null;
}

/** "Budget Cultuur+Onthaal" (een spatie waar een underscore hoorde): het soort en de rest. */
function leadingKind(segment: string): { kind: BoKind; rest: string } | null {
  const match = /^(budgetten|budget|resultaten|resultaat)[\s-]+(.+)$/i.exec(segment);
  if (!match) return null;
  return { kind: kindOf(match[1])!, rest: match[2].trim() };
}

export function parseDocumentName(raw: string): ParsedDocumentName {
  let rest = raw.trim().replace(EXTENSION, "").trim();

  let year: number | null = null;
  const prefix = YEAR_PREFIX.exec(rest);
  if (prefix && (Number(prefix[1]) + 1) % 100 === Number(prefix[2])) {
    year = 2000 + Number(prefix[1]);
    rest = rest.slice(prefix[0].length);
  } else {
    rest = rest.replace(DATE_PREFIX, "");
  }

  let segments = rest
    .split(/[_:]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  // Zonder één underscore is het een naam met spaties ("Budget Sport VTKlimmen").
  if (segments.length === 1) segments = segments[0].split(/\s+/);

  // Het soort staat vooraan, of na de post. Verder zoeken niet: "Budget" als
  // woord in een activiteit is geen soort. Wel het laatste woord: "Eetstand
  // Wiskundeweek Begroting" is een budget.
  let kind: BoKind | null = null;
  for (let i = 0; i < Math.min(2, segments.length); i += 1) {
    const found = kindOf(segments[i]);
    if (found) {
      kind = found;
      segments = [...segments.slice(0, i), ...segments.slice(i + 1)];
      break;
    }
    const lead = leadingKind(segments[i]);
    if (lead) {
      kind = lead.kind;
      segments = [...segments.slice(0, i), lead.rest, ...segments.slice(i + 1)];
      break;
    }
  }
  if (!kind && segments.length > 0) {
    const last = normalizeKey(segments.at(-1)!);
    if (kindOf(segments.at(-1)!) || last === "begroting") {
      kind = last === "begroting" ? "BUDGET" : kindOf(segments.at(-1)!);
      segments = segments.slice(0, -1);
    }
  }

  const post = segments[0] ?? null;
  const activity = segments.slice(1).join(" ").replace(/\s+/g, " ").trim() || null;
  return { year, kind, post, activity };
}

/** "Budgetten" en "Resultaten", ook als "Budgetten Statix" of "resultaat". */
export function folderKind(name: string): BoKind | null {
  const key = normalizeKey(name);
  if (key.startsWith("budget")) return "BUDGET";
  if (key.startsWith("resulta")) return "RESULT";
  return null;
}

// ---------------------------------------------------------------------------
// Mappen
// ---------------------------------------------------------------------------

/** "2026 - 2027 Tortubois" of "26-27" -> 2026. */
export function parseYearFolderName(name: string): number | null {
  const long = /^\s*(20\d{2})\s*[-–]\s*(20\d{2})(?!\d)/.exec(name);
  if (long && Number(long[1]) + 1 === Number(long[2])) return Number(long[1]);
  const short = /^\s*(\d{2})\s*[-–]\s*(\d{2})(?!\d)/.exec(name);
  if (short && (Number(short[1]) + 1) % 100 === Number(short[2])) return 2000 + Number(short[1]);
  return null;
}

export function isBoRootFolderName(name: string): boolean {
  return normalizeKey(name).startsWith("bestuursorgaan");
}

export type MeetingKind = "MEETING" | "BUDGET_MEETING" | "WRITTEN";

export type ParsedMeetingName = {
  kind: MeetingKind;
  number: number | null;
  /** Dag en maand uit de naam; het jaar staat er nooit in. */
  day: number | null;
  month: number | null;
};

/**
 * "BO 5 - 20/09", "BO 4 - Begrotings BO - 11/09", "Schriftelijke goedkeuring".
 * Null voor elke andere map (sjablonen, een archief): die slaat de scan over.
 */
export function parseMeetingFolderName(name: string): ParsedMeetingName | null {
  const trimmed = name.trim();
  const date = /(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\s*[/.]\s*\d{2,4})?\s*$/.exec(trimmed);
  const day = date ? Number(date[1]) : null;
  const month = date ? Number(date[2]) : null;
  const validDate = day !== null && month !== null && day >= 1 && day <= 31 && month >= 1 && month <= 12;

  if (/schriftelijk/i.test(trimmed)) {
    return { kind: "WRITTEN", number: null, day: validDate ? day : null, month: validDate ? month : null };
  }
  const bo = /^BO\s*(\d+)\b(.*)$/i.exec(trimmed);
  if (!bo) return null;
  return {
    kind: /begroting/i.test(bo[2]) ? "BUDGET_MEETING" : "MEETING",
    number: Number(bo[1]),
    day: validDate ? day : null,
    month: validDate ? month : null,
  };
}

/**
 * Het jaar bij "20/09". De jaarmap zegt welk werkingsjaar, maar niet of 25/06
 * juni van het begin- of het eindjaar is: BO 0 valt eind juni, nog vóór het
 * werkingsjaar begint, en een BO in juni aan het eind van het jaar ook. Wat
 * het verschil maakt, is wanneer de map aangemaakt werd: dat is een paar dagen
 * ervoor, nooit een jaar.
 */
export function resolveMeetingDate(
  day: number,
  month: number,
  workingYear: number,
  folderCreatedAt: Date | null,
): Date {
  const candidates = [workingYear, workingYear + 1].map((year) => new Date(Date.UTC(year, month - 1, day)));
  if (!folderCreatedAt) return month >= 6 ? candidates[0] : candidates[1];
  const distance = (d: Date) => Math.abs(d.getTime() - folderCreatedAt.getTime());
  return distance(candidates[0]) <= distance(candidates[1]) ? candidates[0] : candidates[1];
}

/**
 * De id uit wat iemand in het veld plakt: een link naar een map of een gedeelde
 * drive, een link naar een bestand, of de id zelf.
 */
export function parseDriveId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromUrl =
    /\/(?:folders|drives|d)\/([A-Za-z0-9_-]{10,})/.exec(text)?.[1] ??
    /[?&]id=([A-Za-z0-9_-]{10,})/.exec(text)?.[1];
  if (fromUrl) return fromUrl;
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : null;
}
