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
} from "@/lib/accounting/codes";

/** Foutcodes die /admin/boekhoudcodes zelf vertaalt. */
export type AccountingCodeErrorCode =
  | "NAME_REQUIRED"
  | "INVALID_CODE"
  | "INVALID_SUBCODE"
  | "INVALID_PARENT"
  | "CODE_EXISTS"
  | "NOT_FOUND";

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
    code = parent.code + suffix;
  } else {
    const main = parseMainCode(rawCode);
    if (!main) return saveError("INVALID_CODE" satisfies AccountingCodeErrorCode);
    code = main;
  }

  let created: { id: string };
  try {
    created = await prisma.accountingCode.create({
      data: { code, name, parentId },
      select: { id: true },
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
 * Naam en code aanpassen. Verandert de code van een hoofdrekening, dan
 * verhuizen haar subcodes mee: hun code is de hoofdrekening plus hun eigen vijf
 * cijfers.
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
  if (current.parent) {
    const suffix = parseSubSuffix(rawCode, current.parent.code);
    if (!suffix) return saveError("INVALID_SUBCODE" satisfies AccountingCodeErrorCode);
    code = current.parent.code + suffix;
  } else {
    const main = parseMainCode(rawCode);
    if (!main) return saveError("INVALID_CODE" satisfies AccountingCodeErrorCode);
    code = main;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.accountingCode.update({ where: { id }, data: { code, name } });
      if (code !== current.code) {
        for (const child of current.children) {
          await tx.accountingCode.update({
            where: { id: child.id },
            data: { code: code + child.code.slice(current.code.length) },
          });
        }
      }
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
