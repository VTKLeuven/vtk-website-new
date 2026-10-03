"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import {
  accountingCodeLabel,
  MAX_ACCOUNTING_NAME,
  parseMainCode,
  parseSubSuffix,
  subCode,
  subSuffix,
} from "@/lib/accounting/codes";

/** Foutcodes die /admin/boekhoudcodes zelf vertaalt. */
export type AccountingCodeErrorCode =
  | "NAME_REQUIRED"
  | "INVALID_CODE"
  | "INVALID_SUBCODE"
  | "INVALID_PARENT"
  | "CODE_EXISTS"
  | "NOT_FOUND"
  | "STALE_LIST";

function revalidate(): void {
  revalidatePath("/admin/boekhoudcodes");
  // De keuzelijsten die de codes tonen.
  revalidatePath("/admin/tickets", "layout");
  revalidatePath("/admin/leden");
}

function nameValue(formData: FormData): string {
  return String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_ACCOUNTING_NAME);
}

/** Een botsing op de unieke code is een verwachte invoerfout, geen serverfout. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type Tx = Prisma.TransactionClient;

/**
 * Zet `id` op de plaats waar ze volgens haar code hoort, tussen de codes met
 * dezelfde hoofdrekening (`parentId`), en nummert die opnieuw. "Volgens haar
 * code" is een gok: de penning kan de lijst intussen anders gesleept hebben.
 * Daarom vóór de eerste code die groter is, en niet achteraan; een nieuwe
 * 700105 belandt zo naast 700101 en niet onder 760000.
 */
async function placeByCode(tx: Tx, id: string, code: string, parentId: string | null): Promise<void> {
  const siblings = await tx.accountingCode.findMany({
    where: { parentId, id: { not: id } },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true },
  });
  const at = siblings.findIndex((sibling) => sibling.code.localeCompare(code) > 0);
  const ids = siblings.map((sibling) => sibling.id);
  ids.splice(at === -1 ? ids.length : at, 0, id);
  await renumber(tx, ids);
}

/** `sortOrder` volgens de volgorde van `ids`, enkel waar ze verandert. */
async function renumber(tx: Tx, ids: readonly string[]): Promise<void> {
  const current = await tx.accountingCode.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, sortOrder: true },
  });
  const orderById = new Map(current.map((row) => [row.id, row.sortOrder]));
  for (let index = 0; index < ids.length; index += 1) {
    if (orderById.get(ids[index]) === index) continue;
    await tx.accountingCode.update({ where: { id: ids[index] }, data: { sortOrder: index } });
  }
}

/**
 * Een nieuwe hoofdrekening (zes cijfers) of subcode (vijf cijfers achter een
 * hoofdrekening). Een subcode onder een subcode bestaat niet in het
 * rekeningstelsel, dus de hoofdrekening moet zelf een hoofdrekening zijn.
 */
export async function createAccountingCodeAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("accounting.manage");

  const name = nameValue(formData);
  if (!name) return saveError("NAME_REQUIRED" satisfies AccountingCodeErrorCode);
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const rawCode = String(formData.get("code") ?? "");

  let code: string;
  if (parentId) {
    const parent = await prisma.accountingCode.findUnique({
      where: { id: parentId },
      select: { code: true, parentId: true },
    });
    if (!parent || parent.parentId) return saveError("INVALID_PARENT" satisfies AccountingCodeErrorCode);
    const suffix = parseSubSuffix(rawCode, parent.code);
    if (!suffix) return saveError("INVALID_SUBCODE" satisfies AccountingCodeErrorCode);
    code = subCode(parent.code, suffix);
  } else {
    const main = parseMainCode(rawCode);
    if (!main) return saveError("INVALID_CODE" satisfies AccountingCodeErrorCode);
    code = main;
  }

  let created: { id: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const row = await tx.accountingCode.create({
        data: { code, name, parentId },
        select: { id: true },
      });
      await placeByCode(tx, row.id, code, parentId);
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return saveError("CODE_EXISTS" satisfies AccountingCodeErrorCode);
    throw error;
  }

  await logAudit({
    action: "create",
    entity: "accountingCode",
    entityId: created.id,
    target: accountingCodeLabel({ code, name }),
    summary: parentId ? "subcode toegevoegd" : "hoofdrekening toegevoegd",
  });
  revalidate();
  return saveOk();
}

/**
 * Naam en code aanpassen, en bij een subcode eventueel de hoofdrekening.
 * Verandert de code van een hoofdrekening, dan verhuizen haar subcodes mee:
 * hun code is de hoofdrekening plus hun eigen vijf cijfers. Verhuist een
 * subcode naar een andere hoofdrekening, dan komt ze daar op haar plaats
 * volgens code; slepen kan ze daarna verder schikken.
 *
 * Wat al verkocht is, verandert niet mee. Een bestelling bewaart de code en de
 * naam zoals ze in haar betaalinfo stonden, en een event dat deze code gekozen
 * heeft, gebruikt de nieuwe vanaf de volgende bestelling.
 */
