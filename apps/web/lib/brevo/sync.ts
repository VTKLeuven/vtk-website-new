import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import {
  BREVO_LIST_KEYS,
  alternateEmail,
  contactAttributes,
  desiredListKeys,
  emailsToRemove,
  normalizeEmail,
  preferredEmail,
} from "./contacts";
import {
  addContactsToList,
  brevoEnabled,
  importContactsToList,
  listContactEmails,
  removeContactsFromList,
  upsertContact,
  type ImportContact,
} from "./client";
import { getBrevoListMap } from "./schema";

/**
 * De Brevo-synchronisatie zet de opt-in mailinglijsten van de site rechtstreeks
 * in Brevo, zonder de vroegere handmatige CSV-export/import. Volgt hetzelfde
 * stramien als de cudi-koppeling: een optionele integratie achter een env-key,
 * een real-time best-effort push bij elke profielwijziging, en een reconciliatie
 * als vangnet (zie de cron-route en `docs/design-decisions.md`).
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

export type SyncOutcome = { ok: boolean; skipped?: boolean; error?: string };

/**
 * Duw één lid naar Brevo (real-time, best-effort). Zet de contactattributen en
 * brengt het lijstlidmaatschap in lijn met {@link desiredListKeys}: toevoegen aan
 * de gewenste lijsten, verwijderen uit de rest. Het niet-gekozen mailadres wordt
 * uit alle lijsten gehaald, zodat een gewisselde mailvoorkeur geen dubbele
 * inschrijving op het oude adres achterlaat.
 *
 * Zonder `BREVO_KEY` gebeurt er niets (`skipped`). Fouten komen terug, ze worden
 * niet gegooid: een hapering bij Brevo mag het opslaan van een profiel niet
 * breken; de reconciliatie zet het later recht.
 */
export async function syncUserToBrevo(userId: string): Promise<SyncOutcome> {
  if (!brevoEnabled()) return { ok: true, skipped: true };
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!user) return { ok: false, error: "user not found" };

    const { lists } = await getBrevoListMap();
    const desired = new Set(desiredListKeys(user, currentWorkingYear()));
    const email = preferredEmail(user);
    const alt = alternateEmail(user);

    // Enkel wie in minstens één lijst hoort, houden we als contact bij; voor de
    // rest volstaat het ze uit elke lijst te verwijderen.
    if (desired.size > 0) {
      await upsertContact(email, user.id, contactAttributes(user));
    }

    for (const key of BREVO_LIST_KEYS) {
      const listId = lists[key];
      // Per lijst afgeschermd: Brevo geeft een 400 wanneer je een adres
      // verwijdert dat niet in de lijst zit (voor ons een no-op). Dat mag de
      // overige lijsten niet tegenhouden.
      await guard(desired.has(key) ? addContactsToList(listId, [email]) : removeContactsFromList(listId, [email]));
      if (alt) await guard(removeContactsFromList(listId, [alt]));
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type ReconcileOutcome =
  | { skipped: true }
  | { lists: number; contacts: number; assignments: number; pruned: number; failed: number };

/**
 * Vangnet: herbereken alle lijst-lidmaatschappen uit de DB en zet ze in Brevo
 * recht. Per lijst worden de gewenste contacten (bulk-)geïmporteerd (upsert +
 * attributen) en wordt geprund wie er niet meer in hoort. Dit vangt gemiste
 * real-time pushes én laat afvinken, van richting veranderen en afstuderen alsnog
 * doorwerken. Bedoeld voor een dagelijkse cron (zie de sync-route).
 */
export async function reconcileMailingLists(): Promise<ReconcileOutcome> {
  if (!brevoEnabled()) return { skipped: true };
  const { lists } = await getBrevoListMap();
  const workingYear = currentWorkingYear();

  // Enkel geschikte leden komen uit de DB; de rest hoort in geen lijst en wordt
  // hieronder weggeprund waar Brevo ze nog kent.
  const users = await prisma.user.findMany({
    where: { active: true, studyConfirmedYear: workingYear, notStudying: false },
    select: USER_SELECT,
  });

  // Gewenste contacten per lijst, ontdubbeld op adres.
  const desiredByList = new Map<string, Map<string, ImportContact>>();
  for (const key of BREVO_LIST_KEYS) desiredByList.set(key, new Map());
  for (const user of users) {
    const keys = desiredListKeys(user, workingYear);
    if (keys.length === 0) continue;
    const email = normalizeEmail(preferredEmail(user));
    const contact: ImportContact = { email, ext_id: user.id, attributes: contactAttributes(user) };
    for (const key of keys) desiredByList.get(key)!.set(email, contact);
  }

  let assignments = 0;
  let pruned = 0;
  let failed = 0;
  for (const key of BREVO_LIST_KEYS) {
    const listId = lists[key];
    const desired = desiredByList.get(key)!;
    try {
      if (desired.size > 0) {
        await importContactsToList(listId, [...desired.values()]);
        assignments += desired.size;
      }
      const current = await listContactEmails(listId);
      const toRemove = emailsToRemove(current, desired.keys());
      if (toRemove.length > 0) {
        await removeContactsFromList(listId, toRemove);
        pruned += toRemove.length;
      }
    } catch {
      // Eén stukke lijst mag de andere niet tegenhouden; de route rapporteert het.
      failed += 1;
    }
  }

  return { lists: BREVO_LIST_KEYS.length, contacts: users.length, assignments, pruned, failed };
}
