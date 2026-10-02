import "server-only";

import path from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { prisma } from "@vtk/db";
import { getObjectBuffer, newStorageKey, putObject } from "@vtk/storage";
import { getMediaContent, type MediaPublication } from "./media-content";

/**
 * De kaft van een Bakske of Ir.Reëel: bladzijde 1 van de pdf als JPEG, gemaakt
 * op de server.
 *
 * Eerst gebeurde dit in de browser van wie uploadde, met een knop voor oudere
 * edities. Dat liet het nummer dat vóór die knop bestond zonder kaft staan tot
 * iemand eraan dacht, en de knop faalde stil zodra de pdf niet op te halen was.
 * Nu maakt de server ze: bij het uploaden, en voor een editie zonder kaft zodra
 * het nieuws haar toont (`ensureMagazineCover`, na het antwoord).
 *
 * pdf.js tekent in Node op `@napi-rs/canvas`, een optionele dependency van
 * pdfjs-dist die in de lockfile staat voor elk platform, ook Alpine (musl).
 * Beide staan in `serverExternalPackages`: pdf.js laadt zijn worker en canvas
 * zelf uit node_modules, en dat overleeft de bundler niet.
 */

const COVER_WIDTH = 900;
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

export async function renderPdfCover(data: Uint8Array): Promise<Buffer> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data,
    standardFontDataUrl: standardFontDir(),
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
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
 * Zet `coverKey` op één editie. De lijst wordt vlak ervoor opnieuw gelezen en
 * enkel die ene editie verandert, zodat een beheerder die intussen iets
 * aanpaste, dat niet kwijtraakt.
 */
async function setCoverKey(id: string, coverKey: string): Promise<boolean> {
  const { publications } = await getMediaContent();
  if (!publications.some((p) => p.id === id)) return false;
  const next = publications.map((p) => (p.id === id ? { ...p, coverKey } : p));
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
    if (!(await setCoverKey(id, key))) return null;
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
