import { pick } from "@vtk/i18n";

import { corsPreflight } from "@/lib/cors";
import { isExternalUrl } from "@/lib/href";
import { loadHeaderTabWithPages } from "@/lib/pageQueries";
import { appLocaleFrom, type AppCategory } from "@/lib/app-api/contract";
import { absoluteMediaUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson, appNotFound } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eén categorie uit de hoofdnavigatie, met de pagina's eronder.
 *
 * Dezelfde selectie als de categoriepagina op de site
 * (`loadHeaderTabWithPages`): zichtbaar op die pagina én gepubliceerd. De
 * hover-dropdown heeft bewust een afzonderlijke zichtbaarheidskeuze.
 *
 * De menu-items (`links`) horen erbij: dat zijn de bestemmingen op een andere
 * site of in een andere app (piano, uitleendienst, de cudi-webshop), en die
 * staan op de categoriepagina van de site ook tussen de pagina's.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));

    const tab = await loadHeaderTabWithPages(slug);
    if (!tab || !tab.visible) return appNotFound(request, "Deze categorie bestaat niet.");

    const payload: AppCategory = {
      slug: tab.slug,
      label: pick(tab.labelNl, tab.labelEn, locale),
      intro: pick(tab.introNl ?? "", tab.introEn ?? "", locale) || null,
      pages: tab.pages.map((page) => ({
        slug: page.slug,
        title: pick(page.titleNl, page.titleEn, locale),
        excerpt: pick(page.excerptNl ?? "", page.excerptEn ?? "", locale) || null,
        imageUrl: absoluteMediaUrl(request, page.imageKey),
      })),
      links: tab.links.map((link) => ({
        id: link.id,
        label: pick(link.labelNl, link.labelEn, locale),
        href: link.url,
        external: isExternalUrl(link.url),
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
