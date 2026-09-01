"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { sendMail, smtpConfigured } from "@vtk/mail";
import { requirePermission } from "@/lib/session";
import { describeChanges, logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import {
  canEdit,
  canManageState,
  canView,
  EXPENSE_CONFIG_KEY,
  getExpenseConfig,
  requireExpenseAccess,
} from "@/lib/rekeningen/server";
import { buildExpenseReportPdf } from "@/lib/rekeningen/report";
import {
  expenseMailDraft,
  formatEuro,
  isValidIban,
  normaliseIban,
  parseAmountToCents,
  parseDateInput,
  RECEIPT_PREFIX,
  workingYearOf,
} from "@/lib/rekeningen/expenses";

const ADMIN_PATHS = ["/admin/rekeningen", "/en/admin/rekeningen"];

/** Beide talen én elk tabblad: de lijst, mijn rekeningen en het formulier. */
function revalidateExpenses() {
  for (const path of ADMIN_PATHS) {
    revalidatePath(path);
    revalidatePath(`${path}/mijn`);
    revalidatePath(`${path}/indienen`);
    revalidatePath(`${path}/instellingen`);
  }
}

function text(formData: FormData, name: string, max = 200): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// -----------------------------------------------------------------------------
// Indienen en bewerken
// -----------------------------------------------------------------------------

type ParsedFields = {
  groupId: string | null;
  postLabel: string;
  payerName: string;
  activity: string;
  description: string;
  spentOn: Date;
  amountCents: number;
  paymentMethod: "VTK_CARD" | "PERSONAL";
  iban: string | null;
};

/**
 * Valideert de velden die indienen en bewerken delen.
 *
 * Geeft een `SaveState` terug bij een invoerfout in plaats van te gooien: een
 * verkeerd IBAN of een leeg bedrag is een verwachte fout en hoort een rode toast
 * te geven, geen error boundary (zie CLAUDE.md).
 */
async function parseFields(formData: FormData): Promise<ParsedFields | SaveState> {
  const groupId = text(formData, "groupId", 40) || null;
  const payerName = text(formData, "payerName", 120);
  const activity = text(formData, "activity", 160);
  const description = text(formData, "description", 200);
  const paymentMethodRaw = text(formData, "paymentMethod", 20);

  if (!payerName || !activity || !description) return saveError("MISSING_FIELD");
  if (paymentMethodRaw !== "VTK_CARD" && paymentMethodRaw !== "PERSONAL") {
    return saveError("MISSING_FIELD");
  }
  const paymentMethod = paymentMethodRaw;

  const spentOn = parseDateInput(text(formData, "spentOn", 10));
  if (!spentOn) return saveError("BAD_DATE");
  // Een bonnetje van volgende maand bestaat niet; dat is een tikfout in het jaar.
  if (spentOn.getTime() > Date.now() + 86_400_000) return saveError("FUTURE_DATE");

  const amountCents = parseAmountToCents(text(formData, "amount", 20));
  if (amountCents === null) return saveError("BAD_AMOUNT");

  let iban: string | null = null;
  if (paymentMethod === "PERSONAL") {
    const raw = text(formData, "iban", 40);
    if (!raw) return saveError("MISSING_IBAN");
    if (!isValidIban(raw)) return saveError("BAD_IBAN");
    iban = normaliseIban(raw);
  }

  // De postnaam wordt vastgeklikt zoals ze nu heet: ze gaat mee op het blad naar
  // de boekhouder, en die map mag niet veranderen als de post hernoemt.
  let postLabel = "";
  if (groupId) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { nameNl: true },
    });
    if (!group) return saveError("BAD_POST");
    postLabel = group.nameNl;
  } else {
    postLabel = text(formData, "postLabel", 80);
    if (!postLabel) return saveError("BAD_POST");
  }

  return {
    groupId,
    postLabel,
    payerName,
    activity,
    description,
    spentOn,
    amountCents,
    paymentMethod,
    iban,
  };
}

