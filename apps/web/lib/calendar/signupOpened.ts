import { signupNewsDate } from "@/lib/news/rules";
import { hasPresale, viewerSalesStart, type PresaleConfig, type PresaleViewer } from "@/lib/ticketing/presale";

/**
 * Wanneer de mail "de ticketverkoop of de inschrijvingen zijn open" vertrekt
 * naar wie interesse aanduidde in een evenement.
 *
 * Puur, zonder database en zonder mail, zodat de regels te testen zijn. Het
 * versturen staat in `signupOpenedMailer.ts`, het bericht in
 * `signupOpenedMail.ts`, de kringkeuze in docs/design-decisions.md.
 *
 * Drie manieren om binnen te geraken, elk met een eigen sleutel
 * (`CalendarEventSignupMail.source`):
 *
 * - **Een ticketverkoop** van VTK bij het evenement (`ticket:<id>`), elke
 *   verkoop apart: de tweede wave van Galabal is een eigen bericht.
 * - **Het formulier** bij het evenement (`form`).
 * - **De externe link**, enkel wanneer "deze link opent de inschrijvingen"
 *   aangevinkt staat (`link`). Een link zonder dat vinkje is meestal een
 *   Facebook-event; daar valt niets open te zetten.
 *
 * De regels:
 *
 * - **Open is het moment waarop jij kan kopen.** Wie in de voorverkoop mag,
 *   krijgt de mail bij de start van de voorverkoop; de rest bij de publieke
 *   start. Een verkoop zonder start is open zodra ze gepubliceerd is.
 * - **Eén mail per verkoop.** Wie hem in de voorverkoop kreeg, krijgt er bij de
 *   publieke start geen tweede.
 * - **Enkel wie al interesse had voor het openging.** Wie pas daarna op de ster
 *   klikt, zag de knop al staan.
 * - **Gemist is gemist na 24 uur**, en zeker zodra het evenement begint of de
 *   verkoop sluit. Dat houdt ook de eerste ronde na een deploy stil over wat al
 *   dagen loopt.
 */

/** Hoe lang na het opengaan de mail nog vertrekt. */
export const SIGNUP_OPENED_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SignupOpeningKind = "tickets" | "form" | "link";

export type SignupOpening = {
  /** De sleutel in `CalendarEventSignupMail.source`. */
  source: string;
  kind: SignupOpeningKind;
  /** Wanneer het voor deze persoon openging. */
  opensAt: Date;
  /** Wanneer het weer sluit, of `null`. */
  closesAt: Date | null;
  /** Opent het voor deze persoon in de voorverkoop? */
  presale: boolean;
};

function later(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

export type SignupTicketSale = PresaleConfig & {
  id: string;
  status: string;
  isPrivate: boolean;
  publishedAt: Date | null;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
};

export function ticketSaleSource(saleId: string): string {
  return `ticket:${saleId}`;
}

/**
 * Wanneer een ticketverkoop opengaat voor deze persoon. `null` voor een
 * concept, een gepauzeerde of private verkoop: die staat nergens open.
 */
export function ticketSaleOpening(sale: SignupTicketSale, viewer: PresaleViewer): SignupOpening | null {
  if (sale.status !== "PUBLISHED" || sale.isPrivate || !sale.publishedAt) return null;
  const start = viewerSalesStart(sale, viewer);
  const opensAt = start ? later(start, sale.publishedAt) : sale.publishedAt;
  // Voorverkoop enkel wanneer die echt vroeger opende dan de publieke start;
  // een verkoop die pas na haar start gepubliceerd werd, opent voor iedereen
  // tegelijk.
  const presale = Boolean(sale.salesStartAt) && opensAt.getTime() < sale.salesStartAt!.getTime();
  return { source: ticketSaleSource(sale.id), kind: "tickets", opensAt, closesAt: sale.salesEndAt, presale };
}

/** Moet de voorverkoopregel voor deze verkoop per persoon nagekeken worden? */
export function ticketSaleNeedsViewer(sale: SignupTicketSale): boolean {
  return hasPresale(sale);
}

export type SignupForm = {
  status: string;
  publishedAt: Date | null;
  opensAt: Date | null;
  closesAt: Date | null;
};

/** Het formulier bij het evenement: open vanaf `opensAt`, of vanaf het publiceren. */
export function formOpening(form: SignupForm): SignupOpening | null {
  if (form.status !== "PUBLISHED" || !form.publishedAt) return null;
  const opensAt = form.opensAt ? later(form.opensAt, form.publishedAt) : form.publishedAt;
  return { source: "form", kind: "form", opensAt, closesAt: form.closesAt, presale: false };
}

export type SignupLinkEvent = {
  url: string | null;
  registrationNewsAt: Date | null;
  publishedAt: Date | null;
};

/**
 * De externe link, enkel met "deze link opent de inschrijvingen" aangevinkt.
 * Zelfde moment als het nieuws op de homepage (`signupNewsDate`).
 */
export function linkOpening(event: SignupLinkEvent): SignupOpening | null {
  const url = event.url?.trim();
  if (!url) return null;
  const opensAt = signupNewsDate(event);
  if (!opensAt) return null;
  return { source: "link", kind: "link", opensAt, closesAt: null, presale: false };
}

/** Hoort deze mail nu te vertrekken? */
export function signupOpenedDue(
  input: {
    opening: SignupOpening;
    /** De vroegste interesse van dit lid in dit evenement. */
    interestCreatedAt: Date;
    eventStart: Date;
  },
  now: Date,
): boolean {
  const { opening } = input;
  const opens = opening.opensAt.getTime();
  if (now.getTime() < opens) return false;
  if (now.getTime() - opens >= SIGNUP_OPENED_WINDOW_MS) return false;
  if (input.interestCreatedAt.getTime() >= opens) return false;
  if (input.eventStart.getTime() <= now.getTime()) return false;
  if (opening.closesAt && opening.closesAt.getTime() <= now.getTime()) return false;
  return true;
}
