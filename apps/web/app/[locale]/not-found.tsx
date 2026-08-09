import type { Metadata } from "next";
import { headers } from "next/headers";
import { NotFoundView } from "@/components/site/NotFoundView";
import { getDictionary } from "@vtk/i18n";
import { localeFromPath } from "@/lib/locale";
import { buildMetadata } from "@/lib/seo";

/**
 * De 404 voor alles onder de taal. Elke `notFound()` in een segment hieronder
 * komt hier terecht, en dat is het gros van de gevallen: een onbekende
 * `/[headerSlug]` of `/[headerSlug]/[pageSlug]` valt binnen de routeboom en dus
 * binnen deze grens. Ze rendert in `[locale]/layout.tsx`, dus met de gewone
 * sitekop en -voet.
 *
 * Een not-found-component krijgt geen props (ook geen `params`), dus de taal
 * komt uit de `x-pathname`-header die `proxy.ts` zet; net zoals in de root
 * layout.
 */
async function requestPath(): Promise<string> {
  const h = await headers();
  return h.get("x-pathname") || "/";
}

export async function generateMetadata(): Promise<Metadata> {
  const path = await requestPath();
  const locale = localeFromPath(path);
  const t = getDictionary(locale).notFound;
  // `path` is het adres dat niet bestond: de canonical wijst dus naar zichzelf en
  // niet naar een willekeurige andere pagina. `noIndex` want een 404 hoort niet
  // in de index, ook niet wanneer Next de status als 200 streamt.
  return buildMetadata({
    title: t.title,
    description: t.lead,
    path,
    locale,
    noIndex: true,
  });
}

export default async function LocaleNotFound() {
  const locale = localeFromPath(await requestPath());
  return <NotFoundView locale={locale} />;
}
