import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { listAlumniRecipients } from "@/lib/alumni";
import {
  brevoEnabled,
  clearUnsubscribe,
  createContactAttribute,
  createFolder,
  createList,
  findFolderByName,
  findListByName,
  getContact,
  getContactAttributeNames,
  importContactsToList,
  listContacts,
  removeContactsFromList,
} from "./client";
import { emailsToRemove } from "./contacts";
import { pullAlumniUnsubscribes } from "./unsubscribe";

/**
 * De alumni-lijst in Brevo.
 *
 * Bewust **naast** `BREVO_LIST_KEYS` en niet erin. Die lijsten worden elke nacht
 * gereconcilieerd tegen `desiredListKeys()`, dat enkel naar `User`-rijen kijkt en
 * per definitie geen enkele alumnus teruggeeft; zat de alumni-lijst in die set,
 * dan zou de reconciliatie ze elke nacht leegmaken. Dit is dezelfde folder, maar
 * een eigen lijst met een eigen sleutel en een eigen sync.
 *
 * De bron is `listAlumniRecipients()`: site-accounts met een alumni-opt-in plus
 * het handmatige adresboek, op e-mailadres ontdubbeld.
 */

const SETTING_KEY = "brevo.alumniList";
const FOLDER_NAME = "VTK Website";
const LIST_NAME = "VTK - Alumni";

/** Attribuut met het afstudeerjaar, zodat de alumniploeg per lichting kan segmenteren. */
const YEAR_ATTR = "GRADUATION_YEAR";
/** Attribuut "zat ooit in VTK"; een reünie van oud-praesidia is een ander publiek. */
const VTK_ATTR = "WAS_IN_VTK";

type StoredAlumniList = { listId?: number; schemaReady?: boolean };

async function readStored(): Promise<StoredAlumniList | null> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  return (row?.value ?? null) as StoredAlumniList | null;
}

/**
 * Zorgt dat de lijst en de twee attributen bestaan, en onthoudt het lijst-ID.
 * Idempotent en op naam gematcht, net als `ensureBrevoSchema`: een bestaande
 * folder of lijst wordt hergebruikt in plaats van gedupliceerd.
 */
export async function ensureAlumniList(force = false): Promise<number> {
  const stored = await readStored();
  if (!force && stored?.listId && stored.schemaReady) return stored.listId;

  const folderId = (await findFolderByName(FOLDER_NAME)) ?? (await createFolder(FOLDER_NAME));
  const listId =
    stored?.listId ??
    (await findListByName(folderId, LIST_NAME)) ??
    (await createList(LIST_NAME, folderId));

  const existing = await getContactAttributeNames();
  if (!existing.has(YEAR_ATTR)) await createContactAttribute(YEAR_ATTR, "text");
  if (!existing.has(VTK_ATTR)) await createContactAttribute(VTK_ATTR, "boolean");

  const value: StoredAlumniList = { listId, schemaReady: true };
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });

  return listId;
}

export type AlumniSyncResult =
  | { skipped: "disabled" }
  | { imported: number; removed: number; unsubscribed: number };

/**
 * Duwt het volledige adresboek naar Brevo en haalt eruit wie er niet meer in
 * hoort (uitgeschreven, verwijderd, of een account dat zijn opt-in afvinkte).
 *
 * Volledig en niet incrementeel: de lijst is klein genoeg om in één keer te
 * doen, en een incrementele sync die één keer een verwijdering mist, blijft die
 * fout voor altijd meedragen.
 *
 * Eerst lezen, dan schrijven, net als bij de studentenlijsten: wie op de
 * uitschrijflink klikte, staat als `unsubscribedAt` (adresboek) of met de opt-in
 * af (account) in de DB voor we het adresboek opnieuw naar Brevo duwen. Anders
 * zou de import van vanavond de uitschrijving van vanmorgen overschrijven.
 */
export async function syncAlumniToBrevo(): Promise<AlumniSyncResult> {
  if (!brevoEnabled()) return { skipped: "disabled" };

  const listId = await ensureAlumniList();
  const current = await listContacts(listId);
  const unsubscribed = await pullAlumniUnsubscribes(current, listId);
  const recipients = await listAlumniRecipients();

  if (recipients.length > 0) {
    await importContactsToList(
      listId,
      recipients.map((r) => ({
        email: r.email,
        // Geen `user.id` beschikbaar voor een adresboek-rij; het adres is hier
        // de sleutel, en dat is ook wat Brevo zelf als identiteit gebruikt.
        ext_id: r.email.toLowerCase(),
        attributes: {
          FIRSTNAME: r.firstname,
          LASTNAME: r.lastname,
          [YEAR_ATTR]: r.graduationYear ? String(r.graduationYear) : "",
          [VTK_ATTR]: r.wasInVtk,
        },
      })),
    );
  }

  const stale = emailsToRemove(
    current.map((c) => c.email),
    recipients.map((r) => r.email),
  );
  if (stale.length > 0) await removeContactsFromList(listId, stale);

  return { imported: recipients.length, removed: stale.length, unsubscribed };
}

/**
 * Draait een uitschrijving in Brevo terug voor één alumnusadres, nadat een
 * beheerder (of het lid zelf) het weer inschreef. Best-effort en na de response:
 * lukt het niet, dan staat de site alvast juist en blijft Brevo achter, wat de
 * volgende sync niet oplost. Zie `clearUnsubscribe` voor waarom loskoppelen de
 * enige manier is om een lijst-uitschrijving te wissen.
 */
export async function resubscribeAlumnusInBrevo(email: string): Promise<void> {
  if (!brevoEnabled()) return;
  try {
    const listId = await ensureAlumniList();
    const contact = await getContact(email);
    const stuck = contact?.listUnsubscribed.includes(listId) ? [listId] : [];
    await clearUnsubscribe(email, stuck);
  } catch {
    /* best-effort */
  }
}

export { SETTING_KEY as BREVO_ALUMNI_SETTING_KEY, LIST_NAME as BREVO_ALUMNI_LIST_NAME };
