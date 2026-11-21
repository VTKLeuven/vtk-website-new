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
 * van maakt. **Er staat nooit een lang adres op het scherm**, wat er ook achter
 * de link zit; het volledige adres staat enkel in de tooltip.
 *
 * In de lading staat bijna altijd een materiaallijst: een Google Sheet, een
 * Google Doc, een pdf, soms iets anders. Voluit is dat honderd tekens die op een
 * telefoon drie regels vullen en niets zeggen. Wat je wil weten, is wat voor
 * ding het is, en dat je er met één tik in zit. In volgorde:
 *
 * 1. Een bestand van Google (Sheet, Doc, Slides, Form, Drive) bij zijn naam.
 * 2. Een bestand met een extensie (`.pdf`, `.xlsx`, ...) bij zijn bestandsnaam
 *    als die kort is, anders bij zijn soort ("PDF").
 * 3. OneDrive, SharePoint en Dropbox bij hun naam: hun adressen zijn een
 *    onleesbare sleutel.
 * 4. De rest bij de site, zonder `www.` en zonder lange subdomeinen.
 *
 * Herkent enkel wat aan het adres te zien is. De titel van een document kennen
 * we niet zonder het op te halen, en dat doen we hier niet.
 */
export type LinkKind = 'sheet' | 'doc' | 'slides' | 'form' | 'drive' | 'file' | 'request' | 'page' | 'web';

/** Langer dan dit is een bestandsnaam geen label meer maar een tweede adres. */
const MAX_NAME = 28;

const FILE_TYPES: Record<string, { nl: string; en: string }> = {
  pdf: { nl: 'PDF', en: 'PDF' },
  xlsx: { nl: 'Excel', en: 'Excel' },
  xls: { nl: 'Excel', en: 'Excel' },
  csv: { nl: 'CSV', en: 'CSV' },
  ods: { nl: 'Rekenblad', en: 'Spreadsheet' },
  docx: { nl: 'Word', en: 'Word' },
  doc: { nl: 'Word', en: 'Word' },
  odt: { nl: 'Document', en: 'Document' },
  pptx: { nl: 'PowerPoint', en: 'PowerPoint' },
  txt: { nl: 'Tekst', en: 'Text' },
  png: { nl: 'Afbeelding', en: 'Image' },
  jpg: { nl: 'Afbeelding', en: 'Image' },
  jpeg: { nl: 'Afbeelding', en: 'Image' },
  heic: { nl: 'Afbeelding', en: 'Image' },
  zip: { nl: 'Zip', en: 'Zip' },
};

function shortHost(hostname: string): string {
  const host = hostname.replace(/^www\./, '');
  if (host.length <= 24) return host;
  // `kuleuven-my.sharepoint.com` wordt `sharepoint.com`.
  return host.split('.').slice(-2).join('.');
}

export function describeLink(href: string, locale: 'nl' | 'en' = 'nl'): { kind: LinkKind; label: string } {
  const en = locale === 'en';
  if (href.startsWith('/')) {
    // De materiaallijst van een aanvraag (`materialListNote`).
    if (/^\/beheer\/aanvragen\/[^/?#]+/.test(href)) return { kind: 'request', label: en ? 'Request' : 'Aanvraag' };
    const path = href.split(/[?#]/)[0];
    return { kind: 'page', label: path.length <= MAX_NAME ? path : en ? 'Page on Logistics' : 'Pagina op Logistiek' };
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: 'web', label: 'Link' };
  }
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname;
  if (host === 'docs.google.com' || host === 'sheets.google.com') {
    if (host === 'sheets.google.com' || path.startsWith('/spreadsheets')) return { kind: 'sheet', label: 'Google Sheet' };
    if (path.startsWith('/document')) return { kind: 'doc', label: 'Google Doc' };
    if (path.startsWith('/presentation')) return { kind: 'slides', label: 'Google Slides' };
    if (path.startsWith('/forms')) return { kind: 'form', label: 'Google Form' };
    return { kind: 'drive', label: 'Google Drive' };
  }
  if (host === 'forms.gle') return { kind: 'form', label: 'Google Form' };
  if (host === 'drive.google.com') return { kind: 'drive', label: 'Google Drive' };

  // Een bestand: het laatste stuk van het pad heeft een extensie die we kennen.
  const lastSegment = path.split('/').filter(Boolean).pop() ?? '';
  let fileName = lastSegment;
  try {
    fileName = decodeURIComponent(lastSegment);
  } catch {
    // Een kapotte %-reeks: dan het stuk zoals het er staat.
  }
  const extension = /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]?.toLowerCase();
  const fileType = extension ? FILE_TYPES[extension] : undefined;
  if (fileType) {
    return { kind: 'file', label: fileName.length <= MAX_NAME ? fileName : en ? fileType.en : fileType.nl };
  }

  if (host === 'sharepoint.com' || host.endsWith('.sharepoint.com') || host === '1drv.ms' || host === 'onedrive.live.com') {
    return { kind: 'drive', label: 'OneDrive' };
  }
  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) return { kind: 'drive', label: 'Dropbox' };
  return { kind: 'web', label: shortHost(url.hostname) };
}
