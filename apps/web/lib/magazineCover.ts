import "server-only";

import path from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { prisma } from "@vtk/db";
import { deleteObject, getObjectBuffer, newStorageKey, putObject } from "@vtk/storage";
import { getMediaContent, type MediaPublication } from "./media-content";

/**
 * De kaft en de bladzijden van een Bakske of Ir.Reëel, als JPEG, gemaakt op de
 * server.
 *
 * **De kaft** is bladzijde 1. Eerst gebeurde dit in de browser van wie uploadde,
 * met een knop voor oudere edities. Dat liet het nummer dat vóór die knop
 * bestond zonder kaft staan tot iemand eraan dacht, en de knop faalde stil
 * zodra de pdf niet op te halen was. Nu maakt de server ze: bij het uploaden, en
 * voor een editie zonder kaft zodra het nieuws haar toont
 * (`ensureMagazineCover`, na het antwoord).
 *
 * **De bladzijden** (sinds november 2026) zijn dezelfde tekening voor elke
 * bladzijde, breder, voor de lezer in de app. Daarvoor gaf de app de pdf aan de
 * browser, en Chrome op Android toont een pdf niet maar downloadt hem. Ze worden
 * gemaakt na het uploaden (`after`, het opslaan wacht er niet op) en voor de
 * oudere nummers door de onderhoudstaak (`backfillMagazinePages`).
 *
 * pdf.js tekent in Node op `@napi-rs/canvas`, een optionele dependency van
 * pdfjs-dist die in de lockfile staat voor elk platform, ook Alpine (musl).
 * Beide staan in `serverExternalPackages`: pdf.js laadt zijn worker en canvas
 * zelf uit node_modules, en dat overleeft de bundler niet.
 */

const COVER_WIDTH = 900;
/**
 * Breed genoeg dat de tekst na een dubbeltik (2,5 keer) in de app nog scherp is.
 * Een Bakske van acht bladzijden is zo een kleine 2 MB, in een drietal seconden
 * getekend.
 */
const PAGE_WIDTH = 1600;
/** Meer is geen tijdschrift meer; zo'n editie opent in de app als pdf. */
const MAX_PAGES = 120;
const MAX_PDF_BYTES = 40 * 1024 * 1024;
const EXTERNAL_PDF_HOSTS = new Set(["vtk.be", "www.vtk.be"]);

type NodeCanvas = {
  canvas: { toBuffer(mime: "image/png"): Buffer };
  context: CanvasRenderingContext2D;
};

/**
 * De map met de standaardlettertypes van pdf.js, voor een pdf die ze niet
 * insluit. Opgezocht vanaf de werkmap en niet met `require.resolve`: webpack
 * herschrijft `createRequire` in dev tot iets zonder `resolve`. Lokaal staat
 * pdfjs-dist in de node_modules van de monorepo, in de image in /app/node_modules;
 * beide liggen boven apps/web.
 */
function standardFontDir(): string | undefined {
  let dir = process.cwd();
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(dir, "node_modules", "pdfjs-dist", "standard_fonts");
    if (existsSync(candidate)) return candidate + path.sep;
    dir = path.dirname(dir);
  }
  return undefined;
}

async function openPdf(data: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: standardFontDir(),
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
}

type PdfDocument = Awaited<ReturnType<typeof openPdf>>;

/** Eén bladzijde als JPEG van `width` pixels breed. */
async function renderPage(pdf: PdfDocument, pageNumber: number, width: number): Promise<Buffer> {
  const page = await pdf.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const factory = pdf.canvasFactory as {
      create(width: number, height: number): NodeCanvas;
    };
    const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    // Een pdf zonder achtergrond is transparant; zonder wit vlak wordt dat zwart in een JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: context, viewport }).promise;
    return await sharp(canvas.toBuffer("image/png"))
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } finally {
    // Zonder dit houdt pdf.js de fonts en beelden van elke getekende bladzijde
    // vast tot het einde; bij een dik nummer loopt dat op.
    page.cleanup();
  }
}

export async function renderPdfCover(data: Uint8Array): Promise<Buffer> {
  const pdf = await openPdf(data);
  try {
    return await renderPage(pdf, 1, COVER_WIDTH);
  } finally {
    await pdf.destroy();
  }
}

/** Ruimt bewaarde objecten op. Lukt dat niet, dan is dat geen fout om te melden. */
async function removeObjects(keys: readonly string[]): Promise<void> {
  await Promise.allSettled(keys.map((key) => deleteObject(key)));
}