/** Een nieuwe rekening met haar bonnetje. */
export async function submitExpenseAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await requireExpenseAccess();
  if (!access.canSubmit) return saveError("FORBIDDEN");

  const parsed = await parseFields(formData);
  if ("status" in parsed) return parsed;

  const receiptKey = text(formData, "receiptKey", 200);
  const receiptName = text(formData, "receiptName", 200);
  const receiptMime = text(formData, "receiptMime", 100);
  const receiptSize = Number(text(formData, "receiptSize", 20));

  if (!receiptKey || !receiptName || !receiptMime || !Number.isFinite(receiptSize)) {
    return saveError("MISSING_RECEIPT");
  }
  // Enkel een key die onze eigen uploadroute net geschreven heeft; een pad uit
  // een ander prefix zou een willekeurig object aan een rekening hangen.
  if (!receiptKey.startsWith(RECEIPT_PREFIX)) return saveError("MISSING_RECEIPT");

  const created = await prisma.expense.create({
    data: {
      ...parsed,
      workingYear: workingYearOf(parsed.spentOn),
      submittedById: access.session.user.id,
      receiptKey,
      receiptName,
      receiptMime,
      receiptSize: Math.max(0, Math.round(receiptSize)),
      // Met de kaart van VTK is er niets terug te betalen. Zo blijft de lijst
      // "terug te betalen" precies het geld dat nog ergens naartoe moet.
      paidAt: parsed.paymentMethod === "VTK_CARD" ? new Date() : null,
    },
  });

  await logAudit({
    action: "create",
    entity: "expense",
    entityId: created.id,
    target: `${parsed.postLabel} · ${parsed.description}`,
    summary: `${formatEuro(parsed.amountCents)} · ${
      parsed.paymentMethod === "VTK_CARD" ? "kaart VTK" : "persoonlijk"
    }`,
  });

  revalidateExpenses();
  return saveOk();
}

/** Een bestaande rekening bijwerken. Het bonnetje mag mee vervangen worden. */
export async function updateExpenseAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await requireExpenseAccess();
  const id = text(formData, "id", 40);
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return saveError("NOT_FOUND");
  if (!canEdit(access, existing)) return saveError("LOCKED");

  const parsed = await parseFields(formData);
  if ("status" in parsed) return parsed;

  // Een nieuw bonnetje is optioneel: leeg betekent "laat staan wat er stond",
  // niet "gooi het bonnetje weg" (zelfde redenering als `readImageField`).
  const newKey = text(formData, "receiptKey", 200);
  const replaceReceipt = Boolean(newKey) && newKey !== existing.receiptKey;
  if (newKey && !newKey.startsWith(RECEIPT_PREFIX)) return saveError("MISSING_RECEIPT");

  const data = {
    ...parsed,
    workingYear: workingYearOf(parsed.spentOn),
    ...(replaceReceipt
      ? {
          receiptKey: newKey,
          receiptName: text(formData, "receiptName", 200) || existing.receiptName,
          receiptMime: text(formData, "receiptMime", 100) || existing.receiptMime,
          receiptSize: Math.max(0, Math.round(Number(text(formData, "receiptSize", 20)) || 0)),
        }
      : {}),
  };

  await prisma.expense.update({ where: { id }, data });

  if (replaceReceipt) {
    // Pas wissen na een geslaagde update: faalt de update, dan hangt de rekening
    // nog aan het oude bonnetje en moet dat er nog zijn.
    await deleteObject(existing.receiptKey).catch((error) =>
      console.error("[rekeningen] oud bonnetje niet verwijderd", error),
    );
  }

  await logAudit({
    action: "update",
    entity: "expense",
    entityId: id,
    target: `${parsed.postLabel} · ${parsed.description}`,
    summary:
      describeChanges(existing, data, {
        postLabel: "post",
        payerName: "wie betaalde",
        activity: "activiteit",
        description: "omschrijving",
        spentOn: "datum",
        amountCents: "bedrag",
        paymentMethod: "betaalwijze",
        iban: "IBAN",
        receiptKey: "bonnetje",
      }) ?? null,
  });

  revalidateExpenses();
  return saveOk();
}

/** Verwijdert de rekening én haar bonnetje uit de opslag. */
export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const access = await requireExpenseAccess();
  const id = text(formData, "id", 40);
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return;
  if (!canEdit(access, existing)) throw new Error("FORBIDDEN");

  await prisma.expense.delete({ where: { id } });
  await deleteObject(existing.receiptKey).catch((error) =>
    console.error("[rekeningen] bonnetje niet verwijderd", error),
  );

  await logAudit({
    action: "delete",
    entity: "expense",
    entityId: id,
    target: `${existing.postLabel} · ${existing.description}`,
    summary: formatEuro(existing.amountCents),
  });

  revalidateExpenses();
}

// -----------------------------------------------------------------------------
// Terugbetalen en inboeken
// -----------------------------------------------------------------------------

type StateField = "paid" | "booked";

/**
 * Zet één van de twee vinkjes aan of uit. Enkel volledig beheer: dit gaat over
 * geld dat vertrok en over wat de boekhouder bevestigde.
 */
