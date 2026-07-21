import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { STUDY_PROGRAMMES, STUDY_YEARS } from "@/lib/profile";
import {
  ALL_STUDENTS_KEY,
  BREVO_LIST_KEYS,
  programmeAttr,
  yearAttr,
  type BrevoListKey,
} from "./contacts";
import {
  createContactAttribute,
  createFolder,
  createList,
  findFolderByName,
  findListByName,
  getContactAttributeNames,
} from "./client";

/**
 * Zorgt dat de door de site beheerde Brevo-structuur bestaat (één folder, één
 * lijst per categorie, en de studie-attributen) en onthoudt de aangemaakte
 * lijst-ID's in de `Setting`-tabel. Zo hoeven `sync.ts` en de reconciliatie de
 * lijsten niet elke keer op naam op te zoeken.
 *
 * Alles is idempotent en op naam gematcht: bestaat de folder of lijst al (ook als
 * ze ooit handmatig is aangemaakt), dan hergebruiken we die i.p.v. te dupliceren.
 */

const SETTING_KEY = "brevo.lists";
const FOLDER_NAME = "VTK Website";

/** Interne Brevo-lijstnamen. Vast (niet vertaald): dit is admin-plumbing in Brevo. */
const LIST_LABELS: Record<BrevoListKey, string> = {
  [ALL_STUDENTS_KEY]: "VTK - Alle studenten",
  FEEST: "VTK - Feest",
  CAREER: "VTK - Career",
  SPORT: "VTK - Sport",
  EVENEMENTEN: "VTK - Evenementen",
  ONDERWIJS: "VTK - Onderwijs",
  INTERNATIONAAL: "VTK - Internationaal",
  EERSTEJAARS: "VTK - Eerstejaars",
  BAKSKE: "VTK - Bakske",
};

export type BrevoListMap = { folderId: number; lists: Record<BrevoListKey, number> };

type StoredBrevo = {
  folderId?: number;
  lists?: Partial<Record<BrevoListKey, number>>;
  schemaReady?: boolean;
};

async function readStored(): Promise<StoredBrevo | null> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  return (row?.value ?? null) as StoredBrevo | null;
}

function isComplete(v: StoredBrevo | null): v is StoredBrevo & BrevoListMap {
  if (!v?.folderId || !v.lists || !v.schemaReady) return false;
  return BREVO_LIST_KEYS.every((k) => typeof v.lists?.[k] === "number");
}

/**
 * Bouwt (of leest) de folder + lijsten + attributen en bewaart de mapping.
 * Idempotent: is alles al klaar, dan is dit één DB-read. `force` negeert de cache
 * en heropbouwt (bv. na handmatig wissen van de Setting-rij).
 */
export async function ensureBrevoSchema(force = false): Promise<BrevoListMap> {
  const stored = await readStored();
  if (!force && isComplete(stored)) {
    return { folderId: stored.folderId, lists: stored.lists as Record<BrevoListKey, number> };
  }

  const folderId = (await findFolderByName(FOLDER_NAME)) ?? (await createFolder(FOLDER_NAME));

  const lists: Partial<Record<BrevoListKey, number>> = { ...(stored?.lists ?? {}) };
  for (const key of BREVO_LIST_KEYS) {
    if (typeof lists[key] === "number") continue;
    const name = LIST_LABELS[key];
    lists[key] = (await findListByName(folderId, name)) ?? (await createList(name, folderId));
  }

  // FIRSTNAME/LASTNAME zijn Brevo-defaults; enkel de studie-booleans maken we aan.
  const existing = await getContactAttributeNames();
  const needed = [
    ...STUDY_YEARS.map((y) => yearAttr(y)),
    ...STUDY_PROGRAMMES.map((p) => programmeAttr(p)),
  ];
  for (const name of needed) {
    if (!existing.has(name)) await createContactAttribute(name, "boolean");
  }

  const value: StoredBrevo = { folderId, lists, schemaReady: true };
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });

  return { folderId, lists: lists as Record<BrevoListKey, number> };
}

/** De lijst-ID-mapping; provisioneert bij de eerste keer. */
export async function getBrevoListMap(): Promise<BrevoListMap> {
  return ensureBrevoSchema(false);
}

export { SETTING_KEY as BREVO_SETTING_KEY };
