import { loadAlma } from "@/lib/alma";
import { corsPreflight } from "@/lib/cors";
import { appLocaleFrom } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De Alma's op campus Arenberg: open of niet, de uren van de week en het menu van
 * een dag (`?datum=YYYY-MM-DD`, standaard vandaag). Zonder login, zoals alma.be
 * zelf. De pagina's van Alma zitten een half uur in de cache; zie `lib/alma`.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const locale = appLocaleFrom(params.get("locale"));
    return appJson(request, await loadAlma(locale, params.get("datum")));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
