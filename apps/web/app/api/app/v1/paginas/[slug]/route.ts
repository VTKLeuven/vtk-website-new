import { pick } from "@vtk/i18n";

import { corsPreflight } from "@/lib/cors";
import { loadPageBySlug } from "@/lib/pageQueries";
import { appLocaleFrom, type AppPage } from "@/lib/app-api/contract";
import { absoluteMediaUrl, absoluteUrl } from "@/lib/app-api/media";
import { pageContentMarkdown, pageOutline } from "@/lib/app-api/pageContent";
import { appErrorResponse, appJson, appNotFound } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eén contentpagina uit het CMS.
 *
 * Enkel gepubliceerde pagina's. Een concept blijft in de admin bewerkbaar maar
 * hoort nergens publiek te verschijnen, en de app is publiek.
 *
 * De inhoud komt als **Markdown**, ook wanneer ze in de database als tiptap-JSON
 * staat; zie `lib/app-api/pageContent.ts`. De kop-index komt uit diezelfde
 * Markdown, zodat de ankers per definitie bij de getoonde tekst horen.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));

    const page = await loadPageBySlug(slug);
    if (!page || !page.publishedAt) return appNotFound(request, "Deze pagina bestaat niet.");

    const payload: AppPage = {
      slug: page.slug,
      title: pick(page.titleNl, page.titleEn, locale),
      excerpt: pick(page.excerptNl ?? "", page.excerptEn ?? "", locale) || null,
      imageUrl: absoluteMediaUrl(request, page.imageKey),
      content: pageContentMarkdown(page, locale),
      outline: pageOutline(page, locale),
      downloads: page.assets
        .filter((asset) => asset.kind === "DOWNLOAD")
        .map((asset) => ({
          id: asset.id,
          label: pick(asset.labelNl, asset.labelEn, locale),
          url: absoluteMediaUrl(request, asset.storageKey) as string,
          sizeBytes: asset.sizeBytes,
          mimeType: asset.mimeType,
        })),
      category: page.headerTab
        ? {
            slug: page.headerTab.slug,
            label: pick(page.headerTab.labelNl, page.headerTab.labelEn, locale),
          }
        : null,
      ctaLabel: pick(page.ctaLabelNl ?? "", page.ctaLabelEn ?? "", locale) || null,
      // Een CTA mag een pad op deze site zijn of een volledig adres; dat is een
      // bewuste keuze op de site (`isEditableDestination`), en `absoluteUrl`
      // handelt allebei af.
      ctaUrl: absoluteUrl(request, page.ctaUrl),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