export async function setExpenseStateAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await requireExpenseAccess();
  if (!canManageState(access)) return saveError("FORBIDDEN");

  const id = text(formData, "id", 40);
  const field = text(formData, "field", 10) as StateField;
  const on = text(formData, "value", 5) === "1";
  if (field !== "paid" && field !== "booked") return saveError("INVALID_INPUT");

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return saveError("NOT_FOUND");

  const now = new Date();
  const userId = access.session.user.id;
  const data =
    field === "paid"
      ? { paidAt: on ? now : null, paidById: on ? userId : null }
      : { bookedAt: on ? now : null, bookedById: on ? userId : null };

  await prisma.expense.update({ where: { id }, data });

  await logAudit({
    action: "update",
    entity: "expense",
    entityId: id,
    target: `${existing.postLabel} · ${existing.description}`,
    summary: `${field === "paid" ? "terugbetaald" : "ingeboekt"} ${on ? "aangevinkt" : "uitgevinkt"}`,
  });

  revalidateExpenses();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Doorsturen naar de boekhouding
// -----------------------------------------------------------------------------

/**
 * Mailt het ingevulde blad naar de boekhouder, met het bonnetje erin.
 *
 * De ontvanger komt uit de instellingen maar staat als veld in het venster, want
 * af en toe moet er één blad naar iemand anders. `rotate` is de draaiing die in
 * het voorbeeld gekozen werd, zodat de bijlage precies is wat je zag.
 */
export async function sendExpenseAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await requireExpenseAccess();
  if (!canManageState(access)) return saveError("FORBIDDEN");

  const id = text(formData, "id", 40);
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) return saveError("NOT_FOUND");
  if (!canView(access, expense)) return saveError("FORBIDDEN");

  const config = await getExpenseConfig();
  const to = (text(formData, "to", 200) || config.accountantEmail).trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return saveError("BAD_EMAIL");

  // Zonder mailserver geeft `sendMail` gewoon `true` terug en logt hij enkel.
  // Dan "verstuurd" melden en `sentAt` zetten zou een blad afvinken dat nooit
  // vertrok; zie de waarschuwing in `@vtk/mail`.
  if (!smtpConfigured()) return saveError("NO_SMTP");

  const rotate = Number(text(formData, "rotate", 10)) || 0;
  const { bytes, filename } = await buildExpenseReportPdf(expense, rotate);

  // Dezelfde opsteller als het voorbeeldvenster in het beheer; zie
  // `expenseMailDraft` in lib/rekeningen/expenses.ts.
  const { subject, body } = expenseMailDraft(expense);

  const sent = await sendMail({
    to,
    from: config.fromEmail || undefined,
    subject,
    text: body,
    attachments: [
      { filename, content: Buffer.from(bytes), contentType: "application/pdf" },
    ],
  });
  if (!sent) return saveError("SEND_FAILED");

  await prisma.expense.update({
    where: { id },
    data: { sentAt: new Date(), sentTo: to },
  });

  await logAudit({
    action: "send",
    entity: "expense",
    entityId: id,
    target: `${expense.postLabel} · ${expense.description}`,
    summary: `blad verstuurd naar ${to}`,
  });

  revalidateExpenses();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Instellingen
// -----------------------------------------------------------------------------

export async function saveExpenseSettingsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("expenses.manage");

  const accountantEmail = text(formData, "accountantEmail", 200);
  const fromEmail = text(formData, "fromEmail", 200);
  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (accountantEmail && !isEmail(accountantEmail)) return saveError("BAD_EMAIL");
  // `from` mag ook "VTK Beheer <beheer@vtk.be>" zijn; enkel het adres tussen de
  // punthaken moet kloppen.
  const fromAddress = fromEmail.match(/<([^>]+)>/)?.[1] ?? fromEmail;
  if (fromEmail && !isEmail(fromAddress)) return saveError("BAD_EMAIL");

  const value = {
    accountantEmail,
    fromEmail,
    guidelinesNl: text(formData, "guidelinesNl", 4000),
    guidelinesEn: text(formData, "guidelinesEn", 4000),
  };

  await prisma.setting.upsert({
    where: { key: EXPENSE_CONFIG_KEY },
    update: { value },
    create: { key: EXPENSE_CONFIG_KEY, value },
  });

  await logAudit({
    action: "update",
    entity: "expense",
    target: "Instellingen rekeningen",
    summary: accountantEmail ? `boekhouder: ${accountantEmail}` : "geen boekhoudadres",
  });

  revalidateExpenses();
  return saveOk();
}
