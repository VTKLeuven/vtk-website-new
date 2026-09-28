import type { Locale } from "@vtk/i18n";
import type { NewsSource } from "./rules";

/** De naam van elke soort, zoals ze boven een bericht en in het beheer staat. */
const LABELS: Record<NewsSource, { nl: string; en: string }> = {
  notice: { nl: "Mededeling", en: "Notice" },
  praeses: { nl: "Woordje van de praeses", en: "A word from the praeses" },
  tickets: { nl: "Ticketverkoop", en: "Tickets" },
  signup: { nl: "Inschrijvingen", en: "Sign-ups" },
  bakske: { nl: "Het Bakske", en: "Het Bakske" },
  irreeel: { nl: "Ir.Reëel", en: "Ir.Reëel" },
  album: { nl: "Fotoalbum", en: "Photo album" },
};

export function newsSourceLabel(source: NewsSource, locale: Locale): string {
  return LABELS[source][locale === "nl" ? "nl" : "en"];
}

/**
 * De naam van een soort als filter op /nieuws: in het meervoud waar de chip een
 * groep berichten aanduidt ("Mededelingen", niet "Mededeling").
 */
const FILTER_LABELS: Record<NewsSource, { nl: string; en: string }> = {
  notice: { nl: "Mededelingen", en: "Notices" },
  praeses: { nl: "Woordjes van de praeses", en: "Words from the praeses" },
  tickets: { nl: "Ticketverkoop", en: "Tickets" },
  signup: { nl: "Inschrijvingen", en: "Sign-ups" },
  bakske: { nl: "Het Bakske", en: "Het Bakske" },
  irreeel: { nl: "Ir.Reëel", en: "Ir.Reëel" },
  album: { nl: "Fotoalbums", en: "Photo albums" },
};

export function newsFilterLabel(source: NewsSource, locale: Locale): string {
  return FILTER_LABELS[source][locale === "nl" ? "nl" : "en"];
}

/** De soort in de URL van /nieuws (`?soort=`), leesbaar en in het Nederlands. */
export const NEWS_FILTER_PARAM: Record<NewsSource, string> = {
  tickets: "tickets",
  signup: "inschrijvingen",
  notice: "mededelingen",
  praeses: "woordje",
  bakske: "bakske",
  irreeel: "ir-reeel",
  album: "fotos",
};

export function newsSourceFromParam(raw: string | string[] | undefined): NewsSource | null {
  if (typeof raw !== "string") return null;
  const hit = (Object.entries(NEWS_FILTER_PARAM) as [NewsSource, string][]).find(
    ([, param]) => param === raw,
  );
  return hit ? hit[0] : null;
}
