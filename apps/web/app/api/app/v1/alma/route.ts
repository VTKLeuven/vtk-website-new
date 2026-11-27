import { loadAlma } from "@/lib/alma";
import { corsPreflight } from "@/lib/cors";
import { appLocaleFrom } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De Alma's: open of niet, de uren van de week en het menu van een dag
 * (`?datum=YYYY-MM-DD`, standaard vandaag). Standaard de vier op campus
 * Arenberg; met `?alle=1` ook Alma 1, Alma 2 en Gasthuisberg. Zonder login,
 * zoals alma.be zelf. De pagina's van Alma zitten een half uur in de cache; zie
 * `lib/alma`.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const locale = appLocaleFrom(params.get("locale"));
    const all = params.get("alle") === "1";
    return appJson(request, await loadAlma(locale, params.get("datum"), new Date(), { all }));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
