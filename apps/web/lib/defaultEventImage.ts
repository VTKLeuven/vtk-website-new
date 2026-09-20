import { prisma } from "@vtk/db";
import { publicUrl } from "@/lib/storage";

/**
 * De standaardfoto voor evenementen zonder eigen cover.
 *
 * Er zijn er twee soorten. De **sitebrede** staat in een `Setting` en is te
 * vervangen via /admin/home; zolang er niets geüpload is, geldt het bestand in
 * `public/`. Zo hoeft een nieuwe standaardfoto geen deploy.
 *
 * Daarnaast draagt elk **thema** (Feest, Cantus, Career, ...) een eigen
 * standaardbanner, te uploaden op /admin/kalender/categorieen. Een cantus zonder
 * affiche krijgt dan een cantusfoto in plaats van dezelfde foto als een
 * career-event; de sitebrede foto blijft de terugval wanneer de categorie er
 * geen heeft. Zie docs/design-decisions.md.
 */
export const DEFAULT_EVENT_IMAGE_SETTING = "home.defaultEventImage";

/** De meegeleverde foto, ook de preview-fallback in admin-formulieren. */
export const BUILTIN_DEFAULT_EVENT_IMAGE = "/default-event.jpg";

/** De sitebrede standaardfoto uit /admin/home, of het meegeleverde bestand. */
export async function getDefaultEventImage(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: DEFAULT_EVENT_IMAGE_SETTING } });
  return siteDefaultFrom(row?.value);
}

function siteDefaultFrom(settingValue: unknown): string {
  const value = settingValue as { imageKey?: string | null } | undefined;
  return publicUrl(value?.imageKey ?? undefined) ?? BUILTIN_DEFAULT_EVENT_IMAGE;
}

/**
 * De ruwe lezing achter de resolver hieronder: enkel strings, getallen en
 * JSON-kolommen, zodat ze door `unstable_cache` kan (zie lib/cachedContent.ts,
 * "de val: `unstable_cache` serialiseert naar JSON").
 */
export type DefaultEventImageRows = {
  setting: unknown;
  categories: { slug: string; order: number; imageKey: string | null }[];
};

export async function readDefaultEventImageRows(): Promise<DefaultEventImageRows> {
  const [row, categories] = await Promise.all([
    prisma.setting.findUnique({ where: { key: DEFAULT_EVENT_IMAGE_SETTING } }),
    // Enkel thema's: een doelgroep zegt voor wie het evenement is, niet hoe het
    // eruitziet.
    prisma.calendarCategory.findMany({
      where: { audience: null, imageKey: { not: null } },
      select: { slug: true, order: true, imageKey: true },
      orderBy: { order: "asc" },
    }),
  ]);
  return { setting: row?.value, categories };
}

/** De standaardfoto's zoals de site ze nodig heeft, klaar om te bevragen. */
export type DefaultEventImages = {
  /** De sitebrede foto, voor een evenement waarvan geen enkele categorie er een draagt. */
  site: string;
  /** Per themaslug de eigen standaardbanner, met de volgorde uit het beheer. */
  themes: Map<string, { order: number; image: string }>;
};

export function defaultEventImages(rows: DefaultEventImageRows): DefaultEventImages {
  const themes = new Map<string, { order: number; image: string }>();
  for (const category of rows.categories) {
    const image = publicUrl(category.imageKey ?? undefined);
    if (image) themes.set(category.slug, { order: category.order, image });
  }
  return { site: siteDefaultFrom(rows.setting), themes };
}

export async function getDefaultEventImages(): Promise<DefaultEventImages> {
  return defaultEventImages(await readDefaultEventImageRows());
}

/**
 * De foto voor één evenement zonder eigen affiche.
 *
 * Een evenement kan meerdere thema's dragen (een career-cantus), dus er moet er
 * één winnen. Dat is het thema dat in het beheer het hoogst staat: die volgorde
 * is al de prioriteit die een redacteur er zelf aan geeft, en ze is versleepbaar
 * zonder deploy. De volgorde waarin de aanroeper zijn categorieën meegeeft, doet
 * er dus bewust niet toe.
 */
export function defaultEventImageFor(
  images: DefaultEventImages,
  categorySlugs: Iterable<string>,
): string {
  let best: { order: number; image: string } | null = null;
  for (const slug of categorySlugs) {
    const banner = images.themes.get(slug);
    if (banner && (best === null || banner.order < best.order)) best = banner;
  }
  return best?.image ?? images.site;
}

/** De slugs van de categorieën van een evenement, zoals de queries ze opleveren. */
export function eventCategorySlugs(
  categories: { category: { slug: string } }[],
): string[] {
  return categories.map((link) => link.category.slug);
}
