import { NextResponse } from "next/server";
import { signOut } from "@vtk/auth/server";
import { AUTHORIZATION_PREVIEW_COOKIE } from "@/lib/authorization-preview-constants";
import { siteUrl } from "@/lib/seo";

/**
 * De enige POST die tijdens een autorisatievoorbeeld door `proxy.ts` mag: de
 * uitweg. Wist de voorbeeldcookie en gaat terug naar het startscherm van het
 * voorbeeld.
 *
 * Met `logout=1` logt ze ook meteen uit. Uitloggen is elders een server
 * action, en die blokkeert de proxy tijdens een voorbeeld net als elke andere
 * mutatie; wie in een voorbeeld op "Afmelden" klikte, kreeg een 403 en een
 * crashende pagina in plaats van een uitweg.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const locale = formData.get("locale") === "en" ? "en" : "nl";
  const logout = formData.get("logout") === "1";

  if (logout) {
    // `nextCookies` (packages/auth) zet de gewiste sessiecookies op het
    // antwoord van deze route.
    await signOut(request.headers);
  }

  // Terug naar het scherm waar je het voorbeeld startte, zodat je meteen een
  // andere selectie kan proberen; na uitloggen naar de homepage.
  const target = logout
    ? `${locale === "en" ? "/en" : ""}/`
    : `${locale === "en" ? "/en" : ""}/admin/it/preview`;
  const response = NextResponse.redirect(new URL(target, siteUrl()), 303);
  response.cookies.delete(AUTHORIZATION_PREVIEW_COOKIE);
  return response;
}
