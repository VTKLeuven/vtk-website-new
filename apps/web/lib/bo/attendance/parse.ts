import { decodeXml, readZip, XlsxError } from "@/lib/praesidiumShifts/xlsx";
import { looksLikeName, nameKey } from "@/lib/praesidiumShifts/names";

/*
 * De aanwezigheden uit een verslag van het Bestuursorgaan.
 *
 * Bovenaan elk verslag staat onder de kop "Aanwezigheden" het hele praesidium,
 * één naam per regel, en de secretaris kleurt elke naam: groen is aanwezig,
 * oranje verontschuldigd, rood afwezig. Onder de lijst staat de legende
 * "Aanwezig - Verontschuldigd - Afwezig", in diezelfde drie kleuren.
 *
 * We lezen het verslag als docx: een Google Doc wordt zo geëxporteerd (zie
 * `downloadDocument` in lib/google/client.ts) en een opgeladen Word-bestand is
 * het al, zodat één lezer beide aankan. Zoals bij de rekenbladen volstaan
 * regexen: de XML is machinaal geschreven en heeft een vaste vorm.
 *
 * De kleur is niet altijd precies de kleur van de legende: in BO 4 stond één
 * naam in #ff9900 in plaats van #e69138, in BO 7 één in #93c47d. Daarom telt
 * eerst de legende en daarna de tint (`statusOfColor`). Een naam zonder kleur
 * (zwart, nog niet ingevuld) krijgt geen status en telt nergens mee.
 */

export type AttendanceStatus = "PRESENT" | "EXCUSED" | "ABSENT";

export type MinutesEntry = {
  name: string;
  /** Null: de naam had geen kleur, of een kleur die we niet thuis kunnen brengen. */
  status: AttendanceStatus | null;
  /** `rrggbb` in kleine letters, zoals in het verslag. Null zonder kleur. */
  color: string | null;
};

export type ParsedMinutes = {
  /** De regel onder "VERSLAG": "BO 10 - 25/10/2026 - 21u00 - QDV 00.100". */
  title: string | null;
  entries: MinutesEntry[];
  /** Of de legende onder de lijst gevonden werd. */
  legend: boolean;
};

export type MinutesError = "NOT_DOCX" | "NO_ATTENDANCE";

/** Hoger zetten wanneer de lezer verandert: dan leest de scan elk verslag opnieuw. */
export const MINUTES_VERSION = 1;

/** Zoveel alinea's na de kop zoeken we naar namen; een praesidium is nooit zo groot. */
const MAX_LIST_PARAGRAPHS = 400;

type Run = { text: string; color: string | null };

const DOCX_DOCUMENT = "word/document.xml";

export function minutesFromDocx(buffer: Buffer): ParsedMinutes | { error: MinutesError } {
  let xml: string;
  try {
    const entry = readZip(buffer).get(DOCX_DOCUMENT);
    if (!entry) return { error: "NOT_DOCX" };
    xml = entry().toString("utf8");
  } catch (err) {
    if (err instanceof XlsxError) return { error: "NOT_DOCX" };
    throw err;
  }
  return minutesFromDocumentXml(xml);
}

/** Hetzelfde, vanaf `word/document.xml`. Apart voor de tests. */
export function minutesFromDocumentXml(xml: string): ParsedMinutes | { error: MinutesError } {
  const paragraphs = readParagraphs(xml);
  const texts = paragraphs.map((runs) => runs.map((r) => r.text).join("").replace(/\s+/g, " ").trim());

  const start = texts.findIndex((text) => /^aanwezighe(den|id)\s*:?$/i.test(text));
  if (start < 0) return { error: "NO_ATTENDANCE" };

  const verslag = texts.findIndex((text) => /^verslag$/i.test(text));
  const title =
    verslag >= 0 && verslag < start ? (texts.slice(verslag + 1, start).find((text) => text.length > 0) ?? null) : null;

  const candidates: Run[][] = [];
  let legend: Map<string, AttendanceStatus> | null = null;
  for (let i = start + 1; i < paragraphs.length && i <= start + MAX_LIST_PARAGRAPHS; i += 1) {
    const runs = paragraphs[i];
    const text = texts[i];
    if (!text) continue;
    const found = legendOf(runs, text);
    if (found) {
      legend = found;
      break;
    }
    // Zonder legende stopt de lijst bij de eerste regel zonder kleur die geen
    // naam is: de volgende kop ("Goedkeuren agenda").
    const colored = runs.some((r) => r.color && r.text.trim());
    if (!colored && !looksLikeName(text)) break;
    candidates.push(runs);
  }

  const entries: MinutesEntry[] = [];
  const seen = new Set<string>();
  for (const runs of candidates) {
    for (const piece of splitParagraph(runs)) {
      const name = piece.text.replace(/\s+/g, " ").trim();
      if (!looksLikeName(name)) continue;
      const key = nameKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      entries.push({ name, color: piece.color, status: piece.color ? statusOfColor(piece.color, legend) : null });
    }
  }
  if (entries.length === 0) return { error: "NO_ATTENDANCE" };
  return { title, entries, legend: legend !== null };
}