export async function updateAccountingCodeAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("accounting.manage");

  const id = String(formData.get("id") ?? "");
  const name = nameValue(formData);
  if (!name) return saveError("NAME_REQUIRED" satisfies AccountingCodeErrorCode);
  const current = await prisma.accountingCode.findUnique({
    where: { id },
    include: {
      parent: { select: { code: true } },
      children: { select: { id: true, code: true } },
    },
  });
  if (!current) return saveError("NOT_FOUND" satisfies AccountingCodeErrorCode);

  const rawCode = String(formData.get("code") ?? "");
  let code: string;
  let parentId = current.parentId;
  if (current.parentId) {
    // Een subcode blijft een subcode; enkel de hoofdrekening mag wisselen.
    const requestedParentId = String(formData.get("parentId") ?? "").trim() || current.parentId;
    const parent =
      requestedParentId === current.parentId
        ? current.parent
        : await prisma.accountingCode.findFirst({
            where: { id: requestedParentId, parentId: null },
            select: { code: true },
          });
    if (!parent) return saveError("INVALID_PARENT" satisfies AccountingCodeErrorCode);
    const suffix = parseSubSuffix(rawCode, parent.code);
    if (!suffix) return saveError("INVALID_SUBCODE" satisfies AccountingCodeErrorCode);
    code = subCode(parent.code, suffix);
    parentId = requestedParentId;
  } else {
    const main = parseMainCode(rawCode);
    if (!main) return saveError("INVALID_CODE" satisfies AccountingCodeErrorCode);
    code = main;
  }
  const moved = parentId !== current.parentId;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.accountingCode.update({ where: { id }, data: { code, name, parentId } });
      if (code !== current.code) {
        for (const child of current.children) {
          await tx.accountingCode.update({
            where: { id: child.id },
            data: { code: subCode(code, subSuffix(child.code)) },
          });
        }
      }
      if (moved) await placeByCode(tx, id, code, parentId);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return saveError("CODE_EXISTS" satisfies AccountingCodeErrorCode);
    throw error;
  }

  const changes = [
    code !== current.code ? `code ${current.code} -> ${code}` : null,
    code !== current.code && current.children.length > 0
      ? `${current.children.length} subcode(s) mee hernummerd`
      : null,
    name !== current.name ? `naam "${current.name}" -> "${name}"` : null,
  ].filter(Boolean);
  await logAudit({
    action: "update",
    entity: "accountingCode",
    entityId: id,
    target: accountingCodeLabel({ code, name }),
    summary: changes.length > 0 ? changes.join(", ") : "niets gewijzigd",
  });
  revalidate();
  return saveOk();
}

/**
 * De volgorde na het slepen: `ids` zijn alle hoofdrekeningen (`parentId` leeg)
 * of alle subcodes van één hoofdrekening, in hun nieuwe volgorde.
 *
 * Een subcode die in een andere hoofdrekening neergezet wordt, verhuist mee en
 * krijgt de code van die hoofdrekening ervoor; het scherm vraagt dat eerst te
 * bevestigen. Een hoofdrekening wordt door slepen nooit een subcode, en
 * omgekeerd: dat zou haar code van lengte doen veranderen.
 */
export async function reorderAccountingCodesAction(input: {
  parentId: string | null;
  ids: string[];
}): Promise<SaveState> {
  await requirePermission("accounting.manage");

  const ids = [...new Set(input.ids)];
  const parent = input.parentId
    ? await prisma.accountingCode.findFirst({
        where: { id: input.parentId, parentId: null },
        select: { id: true, code: true },
      })
    : null;
  if (input.parentId && !parent) return saveError("INVALID_PARENT" satisfies AccountingCodeErrorCode);

  const rows = await prisma.accountingCode.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, name: true, parentId: true },
  });
  if (rows.length !== ids.length) return saveError("NOT_FOUND" satisfies AccountingCodeErrorCode);
  if (rows.some((row) => (row.parentId === null) !== (parent === null))) {
    return saveError("INVALID_PARENT" satisfies AccountingCodeErrorCode);
  }
  // Wie de lijst onvolledig doorstuurt (een tweede tabblad met een oudere
  // lijst), zou de rest achteraan laten staan; dan liever opnieuw laden.
  const siblings = await prisma.accountingCode.count({ where: { parentId: parent?.id ?? null } });
  const arriving = rows.filter((row) => row.parentId !== (parent?.id ?? null));
  if (siblings + arriving.length !== ids.length) {
    return saveError("STALE_LIST" satisfies AccountingCodeErrorCode);
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of arriving) {
        await tx.accountingCode.update({
          where: { id: row.id },
          data: { parentId: parent!.id, code: subCode(parent!.code, subSuffix(row.code)) },
        });
      }
      await renumber(tx, ids);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return saveError("CODE_EXISTS" satisfies AccountingCodeErrorCode);
    throw error;
  }

  for (const row of arriving) {
    const code = subCode(parent!.code, subSuffix(row.code));
    await logAudit({
      action: "update",
      entity: "accountingCode",
      entityId: row.id,
      target: accountingCodeLabel({ code, name: row.name }),
      summary: `verhuisd naar ${parent!.code}: code ${row.code} -> ${code}`,
    });
  }
  revalidate();
  return saveOk();
}

/**
 * Een code weghalen, met haar subcodes. Ticketverkopen die haar gekozen
 * hadden, staan daarna zonder code tot iemand een nieuwe kiest; verkochte
 * tickets houden de code waaronder ze betaald zijn.
 */
export async function deleteAccountingCodeAction(formData: FormData): Promise<SaveState> {
  await requirePermission("accounting.manage");

  const id = String(formData.get("id") ?? "");
  const current = await prisma.accountingCode.findUnique({
    where: { id },
    select: { code: true, name: true, _count: { select: { children: true } } },
  });
  if (!current) return saveError("NOT_FOUND" satisfies AccountingCodeErrorCode);

  await prisma.accountingCode.delete({ where: { id } });

  await logAudit({
    action: "delete",
    entity: "accountingCode",
    entityId: id,
    target: accountingCodeLabel(current),
    summary:
      current._count.children > 0
        ? `met ${current._count.children} subcode(s)`
        : null,
  });
  revalidate();
  return saveOk();
}
