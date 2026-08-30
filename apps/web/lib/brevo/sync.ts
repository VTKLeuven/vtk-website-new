import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { currentStudyYear } from "@vtk/auth";
import {
  BREVO_LIST_KEYS,
  alternateEmail,
  contactAttributes,
  desiredListKeys,
  emailsToRemove,
  normalizeEmail,
  preferredEmail,
  type BrevoListKey,
} from "./contacts";
import {
  addContactsToList,
  brevoEnabled,
  clearUnsubscribe,
  getContact,
  importContactsToList,
  listContacts,
  removeContactsFromList,
  upsertContact,
  type BrevoContact,
  type ImportContact,
} from "./client";
import { pullUnsubscribes } from "./unsubscribe";
import { getBrevoListMap } from "./schema";

/**
 * De Brevo-synchronisatie zet de opt-in mailinglijsten van de site rechtstreeks
 * in Brevo, zonder de vroegere handmatige CSV-export/import. Volgt hetzelfde
 * stramien als de cudi-koppeling: een optionele integratie achter een env-key,
 * een real-time best-effort push bij elke profielwijziging, en een reconciliatie
 * als vangnet (zie de cron-route en `docs/design-decisions.md`).
 *
 * De koppeling loopt **in twee richtingen**, maar niet symmetrisch: de site
 * bepaalt wie in welke lijst hoort (push), Brevo is de enige plek waar een
 * uitschrijving kan ontstaan (pull, zie `unsubscribe.ts`). Daarom wordt er in
 * beide sporen éérst gelezen en pas daarna geschreven: anders duwt een
 * profielopslag of een nachtelijke import een verse uitschrijving weer weg.
 */

const USER_SELECT = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  email: true,
  personalEmail: true,
  emailPreference: true,
  active: true,
  notStudying: true,
  notAtFaculty: true,
  studyConfirmedYear: true,
  mailCategories: true,
  mailUnsubscribedAt: true,
  studyYears: true,
  studyProgrammes: true,
} satisfies Prisma.UserSelect;

/** Slik een best-effort lijst-operatie in: een no-op (bv. adres al weg) mag de rest niet stoppen. */
async function guard(op: Promise<unknown>): Promise<void> {
  try {
    await op;
  } catch {
    /* best-effort: de reconciliatie zet een echte afwijking later recht */
  }
}

/** Lijst-ID naar sleutel, om een `listUnsubscribed` uit Brevo te kunnen lezen. */
function keysByListId(lists: Record<BrevoListKey, number>): Map<number, BrevoListKey> {
  return new Map(BREVO_LIST_KEYS.map((key) => [lists[key], key]));
}

export type SyncOutcome = { ok: boolean; skipped?: boolean; error?: string; unsubscribed?: boolean };

/**
 * Duw één lid naar Brevo (real-time, best-effort). Zet de contactattributen en
 * brengt het lijstlidmaatschap in lijn met {@link desiredListKeys}: toevoegen aan
 * de gewenste lijsten, verwijderen uit de rest. Het niet-gekozen mailadres wordt
 * uit alle lijsten gehaald, zodat een gewisselde mailvoorkeur geen dubbele
 * inschrijving op het oude adres achterlaat.
 *
 * Leest eerst het contact in Brevo: schreef het lid zich daar intussen uit, dan
 * gaat die uitschrijving mee naar de DB **voor** we iets duwen. Zonder die
 * volgorde zou een profielopslag ("ik pas mijn adres aan") iemand stil weer in
 * de lijsten zetten die hij net verlaten had.
 *
 * `resubscribe` is de omgekeerde weg, en de enige: het lid vinkte op /account
 * expliciet aan dat het weer mails wil. Dan halen we de uitschrijving in Brevo
 * eerst weg, zodat de lijsten die we daarna zetten ook echt aankomen.
 *
 * Zonder `BREVO_KEY` gebeurt er niets (`skipped`). Fouten komen terug, ze worden
 * niet gegooid: een hapering bij Brevo mag het opslaan van een profiel niet
 * breken; de reconciliatie zet het later recht.
 */
