import type { Locale } from "@vtk/i18n";

/**
 * Wat er op de knop staat wanneer de redacteur zelf niets koos. Bewust vaag:
 * hij dekt zowel een inschrijfformulier van een partner als een pagina met meer
 * uitleg, en wie het preciezer wil, tikt zijn eigen tekst in.
 */
export const DEFAULT_EVENT_LINK_LABEL: Record<Locale, string> = {
  nl: "Externe eventlink",
  en: "External event link",
};

/**
 * Het is een knop en geen zin: langer dan dit past niet meer naast "Zet in mijn
 * agenda" en "Terug naar kalender" op dezelfde rij.
 */
export const EVENT_LINK_LABEL_MAX = 40;

/**
 * De tekst op de knop naar de externe link van een evenement.
 *
 * "Externe eventlink" zegt alleen dat je de site verlaat, niet wat er aan de
 * andere kant staat. Een link naar de inschrijvingen van een partner of naar
 * hun ticketverkoop verdient "Inschrijflink" of "Ticketverkoop"; dat is
 * precies het verschil tussen een knop die je aanklikt en een die je overslaat.
 *
 * De Engelse tekst valt terug op de Nederlandse in plaats van op de
 * standaardtekst: wie één veld invult, bedoelt dat voor beide talen, en
 * "Inschrijflink" op de Engelse site is nog altijd duidelijker dan "External
 * event link".
 */
export function eventLinkLabel(
  event: { urlLabelNl?: string | null; urlLabelEn?: string | null },
  locale: Locale,
): string {
  // `||` en niet `??`: een leeg veld uit een ouder formulier is hetzelfde als
  // niets ingevuld, en moet dus ook terugvallen.
  const own = locale === "en" ? event.urlLabelEn?.trim() || event.urlLabelNl : event.urlLabelNl;
  return own?.trim() || DEFAULT_EVENT_LINK_LABEL[locale];
}