/**
 * De status van een kleur: eerst zoals de legende van dit verslag het zegt,
 * anders op de tint. Grijs, bijna zwart of bijna wit is geen keuze.
 */
export function statusOfColor(hex: string, legend: ReadonlyMap<string, AttendanceStatus> | null = null): AttendanceStatus | null {
  const color = hex.toLowerCase();
  const fromLegend = legend?.get(color);
  if (fromLegend) return fromLegend;
  const hsl = toHsl(color);
  if (!hsl) return null;
  const { h, s, l } = hsl;
  if (s < 0.25 || l < 0.12 || l > 0.92) return null;
  if (h < 18 || h >= 330) return "ABSENT";
  if (h < 55) return "EXCUSED";
  if (h >= 70 && h < 170) return "PRESENT";
  return null;
}

function toHsl(hex: string): { h: number; s: number; l: number } | null {
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/**
 * De legende: één regel met "Aanwezig", "Verontschuldigd" (of "Verwittigd") en
 * "Afwezig", elk woord in zijn kleur. Geeft de kleuren terug, of null als dit
 * de legende niet is.
 */
function legendOf(runs: Run[], text: string): Map<string, AttendanceStatus> | null {
  const lower = text.toLowerCase();
  if (!/\baanwezig\b/.test(lower) || !/\bafwezig\b/.test(lower) || !/\b(verontschuldigd|verwittigd)\b/.test(lower)) {
    return null;
  }
  if (text.length > 80) return null;
  const map = new Map<string, AttendanceStatus>();
  for (const run of runs) {
    if (!run.color) continue;
    const word = run.text.toLowerCase();
    const status: AttendanceStatus | null = /\baanwezig\b/.test(word)
      ? "PRESENT"
      : /\b(verontschuldigd|verwittigd)\b/.test(word)
        ? "EXCUSED"
        : /\bafwezig\b/.test(word)
          ? "ABSENT"
          : null;
    if (status && !map.has(run.color)) map.set(run.color, status);
  }
  return map;
}

/**
 * Meestal is een alinea één naam. Staan er meer op één regel (met een komma,
 * een tab of een regeleinde ertussen), dan krijgt elk stuk de kleur van de
 * tekens waarin het staat; een naam die over twee runs met dezelfde kleur
 * loopt ("Jarne " en "Plessers"), blijft één naam.
 */
function splitParagraph(runs: Run[]): { text: string; color: string | null }[] {
  const out: { text: string; color: string | null }[] = [];
  let text = "";
  let color: string | null = null;
  const flush = () => {
    if (text.trim()) out.push({ text, color });
    text = "";
    color = null;
  };
  for (const run of runs) {
    const parts = run.text.split(/[\n\t,;]/);
    parts.forEach((part, index) => {
      if (index > 0) flush();
      if (!part) return;
      // Een spatie draagt geen kleur: "Jarne" groen, " " zwart, "Plessers" groen.
      if (part.trim() && run.color && !color) color = run.color;
      text += part;
    });
  }
  flush();
  return out;
}

/** Alle alinea's, elk als een lijst van runs met hun tekst en tekstkleur. */
function readParagraphs(xml: string): Run[][] {
  const body = xml
    // Wat in de revisies geschrapt werd, staat er niet meer.
    .replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "")
    // Voetnoten en opmerkingen staan in een eigen deel; een tekstvak hier wel,
    // maar dat is nooit de lijst.
    .replace(/<w:txbxContent\b[^>]*>[\s\S]*?<\/w:txbxContent>/g, "");
  const out: Run[][] = [];
  for (const match of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    // De opmaak van de alinea zelf (ook een kleur, die van het alineateken)
    // zegt niets over de naam.
    const inner = (match[1] ?? "").replace(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/g, "");
    const runs: Run[] = [];
    for (const run of inner.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const content = run[1];
      const props = /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/.exec(content)?.[1] ?? "";
      const value = /<w:color\b[^>]*\bw:val="([0-9A-Fa-f]{6})"/.exec(props)?.[1]?.toLowerCase() ?? null;
      let text = "";
      for (const piece of content.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/g)) {
        if (piece[1] !== undefined) text += decodeXml(piece[1]);
        else if (piece[0].startsWith("<w:tab")) text += "\t";
        else text += "\n";
      }
      if (!text) continue;
      // Zwart is geen kleur: een naam die nog niet ingekleurd is.
      const color = value && value !== "000000" ? value : null;
      runs.push({ text, color });
    }
    out.push(runs);
  }
  return out;
}
