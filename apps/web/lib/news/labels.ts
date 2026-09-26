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
