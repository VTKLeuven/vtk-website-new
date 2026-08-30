import "server-only";

import type { MailCategory, Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import type { BrevoContact } from "./client";
import { normalizeEmail, readUnsubscribe, type BrevoListKey, type BrevoUnsubscribe } from "./contacts";

/**
 * De terugweg van de Brevo-koppeling: uitschrijvingen die in Brevo gebeurden
 * (de link onderaan elke campagne) in de site-database zetten.
 *
 * Zonder dit was de sync eenrichting. Brevo stopte dan wel met mailen, maar de
 * site bleef zo iemand als ingeschreven tonen en in elke CSV-export zetten; wie
 * die export ooit ergens anders importeerde, mailde iemand die net "stop" had
 * gezegd. Nu is de uitschrijving een feit dat beide kanten kennen.
 *
 * **Enkel uitschrijvingen worden teruggelezen, geen inschrijvingen.** De site
 * blijft de plek waar iemand zich abonneert (daar staat de opt-in, daar hangt de
 * toestemming aan vast); Brevo is enkel de plek waar iemand kan afhaken. Een
 * contact dat in Brevo weer van de blacklist gehaald wordt, verandert hier dus
 * niets: het lid zet dat zelf terug op /account, en dan gaat de un-blacklist
 * mee (`clearUnsubscribe` in `client.ts`).
 */

/** Een adres uit Brevo gekoppeld aan wat het lid daar uitzette. */
type Signal = { contact: BrevoContact; unsub: BrevoUnsubscribe };

/**
 * Rol de contacten van alle lijsten samen tot één uitschrijving per adres.
 * Hetzelfde contact komt terug in elke lijst waar het in zit, telkens met
 * dezelfde velden; enkel wie écht iets uitzette houden we over.
 */
function collect(
  contacts: BrevoContact[],
  keyByListId: Map<number, BrevoListKey>,
): Map<string, Signal> {
  const byEmail = new Map<string, Signal>();
  for (const contact of contacts) {
    const unsub = readUnsubscribe(contact, keyByListId);
    if (!unsub.global && unsub.categories.length === 0) continue;

    const key = normalizeEmail(contact.email);
    const previous = byEmail.get(key);
    if (!previous) {
      byEmail.set(key, { contact, unsub });
      continue;
    }
    previous.unsub = {
      global: previous.unsub.global || unsub.global,
      categories: [...new Set([...previous.unsub.categories, ...unsub.categories])],
    };
  }
  return byEmail;
}

type MatchedUser = {
  id: string;
  email: string;
  personalEmail: string | null;
  mailCategories: MailCategory[];
  mailUnsubscribedAt: Date | null;
  alumniMailOptIn: boolean;
};

/**
 * Zoek de leden achter een reeks Brevo-adressen.
 *
 * Eerst op `ext_id`: dat is de `user.id` die onze eigen sync meestuurt, en die
 * blijft kloppen wanneer een lid van adres wisselt. Daarnaast op adres, want een
 * contact dat ooit anders binnenkwam heeft die ext_id niet. Het adres matchen we
 * hoofdletterongevoelig: Brevo bewaart alles lowercase, een zelf ingevulde
 * persoonlijke mail niet per se.
 */
async function matchUsers(signals: Map<string, Signal>): Promise<MatchedUser[]> {
  const extIds = [...signals.values()]
    .map((s) => s.contact.extId)
    .filter((id): id is string => id !== null);
  const emails = [...signals.keys()];

  const where: Prisma.UserWhereInput[] = [
    ...(extIds.length > 0 ? [{ id: { in: extIds } }] : []),
    ...emails.flatMap((email): Prisma.UserWhereInput[] => [
      { email: { equals: email, mode: "insensitive" } },
      { personalEmail: { equals: email, mode: "insensitive" } },
    ]),
  ];

  return prisma.user.findMany({
    where: { deletedAt: null, OR: where },
    select: {
      id: true,
      email: true,
      personalEmail: true,
      mailCategories: true,
      mailUnsubscribedAt: true,
      alumniMailOptIn: true,
    },
  });
}

/** De uitschrijving die bij dit lid hoort: op ext_id, anders op één van zijn adressen. */
function signalFor(user: MatchedUser, signals: Map<string, Signal>): BrevoUnsubscribe | null {
  for (const signal of signals.values()) {
    if (signal.contact.extId === user.id) return signal.unsub;
  }
  return (
    signals.get(normalizeEmail(user.email))?.unsub ??
    (user.personalEmail ? (signals.get(normalizeEmail(user.personalEmail))?.unsub ?? null) : null)
  );
}

/**
 * Zet de uitschrijvingen uit de door de site beheerde studentenlijsten in de DB.
 * Geeft terug hoeveel leden er effectief wijzigden, zodat de reconciliatie en de
 * admin kunnen tonen dat er iets teruggekomen is.
 *
 * Een globale uitschrijving zet `mailUnsubscribedAt`; een categorie die het lid
 * uitzette verdwijnt uit `mailCategories`. `mailCategories` blijft bij een
 * globale uitschrijving bewust ongemoeid: schrijft het lid zich later opnieuw in,
 * dan krijgt het zijn eigen keuzes terug in plaats van een leeg formulier.
 */
export async function pullUnsubscribes(
  contacts: BrevoContact[],
  keyByListId: Map<number, BrevoListKey>,
): Promise<number> {
  const signals = collect(contacts, keyByListId);
  if (signals.size === 0) return 0;

  const users = await matchUsers(signals);
  let changed = 0;

  for (const user of users) {
    const unsub = signalFor(user, signals);
    if (!unsub) continue;

    const data: Prisma.UserUpdateInput = {};
    if (unsub.global && user.mailUnsubscribedAt === null) data.mailUnsubscribedAt = new Date();
    if (unsub.categories.length > 0) {
      const kept = user.mailCategories.filter((c) => !unsub.categories.includes(c));
      if (kept.length !== user.mailCategories.length) data.mailCategories = { set: kept };
    }
    if (Object.keys(data).length === 0) continue;

    await prisma.user.update({ where: { id: user.id }, data });
    changed += 1;
  }

  return changed;
}

/**
 * Hetzelfde voor de alumnilijst, die een eigen lijst met een eigen sync heeft.
 *
 * Een uitschrijving specifiek voor die lijst zet de opt-in af (bij een account)
 * of `unsubscribedAt` (bij een adresboekrij). Een globale uitschrijving zet bij
 * een account `mailUnsubscribedAt`, wat de alumnilijst óók blokkeert; de opt-in
 * zelf blijft dan staan, net als de categorieën hierboven.
 */
export async function pullAlumniUnsubscribes(
  contacts: BrevoContact[],
  alumniListId: number,
): Promise<number> {
  const relevant = contacts.filter(
    (c) => c.emailBlacklisted || c.listUnsubscribed.includes(alumniListId),
  );
  if (relevant.length === 0) return 0;

  // De alumnilijst kent geen categorieën: `global` betekent hier "blacklist",
  // en de rest is een uitschrijving voor deze ene lijst.
  const signals = new Map<string, Signal>(
    relevant.map((contact) => [
      normalizeEmail(contact.email),
      { contact, unsub: { global: contact.emailBlacklisted, categories: [] } },
    ]),
  );

  const users = await matchUsers(signals);
  let changed = 0;

  for (const user of users) {
    const unsub = signalFor(user, signals);
    if (!unsub) continue;

    const data: Prisma.UserUpdateInput = {};
    if (unsub.global) {
      if (user.mailUnsubscribedAt === null) data.mailUnsubscribedAt = new Date();
    } else if (user.alumniMailOptIn) {
      data.alumniMailOptIn = false;
    }
    if (Object.keys(data).length === 0) continue;

    await prisma.user.update({ where: { id: user.id }, data });
    changed += 1;
  }

  // Adresboekrijen: enkel wie nog ingeschreven staat, zodat de datum van de
  // eerste uitschrijving bewaard blijft.
  const contactRows = await prisma.alumniContact.updateMany({
    where: { unsubscribedAt: null, email: { in: [...signals.keys()] } },
    data: { unsubscribedAt: new Date() },
  });

  return changed + contactRows.count;
}