/**
 * Tekent elke bladzijde en bewaart ze meteen, één per één: twintig bladzijden
 * tegelijk in het geheugen houden dient nergens toe. Lukt er één niet, dan gaat
 * wat al bewaard was weer weg; een nummer met een gat erin is erger dan de pdf.
 */
export async function storePdfPages(data: Uint8Array): Promise<string[]> {
  const pdf = await openPdf(data);
  const keys: string[] = [];
  try {
    if (pdf.numPages > MAX_PAGES) {
      throw new Error(`${pdf.numPages} bladzijden, meer dan ${MAX_PAGES}`);
    }
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const key = newStorageKey("publications/pages", "page.jpg");
      await putObject(key, await renderPage(pdf, pageNumber, PAGE_WIDTH), "image/jpeg");
      keys.push(key);
    }
    return keys;
  } catch (error) {
    await removeObjects(keys);
    throw error;
  } finally {
    await pdf.destroy();
  }
}

/** De pdf zelf: uit de eigen opslag, of van vtk.be voor een oude editie met een link. */
async function readPublicationPdf(publication: MediaPublication): Promise<Uint8Array | null> {
  if (publication.storageKey) return new Uint8Array(await getObjectBuffer(publication.storageKey));
  if (!publication.pdfUrl) return null;
  const url = new URL(publication.pdfUrl);
  if (url.protocol !== "https:" || !EXTERNAL_PDF_HOSTS.has(url.hostname)) return null;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) return null;
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_PDF_BYTES) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > MAX_PDF_BYTES ? null : bytes;
}

/** Bewaart een kaft in de opslag en geeft haar sleutel terug. */
export async function storeCover(jpeg: Buffer): Promise<string> {
  const key = newStorageKey("publications/covers", "cover.jpg");
  await putObject(key, jpeg, "image/jpeg");
  return key;
}

/**
 * Past één editie aan. De lijst wordt vlak ervoor opnieuw gelezen en enkel die
 * ene editie verandert, zodat een beheerder die intussen iets aanpaste, dat niet
 * kwijtraakt. `false` wanneer de editie er intussen niet meer is.
 */
async function updatePublication(
  id: string,
  patch: Partial<Pick<MediaPublication, "coverKey" | "pageKeys">>,
): Promise<boolean> {
  const { publications } = await getMediaContent();
  if (!publications.some((p) => p.id === id)) return false;
  const next = publications.map((p) => (p.id === id ? { ...p, ...patch } : p));
  await prisma.setting.upsert({
    where: { key: "media.magazines" },
    update: { value: { publications: next } },
    create: { key: "media.magazines", value: { publications: next } },
  });
  return true;
}

// Eén poging per editie tegelijk, en een mislukte niet bij elke paginaweergave
// opnieuw: een kapotte pdf blijft kapot tot iemand ze vervangt.
const inFlight = new Set<string>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 60 * 60 * 1000;

/**
 * Maakt de kaft van een editie die er nog geen heeft. Stil: lukt het niet, dan
 * blijft het streepjesvlak staan, zoals voorheen.
 */
export async function ensureMagazineCover(
  id: string,
  { force = false }: { force?: boolean } = {},
): Promise<string | null> {
  if (inFlight.has(id)) return null;
  const failed = failedAt.get(id);
  // `force`: een beheerder die op de knop drukt, wacht niet op het uur.
  if (!force && failed && Date.now() - failed < RETRY_AFTER_MS) return null;
  inFlight.add(id);
  try {
    const { publications } = await getMediaContent();
    const publication = publications.find((p) => p.id === id);
    if (!publication || publication.coverKey) return publication?.coverKey ?? null;
    const pdf = await readPublicationPdf(publication);
    if (!pdf) throw new Error("pdf niet beschikbaar");
    const key = await storeCover(await renderPdfCover(pdf));
    if (!(await updatePublication(id, { coverKey: key }))) return null;
    failedAt.delete(id);
    return key;
  } catch (error) {
    failedAt.set(id, Date.now());
    console.error(`[media] kaft voor ${id} niet gemaakt:`, error);
    return null;
  } finally {
    inFlight.delete(id);
  }
}

// Dezelfde regels als bij de kaft, maar apart bijgehouden: een kaft die lukte
// zegt niets over twintig bladzijden, en omgekeerd.
const pagesInFlight = new Set<string>();
const pagesFailedAt = new Map<string, number>();