export async function syncUserToBrevo(
  userId: string,
  options: { resubscribe?: boolean } = {},
): Promise<SyncOutcome> {
  if (!brevoEnabled()) return { ok: true, skipped: true };
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!user) return { ok: false, error: "user not found" };

    const { lists } = await getBrevoListMap();
    const email = preferredEmail(user);
    const alt = alternateEmail(user);

    // Eerst lezen: een uitschrijving in Brevo is het enige dat de site nog niet
    // weet, en ze moet in de DB staan voor we berekenen waar dit lid in hoort.
    const keyByListId = keysByListId(lists);
    const contact = await getContact(email).catch(() => null);

    let effective = user;
    if (options.resubscribe) {
      // Het lid koos net expliciet voor mails: haal de blacklist weg, plus de
      // uitschrijving van de lijsten waar er één op staat. Dit gebeurt vóór we
      // inschrijven, anders komt de mail alsnog niet aan.
      const stuck = (contact?.listUnsubscribed ?? []).filter((id) => keyByListId.has(id));
      await guard(clearUnsubscribe(email, stuck));
    } else if (contact) {
      const pulled = await pullUnsubscribes([contact], keyByListId);
      if (pulled > 0) {
        effective =
          (await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT })) ?? user;
      }
    }

    const desired = new Set(desiredListKeys(effective, currentStudyYear()));

    // Enkel wie in minstens één lijst hoort, houden we als contact bij; voor de
    // rest volstaat het ze uit elke lijst te verwijderen.
    if (desired.size > 0) {
      await upsertContact(email, user.id, contactAttributes(effective));
    }

    for (const key of BREVO_LIST_KEYS) {
      const listId = lists[key];
      // Per lijst afgeschermd: Brevo geeft een 400 wanneer je een adres
      // verwijdert dat niet in de lijst zit (voor ons een no-op). Dat mag de
      // overige lijsten niet tegenhouden.
      await guard(desired.has(key) ? addContactsToList(listId, [email]) : removeContactsFromList(listId, [email]));
      if (alt) await guard(removeContactsFromList(listId, [alt]));
    }

    return { ok: true, unsubscribed: effective.mailUnsubscribedAt !== null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type ReconcileOutcome =
  | { skipped: true }
  | {
      lists: number;
      contacts: number;
      assignments: number;
      pruned: number;
      unsubscribed: number;
      failed: number;
    };

/**
 * Vangnet: haal de uitschrijvingen uit Brevo op, herbereken daarna alle
 * lijst-lidmaatschappen uit de DB en zet ze in Brevo recht. Per lijst worden de
 * gewenste contacten (bulk-)geïmporteerd (upsert + attributen) en wordt geprund
 * wie er niet meer in hoort. Dit vangt gemiste real-time pushes én laat afvinken,
 * van richting veranderen en afstuderen alsnog doorwerken. Bedoeld voor een
 * dagelijkse cron (zie de sync-route).
 *
 * De volgorde is niet vrijblijvend: eerst élke lijst uitlezen, dan de
 * uitschrijvingen wegschrijven, en pas daarna berekenen wie waar hoort. Wie zich
 * gisteren uitschreef, valt zo in dezelfde ronde uit de lijsten in plaats van
 * eerst nog een keer geïmporteerd te worden.
 */
export async function reconcileMailingLists(): Promise<ReconcileOutcome> {
  if (!brevoEnabled()) return { skipped: true };
  const { lists } = await getBrevoListMap();
  const studyYear = currentStudyYear();

  // 1. Momentopname van Brevo. Een lijst die we niet konden lezen, prunen we
  //    ook niet: zonder inhoud weten we niet wie eruit moet.
  const snapshots = new Map<BrevoListKey, BrevoContact[]>();
  let failed = 0;
  for (const key of BREVO_LIST_KEYS) {
    try {
      snapshots.set(key, await listContacts(lists[key]));
    } catch {
      failed += 1;
    }
  }

  // 2. Uitschrijvingen terug naar de DB, voor we iets berekenen.
  const unsubscribed = await pullUnsubscribes(
    [...snapshots.values()].flat(),
    keysByListId(lists),
  );

  // 3. Enkel geschikte leden komen uit de DB; de rest hoort in geen lijst en
  //    wordt hieronder weggeprund waar Brevo ze nog kent.
  const users = await prisma.user.findMany({
    where: {
      active: true,
      studyConfirmedYear: studyYear,
      notStudying: false,
      mailUnsubscribedAt: null,
    },
    select: USER_SELECT,
  });

  // Gewenste contacten per lijst, ontdubbeld op adres.
  const desiredByList = new Map<string, Map<string, ImportContact>>();
  for (const key of BREVO_LIST_KEYS) desiredByList.set(key, new Map());
  for (const user of users) {
    const keys = desiredListKeys(user, studyYear);
    if (keys.length === 0) continue;
    const email = normalizeEmail(preferredEmail(user));
    const contact: ImportContact = { email, ext_id: user.id, attributes: contactAttributes(user) };
    for (const key of keys) desiredByList.get(key)!.set(email, contact);
  }

  let assignments = 0;
  let pruned = 0;
  for (const key of BREVO_LIST_KEYS) {
    const listId = lists[key];
    const desired = desiredByList.get(key)!;
    const snapshot = snapshots.get(key);
    try {
      if (desired.size > 0) {
        await importContactsToList(listId, [...desired.values()]);
        assignments += desired.size;
      }
      if (snapshot) {
        const toRemove = emailsToRemove(
          snapshot.map((c) => c.email),
          desired.keys(),
        );
        if (toRemove.length > 0) {
          await removeContactsFromList(listId, toRemove);
          pruned += toRemove.length;
        }
      }
    } catch {
      // Eén stukke lijst mag de andere niet tegenhouden; de route rapporteert het.
      failed += 1;
    }
  }

  return { lists: BREVO_LIST_KEYS.length, contacts: users.length, assignments, pruned, unsubscribed, failed };
}
