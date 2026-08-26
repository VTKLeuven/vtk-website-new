"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { createPasswordSetupForUser } from "@vtk/auth/server";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { isKuLeuvenEmail, parseAlumniPaste } from "@/lib/alumni";
import { brevoEnabled } from "@/lib/brevo/client";
import { syncAlumniToBrevo } from "@/lib/brevo/alumni";
import { sendAlumniPasswordSetupMail } from "@/lib/accountMail";

/** Beheer van het alumni-adresboek: toevoegen, bijwerken, uitschrijven, verwijderen. */

export type AlumniErrorCode =
  | "INVALID_INPUT"
  | "EMAIL_TAKEN"
  | "LINKED_TO_ACCOUNT"
  | "NOTHING_IMPORTED"
  | "BREVO_DISABLED"
  | "NO_PERSONAL_EMAIL"
  | "ACCOUNT_NOT_FOUND"
  | "MAIL_FAILED";

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

  // Heeft dit adres al een account, dan is een adresboekrij de verkeerde vorm:
  // die persoon houdt zijn eigen profiel bij, en twee rijen betekent vroeg of
  // laat twee mails. We zetten hem dan als alumnus in de mailinglijst en vullen
  // enkel aan wat nog leeg stond; wat hij zelf invulde blijft van hem.
  if (!parsed.data.id) {
    const account = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: data.email }, { personalEmail: data.email }],
      },
      select: { id: true, name: true, graduationYear: true, wasInVtk: true },
    });
    if (account) {
      await prisma.user.update({
        where: { id: account.id },
        data: {
          alumni: true,
          alumniMailOptIn: true,
          ...(account.graduationYear === null && data.graduationYear
            ? { graduationYear: data.graduationYear }
            : {}),
          ...(!account.wasInVtk && data.wasInVtk ? { wasInVtk: true } : {}),
        },
      });
      await logAudit({
        action: "update",
        entity: "user",
        entityId: account.id,
        target: account.name,
        summary: "als alumnus in de mailinglijst gezet vanuit het adresboek",
      });
      refresh();
      return saveError(
        "LINKED_TO_ACCOUNT",
        `${account.name} heeft al een account op dit adres. Die is nu als alumnus in de mailinglijst gezet; er is geen tweede rij in het adresboek gemaakt.`,
      );
    }
  }

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
 * Een account in of uit de alumni-mailinglijst zetten.
 *
 * Raakt bewust enkel `alumniMailOptIn` (en `alumni`, want zonder dat hoort hij
 * hier niet). Naam, afstudeerjaar en VTK-verleden blijven van het lid zelf: die
 * staan in zijn profiel en hij kan ze daar wijzigen.
 */
export async function toggleAlumniAccountOptInAction(formData: FormData): Promise<void> {
  await requirePermission("alumni.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { name: true, alumniMailOptIn: true },
  });
  if (!user) return;

  await prisma.user.update({
    where: { id },
    data: { alumni: true, alumniMailOptIn: !user.alumniMailOptIn },
  });

  await logAudit({
    action: "update",
    entity: "user",
    entityId: id,
    target: user.name,
    summary: user.alumniMailOptIn
      ? "uit de alumni-mailinglijst gehaald"
      : "in de alumni-mailinglijst gezet",
  });
  refresh();
}

/**
 * Stuurt een alumnus een eenmalige link om een wachtwoord in te stellen.
 *
 * Deze actie is bewust strenger dan het publieke "wachtwoord vergeten": de
 * beheerder kiest een concreet account, het account moet alumnus zijn en de mail
 * mag nooit naar KU Leuven gaan. Als er nog geen persoonlijk adres opgeslagen
 * is, bewaart dezelfde handeling het ingevoerde adres als voorkeursadres. Zo kan
 * iemand die zijn universiteitsaccount al kwijt is alsnog in één stap geholpen
 * worden.
 */
export async function sendAlumniAccessLinkAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("alumni.manage");
  const parsed = z
    .object({ id: z.string().min(1), email: z.string().trim().toLowerCase().email() })
    .safeParse({ id: formData.get("id") ?? "", email: formData.get("email") ?? "" });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies AlumniErrorCode);
  if (isKuLeuvenEmail(parsed.data.email)) {
    return saveError("NO_PERSONAL_EMAIL" satisfies AlumniErrorCode);
  }

  const user = await prisma.user.findFirst({
    where: { id: parsed.data.id, alumni: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      personalEmail: true,
      active: true,
    },
  });
  if (!user || !user.active) return saveError("ACCOUNT_NOT_FOUND" satisfies AlumniErrorCode);

  // Een persoonlijk adres dat al aan een ander account hangt, zou na het
  // instellen van het wachtwoord een dubbelzinnige login opleveren.
  const collision = await prisma.user.findFirst({
    where: {
      id: { not: user.id },
      deletedAt: null,
      OR: [
        { email: { equals: parsed.data.email, mode: "insensitive" } },
        { personalEmail: { equals: parsed.data.email, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (collision) return saveError("EMAIL_TAKEN" satisfies AlumniErrorCode);

  const changedEmail = user.personalEmail !== parsed.data.email && user.email !== parsed.data.email;
  if (changedEmail) {
    await prisma.user.update({
      where: { id: user.id },
      data: { personalEmail: parsed.data.email, emailPreference: "PERSONAL" },
    });
  }

  const reset = await createPasswordSetupForUser(user.id);
  if (!reset) return saveError("NO_PERSONAL_EMAIL" satisfies AlumniErrorCode);
  const sent = await sendAlumniPasswordSetupMail({
    to: reset.email,
    name: reset.name,
    token: reset.token,
    locale: reset.locale === "EN" ? "en" : "nl",
  });
  if (!sent) {
    if (changedEmail) refresh();
    return saveError("MAIL_FAILED" satisfies AlumniErrorCode);
  }

  await logAudit({
    action: "update",
    entity: "user",
    entityId: user.id,
    target: user.name,
    summary: changedEmail
      ? "persoonlijk adres bewaard en wachtwoordlink verstuurd"
      : "wachtwoordlink verstuurd naar persoonlijk adres",
  });
  refresh();
  return saveOk();
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

  // Adressen die al een account hebben, worden geen adresboekrij maar een
  // opt-in op dat account: twee rijen voor dezelfde persoon betekent vroeg of
  // laat twee mails.
  const accounts = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { email: { in: rows.map((row) => row.email) } },
        { personalEmail: { in: rows.map((row) => row.email) } },
      ],
    },
    select: { id: true, email: true, personalEmail: true },
  });
  const accountByEmail = new Map<string, string>();
  for (const account of accounts) {
    accountByEmail.set(account.email.toLowerCase(), account.id);
    if (account.personalEmail) accountByEmail.set(account.personalEmail.toLowerCase(), account.id);
  }

  let linked = 0;
  for (const row of rows) {
    const accountId = accountByEmail.get(row.email);
    if (accountId) {
      await prisma.user.update({
        where: { id: accountId },
        data: { alumni: true, alumniMailOptIn: true },
      });
      linked += 1;
      continue;
    }

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
    summary: [
      linked > 0 ? `${linked} gekoppeld aan een bestaand account` : null,
      invalid.length > 0 ? `${invalid.length} regel(s) overgeslagen` : null,
    ]
      .filter(Boolean)
      .join(", ") || undefined,
  });

  refresh();
  // De uitkomst hoort in de toast te staan: "3 toegevoegd, 1 overgeslagen" is
  // wat de beheerder wil weten, en dat kan de client niet zelf afleiden.
  if (invalid.length === 0 && linked === 0) return saveOk();
  return saveError(
    "PARTIAL_IMPORT",
    [
      `${rows.length - linked} in het adresboek gezet`,
      linked > 0 ? `${linked} gekoppeld aan een bestaand account` : null,
      invalid.length > 0
        ? `${invalid.length} overgeslagen (eerste fout op regel ${invalid[0]!.line})`
        : null,
    ]
      .filter(Boolean)
      .join(", ") + ".",
  );
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
