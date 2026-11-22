"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { describeChanges, logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { brusselsToday, requireCashRegisterAccess } from "@/lib/kassas/server";
import { cashBookKindLabel, isCashBookKind, needsInvoice } from "@/lib/kassas/cashBook";
import {
  formatEuro,
  parseAmountToCents,
  parseDateInput,
  RECEIPT_PREFIX,
  workingYearOf,
} from "@/lib/rekeningen/expenses";

/**
 * Het kasboek van Beheer: stortingen, afhalingen en aankopen met cash. Enkel
 * voor wie de kassa's beheert. Zie docs/design-decisions.md, "Het kasboek van
 * Beheer".
 */

const PATHS = ["/admin/kassas/kasboek", "/en/admin/kassas/kasboek"];

function revalidateCashBook(id?: string) {
  for (const path of PATHS) {
    revalidatePath(path);
    if (id) revalidatePath(`${path}/${id}`);
  }
}

function text(formData: FormData, name: string, max = 200): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function requireManager() {
  const access = await requireCashRegisterAccess();
  if (!access.canManage) throw new Error("FORBIDDEN");
  return access;
}

/** Een nieuwe regel, of een bestaande aanpassen (`id`). */
export async function saveCashBookEntryAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const access = await requireManager();
  const id = text(formData, "id", 40) || null;

  const kind = text(formData, "kind", 20);
  if (!isCashBookKind(kind)) return saveError("INVALID_INPUT");

  const date = parseDateInput(text(formData, "date", 10));
  if (!date) return saveError("BAD_DATE");
  if (date.getTime() > brusselsToday().getTime()) return saveError("FUTURE_DATE");

  const amountCents = parseAmountToCents(text(formData, "amount", 20));
  if (amountCents === null || amountCents <= 0) return saveError("BAD_AMOUNT");

  const description = text(formData, "description", 200);
  if (!description) return saveError("MISSING_DESCRIPTION");
  const note = text(formData, "note", 2000) || null;

  const existing = id ? await prisma.cashBookEntry.findUnique({ where: { id } }) : null;
  if (id && !existing) return saveError("NOT_FOUND");

  // De factuur: een nieuwe key van onze eigen uploadroute, of leeg = laat
  // staan wat er hing. Enkel een key onder `bonnetjes/`, zoals bij de
  // rekeningen: een ander pad zou een willekeurig object aan de regel hangen.
  const newKey = text(formData, "receiptKey", 200);
  if (newKey && !newKey.startsWith(RECEIPT_PREFIX)) return saveError("MISSING_INVOICE");
  const replaceInvoice = Boolean(newKey) && newKey !== existing?.invoiceKey;
  const invoice = replaceInvoice
    ? {
        invoiceKey: newKey,
        invoiceName: text(formData, "receiptName", 200) || "factuur",
        invoiceMime: text(formData, "receiptMime", 100) || "application/octet-stream",
        invoiceSize: Math.max(0, Math.round(Number(text(formData, "receiptSize", 20)) || 0)),
      }
    : {};
  const hasInvoice = replaceInvoice || Boolean(existing?.invoiceKey);
  if (needsInvoice(kind) && !hasInvoice) return saveError("MISSING_INVOICE");

  const data = {
    kind,
    date,
    workingYear: workingYearOf(date),
    amountCents,
    description,
    note,
    ...invoice,
  };

  const saved = existing
    ? await prisma.cashBookEntry.update({ where: { id: existing.id }, data })
    : await prisma.cashBookEntry.create({ data: { ...data, createdById: access.session.user.id } });

  if (replaceInvoice && existing?.invoiceKey) {
    // Pas na een geslaagde update: faalt die, dan hangt de regel nog aan de oude.
    await deleteObject(existing.invoiceKey).catch((error) =>
      console.error("[kasboek] oude factuur niet verwijderd", error),
    );
  }

  await logAudit({
    action: existing ? "update" : "create",
    entity: "cashBookEntry",
    entityId: saved.id,
    target: `${cashBookKindLabel(kind, true)} · ${description}`,
    summary: existing
      ? (describeChanges(existing, data, {
          kind: "soort",
          date: "datum",
          amountCents: "bedrag",
          description: "omschrijving",
          note: "opmerking",
          invoiceKey: "factuur",
        }) ?? null)
      : formatEuro(amountCents),
  });

  revalidateCashBook(saved.id);
  return saveOk();
}

/** Verwijdert de regel én haar factuur uit de opslag. */
export async function deleteCashBookEntryAction(formData: FormData): Promise<SaveState> {
  await requireManager();
  const id = text(formData, "id", 40);
  const existing = await prisma.cashBookEntry.findUnique({ where: { id } });
  if (!existing) return saveError("NOT_FOUND");

  await prisma.cashBookEntry.delete({ where: { id } });
  if (existing.invoiceKey) {
    await deleteObject(existing.invoiceKey).catch((error) =>
      console.error("[kasboek] factuur niet verwijderd", error),
    );
  }

  await logAudit({
    action: "delete",
    entity: "cashBookEntry",
    entityId: id,
    target: `${cashBookKindLabel(existing.kind, true)} · ${existing.description}`,
    summary: formatEuro(existing.amountCents),
  });

  revalidateCashBook();
  // De pagina van de regel bestaat niet meer: terug naar het jaar waarin ze stond.
  // Buiten elke try/catch, want `redirect()` werkt met een throw.
  const base = formData.get("locale") === "en" ? "/en" : "";
  redirect(`${base}/admin/kassas/kasboek?jaar=${existing.workingYear}`);
}