function pagesRecentlyFailed(id: string): boolean {
  const failed = pagesFailedAt.get(id);
  return failed !== undefined && Date.now() - failed < RETRY_AFTER_MS;
}

/**
 * Maakt de bladzijden van een editie die er nog geen heeft. Stil, zoals de kaft:
 * lukt het niet, dan opent de app die editie gewoon als pdf.
 */
export async function ensureMagazinePages(id: string): Promise<string[] | null> {
  if (pagesInFlight.has(id) || pagesRecentlyFailed(id)) return null;
  pagesInFlight.add(id);
  let stored: string[] = [];
  let saved = false;
  try {
    const { publications } = await getMediaContent();
    const publication = publications.find((p) => p.id === id);
    if (!publication || publication.pageKeys) return publication?.pageKeys ?? null;
    const pdf = await readPublicationPdf(publication);
    if (!pdf) throw new Error("pdf niet beschikbaar");
    stored = await storePdfPages(pdf);
    saved = await updatePublication(id, { pageKeys: stored });
    if (!saved) return null;
    pagesFailedAt.delete(id);
    return stored;
  } catch (error) {
    pagesFailedAt.set(id, Date.now());
    console.error(`[media] bladzijden voor ${id} niet gemaakt:`, error);
    return null;
  } finally {
    // Niet bewaard (de editie is intussen verwijderd, of het opslaan faalde):
    // dan horen de bladzijden nergens bij en gaan ze weer weg.
    if (!saved && stored.length > 0) await removeObjects(stored);
    pagesInFlight.delete(id);
  }
}

/** Hoeveel kaften één ronde van de onderhoudstaak hoogstens maakt. */
const BACKFILL_PER_RUN = 3;

/**
 * Werkt de edities zonder kaft af, een paar per ronde van de onderhoudstaak
 * (`/api/background/maintenance`, elke vijf minuten). Het nieuws maakt de kaft
 * van een nieuw nummer al zelf; dit is voor de oudere nummers op /nieuws en in
 * de rail Tijdschriften, die niet meer in het nieuws staan.
 */
export async function backfillMagazineCovers(): Promise<{ made: number; missing: number }> {
  const { publications } = await getMediaContent();
  const missing = publications.filter((p) => !p.coverKey);
  let made = 0;
  for (const publication of missing.slice(0, BACKFILL_PER_RUN)) {
    if (await ensureMagazineCover(publication.id)) made += 1;
  }
  return { made, missing: missing.length - made };
}

/**
 * Hoeveel edities één ronde in bladzijden omzet. Een nummer is een paar
 * seconden rekenen voor de site, dus weinig per ronde; de nieuwste eerst.
 */
const PAGES_PER_RUN = 2;

/** Op `publishedAt`, nieuwste eerst; een editie zonder datum achteraan. */
function newestFirst(left: MediaPublication, right: MediaPublication): number {
  const a = left.publishedAt ? Date.parse(left.publishedAt) : Number.NaN;
  const b = right.publishedAt ? Date.parse(right.publishedAt) : Number.NaN;
  if (Number.isFinite(a) && Number.isFinite(b)) return b - a;
  if (Number.isFinite(a)) return -1;
  if (Number.isFinite(b)) return 1;
  return 0;
}

/**
 * Werkt de edities zonder bladzijden af. Een editie die net mislukte, wordt
 * overgeslagen in plaats van elke ronde opnieuw als eerste gekozen; anders
 * houdt één kapotte pdf alle oudere nummers tegen.
 */
export async function backfillMagazinePages(): Promise<{ made: number; missing: number }> {
  const { publications } = await getMediaContent();
  const missing = publications.filter((p) => !p.pageKeys);
  const due = missing
    .filter((p) => !pagesInFlight.has(p.id) && !pagesRecentlyFailed(p.id))
    .sort(newestFirst);
  let made = 0;
  for (const publication of due.slice(0, PAGES_PER_RUN)) {
    if (await ensureMagazinePages(publication.id)) made += 1;
  }
  return { made, missing: missing.length - made };
}

/**
 * Kaften en bladzijden, voor de onderhoudstaak. Na elkaar en niet naast elkaar:
 * allebei herschrijven ze dezelfde lijst (`updatePublication`), en twee
 * schrijvers tegelijk kunnen elkaars wijziging overschrijven.
 */
export async function backfillMagazines(): Promise<{
  covers: { made: number; missing: number };
  pages: { made: number; missing: number };
}> {
  const covers = await backfillMagazineCovers();
  const pages = await backfillMagazinePages();
  return { covers, pages };
}
