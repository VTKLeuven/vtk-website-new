/**
 * Een vrije tekst opdelen in stukken tekst en de adressen die erin staan.
 *
 * Bestaat voor één ding: de **lading** van een rit. Logistiek plakt daar de link
 * naar de materiaallijst in, en een chauffeur die onderweg wil weten wat er mee
 * moet, heeft niets aan een url die hij moet overtypen. Dezelfde behandeling
 * geldt voor de nota's: ook daar belandt af en toe een link.
 *
 * Bewust geen markdown en geen html: dit is een invoerveld waar iemand snel iets
 * in tikt, en de enige structuur die er ooit in zit, is een adres. Een parser
 * die meer kan, kan ook meer stukmaken.
 *
 * Enkel `http(s)://` en een pad op deze site (`/beheer/...`). Een kale
 * `www.iets.be` blijft tekst: er is geen manier om te weten of "3 bakken vs.be"
 * een adres bevat, en een verkeerd geraden link is erger dan geen link.
 */
export type TextChunk =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string; href: string; internal: boolean };

/**
 * Leestekens die aan het eind van een zin tegen een url plakken. Een punt of een
 * sluithaakje hoort bij de zin en niet bij het adres; zonder deze stap opent
 * "zie https://x.be/lijst." een url met een punt erachter.
 */
const TRAILING = /[.,;:!?)\]}'"»]+$/;

const PATTERN = /(https?:\/\/[^\s<>]+|(?:^|(?<=\s))\/[A-Za-z0-9][^\s<>]*)/g;

export function linkify(text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let last = 0;
  for (const match of text.matchAll(PATTERN)) {
    const start = match.index ?? 0;
    let value = match[0];
    const trimmed = value.replace(TRAILING, '');
    // Een adres van één teken ("/") is geen link maar een schuine streep.
    if (trimmed.length < 2) continue;
    value = trimmed;
    if (start > last) chunks.push({ kind: 'text', value: text.slice(last, start) });
    chunks.push({ kind: 'link', value, href: value, internal: value.startsWith('/') });
    last = start + value.length;
  }
  if (last < text.length) chunks.push({ kind: 'text', value: text.slice(last) });
  return chunks;
}

export function hasLink(text: string): boolean {
  return linkify(text).some((chunk) => chunk.kind === 'link');
}

/**
 * Wat een link is, in een paar woorden, voor het knopje dat `LinkedText` er
 * van maakt.
 *
 * In de lading staat zo goed als altijd de link naar een Google Sheet met de
 * materiaallijst. Voluit is dat honderd tekens `docs.google.com/spreadsheets/d/…`
 * die op een telefoon drie regels vullen en niets zeggen: wat je wil weten, is
 * dat het de sheet is, en dat je er met één tik in zit. Het adres zelf staat nog
 * in de tooltip.
 *
 * Herkent enkel wat aan het adres te zien is. De titel van de sheet kennen we
 * niet zonder hem op te halen, en dat doen we hier niet.
 */
export type LinkKind = 'sheet' | 'doc' | 'slides' | 'form' | 'drive' | 'request' | 'page' | 'web';

export function describeLink(href: string, locale: 'nl' | 'en' = 'nl'): { kind: LinkKind; label: string } {
  const en = locale === 'en';
  if (href.startsWith('/')) {
    // De materiaallijst van een aanvraag (`materialListNote`).
    if (/^\/beheer\/aanvragen\/[^/?#]+/.test(href)) return { kind: 'request', label: en ? 'Request' : 'Aanvraag' };
    return { kind: 'page', label: href };
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: 'web', label: href };
  }
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname;
  if (host === 'docs.google.com' || host === 'sheets.google.com') {
    if (host === 'sheets.google.com' || path.startsWith('/spreadsheets')) return { kind: 'sheet', label: 'Google Sheet' };
    if (path.startsWith('/document')) return { kind: 'doc', label: 'Google Doc' };
    if (path.startsWith('/presentation')) return { kind: 'slides', label: 'Google Slides' };
    if (path.startsWith('/forms')) return { kind: 'form', label: 'Google Form' };
  }
  if (host === 'forms.gle') return { kind: 'form', label: 'Google Form' };
  if (host === 'drive.google.com') return { kind: 'drive', label: 'Google Drive' };
  return { kind: 'web', label: host };
}
