import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/**
 * Zelfde reden als bij de sitemap: de basis-URL komt uit de omgeving van de
 * draaiende container, niet uit die van de build.
 */
export const dynamic = "force-dynamic";

/**
 * Wat een crawler niet hoort op te halen. Paden matchen als voorvoegsel, dus
 * `/admin` dekt meteen elk beheerscherm eronder.
 *
 * De Nederlandse routes staan hier twee keer: `/account` én `/en/account`. Beide
 * vormen bestaan echt (`proxy.ts` laat een pad met taalvoorvoegsel gewoon door),
 * dus één regel zou de andere helft openlaten.
 *
 * `/nl/...` staat er bewust NIET bij, hoewel die vorm dezelfde pagina rendert:
 * een crawler die een URL niet mag ophalen, ziet de canonical erop ook niet en
 * kan hem alsnog kaal indexeren. Duplicate content los je op met de canonical uit
 * `lib/seo.ts`, niet met robots.txt.
 */
const DISALLOW = [
  "/api",
  "/scan",
  "/admin",
  "/en/admin",
  "/onboarding",
  "/en/onboarding",
  "/inloggen",
  "/en/inloggen",
  "/account",
  "/en/account",
  "/tickets/bestelling",
  "/en/tickets/bestelling",
];

export default function robots(): MetadataRoute.Robots {
  // Geen `host`-regel: die verwacht een kale hostnaam en Next schrijft er de
  // volledige URL in, wat een ongeldige directive oplevert. Enkel Yandex leest
  // hem sowieso.
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOW,
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
