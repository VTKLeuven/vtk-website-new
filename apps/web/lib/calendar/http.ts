import { normalizeLocale, type Locale } from "@/lib/locale";

/**
 * Agenda-clients hangen graag een `.ics` aan de URL, en sommige tonen de feed
 * anders niet. De suffix is puur cosmetisch, dus zowel `/feed/c/eerstejaars` als
 * `/feed/c/eerstejaars.ics` moeten dezelfde kalender geven.
 */
export function stripIcsSuffix(value: string): string {
  return value.replace(/\.ics$/i, "");
}

/** Taal van een feed via `?lang=`; alles wat geen geldige locale is, valt terug op NL. */
export function feedLocale(url: URL): Locale {
  return normalizeLocale(url.searchParams.get("lang"));
}

/**
 * Een publieke feed mag een kwartier gecachet worden: clients pollen toch maar om
 * de paar uur, en een wijziging in de admin hoeft niet binnen de seconde door te
 * komen. Persoonlijke feeds dragen een geheim in de URL en mogen nergens blijven
 * hangen, ook niet in een tussenliggende proxy.
 */
export function icsResponse(
  body: string,
  filename: string,
  options: { private?: boolean; download?: boolean } = {},
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `${options.download ? "attachment" : "inline"}; filename="${filename}"`,
  };

  if (options.private) {
    headers["Cache-Control"] = "private, no-store";
    headers["X-Robots-Tag"] = "noindex";
  } else {
    headers["Cache-Control"] = "public, max-age=900";
  }

  return new Response(body, { headers });
}
