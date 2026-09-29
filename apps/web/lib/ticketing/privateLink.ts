import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { presaleCookieOptions, presaleTokenMatches } from "./presaleLink";

/**
 * De privélink van een privéverkoop: de enige weg naar het event.
 *
 * Een privé-event staat nergens op de site: niet op /tickets, niet in de
 * kalender, het nieuws, de homepage of de app. `/tickets/<slug>` geeft een 404
 * en het afrekenen weigert, behalve voor wie de link volgde. Bedoeld voor een
 * verkoop aan een afgebakende groep (een weekend, een sponsordiner, een
 * werkgroep) die de rest van de kring niet hoeft te zien.
 *
 * Zelfde opzet als de voorverkooplink (`presaleLink.ts`): de link is het bewijs
 * en mag dus niet te raden zijn, hij hangt aan het event en niet aan een
 * persoon, en vernieuwen maakt de oude meteen waardeloos, ook voor wie hem al
 * volgde (de cookie wordt telkens opnieuw tegen het token vergeleken). Het
 * verschil: de voorverkooplink zet een verkoop *vroeger* open, deze bepaalt of
 * je het event überhaupt ziet.
 *
 * Een slug is geen geheim ("cantus", "galabal"); daarom het token en niet enkel
 * "niet in de lijst zetten".
 */

export function newPrivateToken(): string {
  return randomBytes(16).toString("hex");
}

/** Vergelijkt in constante tijd, zoals bij de voorverkooplink. */
export function privateTokenMatches(stored: string | null, provided: string | null): boolean {
  return presaleTokenMatches(stored, provided);
}

/** Per event, net als de voorverkoopcookie, maar met een eigen naam. */
export function privateCookieName(eventId: string): string {
  const suffix = createHash("sha256").update(`private:${eventId}`).digest("hex").slice(0, 24);
  return `vtk_private_${suffix}`;
}

export const privateCookieOptions = presaleCookieOptions;

/**
 * Hoe lang de cookie leeft: tot de verkoop sluit, en zonder verkoopeinde tot
 * het event voorbij is. Anders dan bij de voorverkoop komt een koper hier vaak
 * dagen later terug (na het loonbriefje, na overleg met wie meegaat), en hij
 * moet de pagina dan nog kunnen openen zonder de link terug te zoeken. Wie ooit
 * besteld heeft, vindt zijn tickets los hiervan in "Mijn tickets".
 */
export function privateCookieExpiry(
  event: { salesEndAt?: Date | null; endsAt: Date },
  now = new Date(),
): Date {
  const until = event.salesEndAt ?? event.endsAt;
  if (until > now) return until;
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

type PrivateEvent = { id: string; isPrivate: boolean; privateToken: string | null };

/**
 * Mag deze bezoeker dit event zien en kopen? Een openbaar event altijd; een
 * privé-event enkel met een cookie die nog bij het huidige token hoort.
 *
 * Leest de cookie enkel voor een privé-event, zodat een gewone ticketpagina er
 * niets van merkt.
 */
export async function hasPrivateTicketAccess(event: PrivateEvent): Promise<boolean> {
  if (!event.isPrivate) return true;
  const jar = await cookies();
  return privateTokenMatches(
    event.privateToken,
    jar.get(privateCookieName(event.id))?.value ?? null,
  );
}
