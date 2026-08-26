"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { parseAlumniPaste } from "@/lib/alumni";
import { brevoEnabled } from "@/lib/brevo/client";
import { syncAlumniToBrevo } from "@/lib/brevo/alumni";

/** Beheer van het alumni-adresboek: toevoegen, bijwerken, uitschrijven, verwijderen. */

export type AlumniErrorCode =
  | "INVALID_INPUT"
  | "EMAIL_TAKEN"
  | "NOTHING_IMPORTED"
  | "BREVO_DISABLED";

const MIN_GRADUATION_YEAR = 1920;

const yearField = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    if (!/^\d{4}$/.test(v)) return false;
    const year = Number(v);
    return year >= MIN_GRADUATION_YEAR && year <= new Date().getFullYear() + 1;
  })
  .default("");

const contactSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  graduationYear: yearField,
  wasInVtk: z.boolean().default(false),
  note: z.string().trim().max(500).default(""),
});

function refresh() {
  revalidatePath("/admin/alumni");
}

export async function saveAlumniContactAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("alumni.manage");
  const parsed = contactSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    graduationYear: formData.get("graduationYear") ?? "",
    wasInVtk: formData.get("wasInVtk") === "on",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies AlumniErrorCode);

  const data = {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    graduationYear: parsed.data.graduationYear ? Number(parsed.data.graduationYear) : null,
    wasInVtk: parsed.data.wasInVtk,
    note: parsed.data.note || null,
  };

  try {
    if (parsed.data.id) {
      await prisma.alumniContact.update({ where: { id: parsed.data.id }, data });
    } else {
      await prisma.alumniContact.create({ data: { ...data, createdById: session.user.id } });
    }
  } catch (err) {
    // Het adres is uniek: twee keer dezelfde alumnus invoeren is een invoerfout,
    // geen serverfout.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      String(err.meta?.target ?? "").includes("email")
    ) {
      return saveError("EMAIL_TAKEN" satisfies AlumniErrorCode);
    }
    throw err;
  }

  await logAudit({
    action: parsed.data.id ? "update" : "create",
    entity: "alumniContact",
    entityId: parsed.data.id ?? null,
    target: `${data.firstName} ${data.lastName}`,
    summary: data.graduationYear ? `lichting ${data.graduationYear}` : undefined,
  });

  refresh();
  return saveOk();
}

/**
 * Verwijderen is echt verwijderen; uitschrijven is dat níét.
 *
 * Wie zich uitschrijft blijft in de tabel staan met een `unsubscribedAt`, precies
 * zodat de volgende import van een oude lijst hem niet stilletjes weer toevoegt.
 * Verwijderen is er voor een tikfout of een dubbele rij.
 */
export async function deleteAlumniContactAction(formData: FormData): Promise<void> {
  await requirePermission("alumni.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await prisma.alumniContact.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  await prisma.alumniContact.delete({ where: { id } });

  await logAudit({
    action: "delete",
    entity: "alumniContact",
    entityId: id,
    target: existing ? `${existing.firstName} ${existing.lastName}` : id,
  });
  refresh();
}

export async function toggleAlumniSubscriptionAction(formData: FormData): Promise<void> {
  await requirePermission("alumni.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await prisma.alumniContact.findUnique({
    where: { id },
    select: { unsubscribedAt: true, firstName: true, lastName: true },
  });
  if (!existing) return;

  await prisma.alumniContact.update({
    where: { id },
    data: { unsubscribedAt: existing.unsubscribedAt ? null : new Date() },
  });

  await logAudit({
    action: "update",
    entity: "alumniContact",
    entityId: id,
    target: `${existing.firstName} ${existing.lastName}`,
    summary: existing.unsubscribedAt ? "opnieuw ingeschreven" : "uitgeschreven",
  });
  refresh();
}

/**
 * Een geplakte lijst invoeren.
 *
 * Zonder dit is een adresboek van vijfhonderd alumni een middag typen, en dan
 * gebeurt het gewoon niet. Bestaande adressen worden bijgewerkt in plaats van
 * geweigerd: wie dezelfde lijst twee keer plakt, hoort geen vijfhonderd fouten
 * te krijgen. Een uitgeschreven contact blijft uitgeschreven; een import mag die
 * keuze niet terugdraaien.
 */
export async function importAlumniAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("alumni.manage");
  const text = String(formData.get("paste") ?? "");
  const { rows, invalid } = parseAlumniPaste(text);

  if (rows.length === 0) {
    return saveError(
      "NOTHING_IMPORTED" satisfies AlumniErrorCode,
      invalid.length > 0
        ? `Geen enkele regel was bruikbaar. De eerste fout staat op regel ${invalid[0]!.line}: "${invalid[0]!.text.slice(0, 60)}".`
        : undefined,
    );
  }

  for (const row of rows) {
    await prisma.alumniContact.upsert({
      where: { email: row.email },
      update: {
        firstName: row.firstName,
        lastName: row.lastName,
        graduationYear: row.graduationYear,
        wasInVtk: row.wasInVtk,
      },
      create: {
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        graduationYear: row.graduationYear,
        wasInVtk: row.wasInVtk,
        createdById: session.user.id,
      },
    });
  }

  await logAudit({
    action: "create",
    entity: "alumniContact",
    target: `${rows.length} alumni`,
    summary: invalid.length > 0 ? `${invalid.length} regel(s) overgeslagen` : undefined,
  });

  refresh();
  // De uitkomst hoort in de toast te staan: "3 toegevoegd, 1 overgeslagen" is
  // wat de beheerder wil weten, en dat kan de client niet zelf afleiden.
  return invalid.length > 0
    ? saveError(
        "PARTIAL_IMPORT",
        `${rows.length} ingevoerd, ${invalid.length} overgeslagen (eerste fout op regel ${invalid[0]!.line}).`,
      )
    : saveOk();
}

/** Handmatige duw naar Brevo, zoals de knop bij de gewone mailinglijsten. */
export async function syncAlumniAction(): Promise<SaveState> {
  await requirePermission("alumni.manage");
  if (!brevoEnabled()) return saveError("BREVO_DISABLED" satisfies AlumniErrorCode);

  const result = await syncAlumniToBrevo();
  if ("skipped" in result) return saveError("BREVO_DISABLED" satisfies AlumniErrorCode);

  await logAudit({
    action: "sync",
    entity: "alumniContact",
    target: "Brevo-alumnilijst",
    summary: `${result.imported} contacten geduwd, ${result.removed} verwijderd`,
  });

  refresh();
  return saveOk();
}
