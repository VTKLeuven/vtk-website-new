import { viewerAudiences } from "@/lib/calendar/audience";
import { corsPreflight } from "@/lib/cors";
import { isExternalResult, type SnippetPart } from "@/lib/search";
import { searchSite } from "@/lib/search-server";
import { getCurrentSession } from "@/lib/session";
import { appLocaleFrom, type AppSearch } from "@/lib/app-api/contract";
import { absoluteUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Zoeken op de site.
 *
 * Bovenop dezelfde `searchSite` als `/zoeken`, met de twee parameters die daar
 * uit de sessie komen expliciet meegegeven: de doelgroepen van de kijker en of
 * hij ingelogd is. Dat tweede bepaalt of het uitleenmateriaal meezoekt; de
 * catalogus zit achter een login, en materiaalnamen in een publiek
 * resultatenlijstje zetten zou die keuze langs de achterdeur ongedaan maken.
 *
 * De snippets komen van Postgres met onzichtbare markeringstekens rond de
 * treffer. De app krijgt platte tekst: een gemarkeerde treffer zou hier een
 * eigen opmaakformaat worden, en dat is meer machinerie dan een grijze regel
 * onder een zoekresultaat waard is.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locale = appLocaleFrom(url.searchParams.get("locale"));

    const [session, audiences] = await Promise.all([getCurrentSession(), viewerAudiences()]);

    const outcome = await searchSite({
      query: url.searchParams.get("q"),
      locale,
      audiences,
      signedIn: Boolean(session),
    });

    const payload: AppSearch = {
      query: outcome.query,
      searched: outcome.searched,
      results: outcome.results.map((result) => ({
        kind: result.kind,
        id: result.id,
        title: result.title,
        meta: result.meta,
        snippet: plainSnippet(result.snippet),
        external: isExternalResult(result.kind),
        href: isExternalResult(result.kind)
          ? result.href
          : (absoluteUrl(request, result.href) as string),
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/** De stukjes samenvoegen tot één regel; de markering valt weg. */
function plainSnippet(parts: SnippetPart[]): string {
  return parts
    .map((part) => part.text)
    .join("")
    .trim();
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
