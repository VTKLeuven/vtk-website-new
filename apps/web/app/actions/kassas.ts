"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { Prisma } from "@prisma/client";
import { deliverWebsiteMail } from "@/lib/email";
import { describeChanges, logAudit } from "@/lib/audit";
import { siteBaseUrl } from "@/lib/calendar/feeds";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { parseDateInput, workingYearOf } from "@/lib/rekeningen/expenses";
import {
  canEditRequest,
  CASH_REGISTER_CONFIG_KEY,
  cashRegisterMailTo,
  getCashRegisterConfig,
  requireCashRegisterAccess,
  terminalConflict,
  type CashRegisterAccess,
  type TerminalChoice,
} from "@/lib/kassas/server";
import {
  activityInterval,
  cleanTerminalNames,
  DENOMINATIONS,
  isCashRegisterStatus,
  normaliseCounts,
  parseAmountInput,
  parseCountInput,
  parsePick,
  registerInterval,
  startCountsFromPicks,
  statusLabel,
  type Counts,
  type Denomination,
  type PaymentMethod,
} from "@/lib/kassas/kassa";
import { cashRegisterAcceptedMail } from "@/lib/kassas/mail";

const ADMIN_PATHS = ["/admin/kassas", "/en/admin/kassas"];

/** Beide talen en elk tabblad: het overzicht, mijn aanvragen en het detail. */
function revalidateCashRegisters(id?: string) {
  for (const path of ADMIN_PATHS) {
    revalidatePath(path);
    revalidatePath(`${path}/mijn`);
    revalidatePath(`${path}/instellingen`);
    if (id) revalidatePath(`${path}/${id}`);
  }
}

function text(formData: FormData, name: string, max = 200): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function texts(formData: FormData, name: string): string[] {
  return formData.getAll(name).map((value) => (typeof value === "string" ? value : ""));
}

/**
 * De coupures uit het formulier (`<prefix>5` tot `<prefix>10000`). `null` wanneer
 * elk veld leeg is: bij de eindkassa betekent dat "nog niet geteld", en dat is
 * iets anders dan een kassa met nul euro in. Een ongeldig aantal is een fout.
 */
function readCounts(formData: FormData, prefix: string): Counts | null | "BAD_COUNT" {
  const counts: Record<string, number> = {};
  let filled = false;
  for (const denomination of DENOMINATIONS) {
    const parsed = parseCountInput(text(formData, `${prefix}${denomination}`, 12));
    if (parsed === undefined) return "BAD_COUNT";
    if (parsed === null) continue;
    filled = true;
    if (parsed > 0) counts[String(denomination)] = parsed;
  }
  return filled ? normaliseCounts(counts) : null;
}

// -----------------------------------------------------------------------------
// Aanvragen
// -----------------------------------------------------------------------------

type RequestFields = {
  date: Date;
  startsAt: Date;
  endsAt: Date;
  workingYear: number;
  activity: string;
  groupId: string;
  postLabel: string;
  responsibleName: string;
  wantsBancontact: boolean;
  wantsPayconiq: boolean;
  comment: string | null;
  startCounts: Counts;
};

/**
 * De velden van de aanvraag, gedeeld door aanvragen en aanpassen. Verwachte
 * invoerfouten komen terug als code, zodat het formulier een rode toast toont.
 */
async function readRequest(
  formData: FormData,
  access: CashRegisterAccess,
  current?: { groupId: string | null; startCounts: unknown },
): Promise<RequestFields | { error: string }> {
  const date = parseDateInput(text(formData, "date", 10));
  if (!date) return { error: "BAD_DATE" };
  const startTime = text(formData, "startTime", 5);
  const endTime = text(formData, "endTime", 5);
  if (!startTime || !endTime) return { error: "MISSING_TIME" };
  const interval = activityInterval(date, startTime, endTime);
  if (!interval) return { error: "BAD_TIME" };

  const activity = text(formData, "activity", 120);
  const responsibleName = text(formData, "responsibleName", 120);
  if (!activity || !responsibleName) return { error: "MISSING_FIELD" };

  const groupId = text(formData, "groupId", 60);
  const group = groupId
    ? await prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, nameNl: true, active: true },
      })
    : null;
  // Een gedeactiveerde post kies je niet meer, behalve je eigen of de post waar
  // de kassa al op stond.
  const allowedInactive =
    group && (access.postIds.includes(group.id) || current?.groupId === group.id);
  if (!group || (!group.active && !allowedInactive)) return { error: "BAD_POST" };

  // De startkassa. Een post duidt aan wat ze nodig heeft (`pick`) en krijgt het
  // standaardaantal; enkel Beheer telt ze per coupure (`count`). Bij `keep`
  // staat ze elders op het scherm, in het aanvaardformulier, en blijft ze hier
  // zoals ze was.
  const currentCounts = normaliseCounts(current?.startCounts);
  const mode = text(formData, "startMode", 10);
  let startCounts: Counts;
  if (mode === "keep" && current) {
    startCounts = currentCounts;
  } else if (mode === "count" && access.canManage) {
    const counts = readCounts(formData, "start_");
    if (counts === "BAD_COUNT") return { error: "BAD_COUNT" };
    startCounts = counts ?? {};
  } else {
    const picks = formData
      .getAll("startPick")
      .map(parsePick)
      .filter((denomination): denomination is Denomination => denomination !== null);
    startCounts = startCountsFromPicks(picks, currentCounts);
  }

  return {
    date,
    startsAt: interval.start,
    endsAt: interval.end,
    workingYear: workingYearOf(date),
    activity,
    groupId: group.id,
    postLabel: group.nameNl,
    responsibleName,
    wantsBancontact: formData.get("wantsBancontact") === "on",
    wantsPayconiq: formData.get("wantsPayconiq") === "on",
    comment: text(formData, "comment", 2000) || null,
    startCounts,
  };
}

export async function requestCashRegisterAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await requireCashRegisterAccess();
  const fields = await readRequest(formData, access);
  if ("error" in fields) return saveError(fields.error);

  // De waarde van een bon wordt hier vastgeklikt; zie `CashRegister`.
  const config = await getCashRegisterConfig();
  const created = await prisma.cashRegister.create({
    data: {
      ...fields,
      startCounts: fields.startCounts,
      requestedById: access.session.user.id,
      shiftVoucherValueCents: config.shiftVoucherValueCents,
      elixirVoucherValueCents: config.elixirVoucherValueCents,
    },
    select: { id: true },
  });

  await logAudit({
    action: "create",
    entity: "cashRegister",
    entityId: created.id,
    target: `${fields.activity} (${fields.postLabel})`,
    summary: "kassa aangevraagd",
  });
  revalidateCashRegisters(created.id);
  return saveOk();
}

const REQUEST_LABELS: Record<string, string> = {
  date: "datum",
  startsAt: "uren",
  endsAt: "uren",
  activity: "activiteit",
  groupId: "post",
  responsibleName: "verantwoordelijke",
  wantsBancontact: "Bancontact",
  wantsPayconiq: "Payconiq",
  comment: "opmerking",
  startCounts: "startkassa",
};

export async function updateCashRegisterRequestAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await requireCashRegisterAccess();
  const id = text(formData, "id", 60);
  const register = await prisma.cashRegister.findUnique({
    where: { id },
    include: { payments: { select: { method: true, terminal: true } } },
  });
  if (!register) return saveError("NOT_FOUND");
  if (!canEditRequest(access, register)) {
    return saveError(register.status === "REQUESTED" ? "FORBIDDEN" : "LOCKED");
  }

  const fields = await readRequest(formData, access, register);
  if ("error" in fields) return saveError(fields.error);

  // Andere uren of een andere dag mogen een gekozen toestel niet stil dubbel
  // uitlenen.
  const conflict = await terminalConflict(id, { start: fields.startsAt, end: fields.endsAt }, register.payments);
  if (conflict) return saveError("TERMINAL_BUSY", `Niet opgeslagen: ${conflict}.`);

  // Voor de post voorwaardelijk op de status: aanvaardt Beheer net terwijl de
  // post opslaat, dan gaat de wijziging niet stil over de aanvaarde kassa heen.
  const updated = await prisma.cashRegister.updateMany({
    where: access.canManage ? { id } : { id, status: "REQUESTED" },
    data: fields,
  });
  if (updated.count === 0) return saveError("LOCKED");

  await logAudit({
    action: "update",
    entity: "cashRegister",
    entityId: id,
    target: `${fields.activity} (${fields.postLabel})`,
    summary: describeChanges(
      { ...register, startCounts: JSON.stringify(normaliseCounts(register.startCounts)) },
      { ...fields, startCounts: JSON.stringify(fields.startCounts) },
      REQUEST_LABELS,
    ),
  });
  revalidateCashRegisters(id);
  return saveOk();
}

/**
 * Intrekken of verwijderen. De aanvrager kan dat zolang Beheer niet aanvaardde,
 * Beheer altijd. Het detail bestaat daarna niet meer, dus de action stuurt door
 * naar de lijst; die navigatie is de bevestiging.
 */
export async function deleteCashRegisterAction(formData: FormData): Promise<SaveState> {
  const access = await requireCashRegisterAccess();
  const id = text(formData, "id", 60);
  const register = await prisma.cashRegister.findUnique({
    where: { id },
    select: { id: true, activity: true, postLabel: true, status: true, groupId: true, requestedById: true },
  });
  if (!register) return saveError("NOT_FOUND");
  if (!canEditRequest(access, register)) return saveError("LOCKED");

  await prisma.cashRegister.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "cashRegister",
    entityId: id,
    target: `${register.activity} (${register.postLabel})`,
    summary: `verwijderd in status ${statusLabel(register.status, true).toLowerCase()}`,
  });
  revalidateCashRegisters();

  const base = formData.get("locale") === "en" ? "/en" : "";
  redirect(`${base}/admin/kassas${access.canManage ? "" : "/mijn"}`);
}

// -----------------------------------------------------------------------------
// Beheer: aanvaarden en status
// -----------------------------------------------------------------------------

async function requireManager(): Promise<CashRegisterAccess | null> {
  const access = await requireCashRegisterAccess();
  return access.canManage ? access : null;
}

/**
 * Aanvaarden: Beheer stelt de startkassa bij, kiest het Bancontact-bakje en de
 * Payconiq-rekening voor wat de post vroeg, en de aanvrager krijgt een mail om
 * zelf een ophaalmoment af te spreken. Alles in één formulier, want zo beslist
 * Beheer het ook: wat er in de kassa gaat en wat er mee gaat, op het moment dat
 * ze de aanvraag bekijken.
 *
 * Een toestel dat op dat moment al op een andere kassa staat, kan niet: dan
 * zou hetzelfde bakje op twee plaatsen tegelijk moeten liggen. De aanvaarding
 * gaat altijd door; lukt de mail niet, dan zegt de toast dat, zodat Beheer het
 * de aanvrager zelf laat weten.
 */
export async function acceptCashRegisterAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await requireManager();
  if (!access) return saveError("FORBIDDEN");
  const id = text(formData, "id", 60);
  const current = await prisma.cashRegister.findUnique({
    where: { id },
    select: { status: true, date: true, startsAt: true, endsAt: true, wantsBancontact: true, wantsPayconiq: true },
  });
  if (!current) return saveError("NOT_FOUND");
  if (current.status !== "REQUESTED") return saveError("ALREADY_ACCEPTED");

  // `null` = elk veld leeg: dan blijft de startkassa zoals de post ze vroeg.
  const startCounts = readCounts(formData, "start_");
  if (startCounts === "BAD_COUNT") return saveError("BAD_COUNT");

  const config = await getCashRegisterConfig();
  const devices: Array<{ method: PaymentMethod; wanted: boolean; field: string; names: string[] }> = [
    { method: "BANCONTACT", wanted: current.wantsBancontact, field: "bancontactTerminal", names: config.bancontactTerminals },
    { method: "PAYCONIQ", wanted: current.wantsPayconiq, field: "payconiqAccount", names: config.payconiqAccounts },
  ];
  const chosen: TerminalChoice[] = [];
  for (const device of devices) {
    if (!device.wanted) continue;
    const terminal = text(formData, device.field, 60);
    if (!terminal) return saveError("MISSING_TERMINAL");
    if (!device.names.includes(terminal)) return saveError("BAD_TERMINAL");
    chosen.push({ method: device.method, terminal });
  }
  const conflict = await terminalConflict(id, registerInterval(current), chosen);
  if (conflict) return saveError("TERMINAL_BUSY", `Niet aanvaard: ${conflict}.`);

  // Voorwaardelijk op de status: twee beheerders die tegelijk klikken, sturen
  // samen één mail en zetten de toestellen er één keer op.
  const accepted = await prisma.$transaction(async (tx) => {
    const updated = await tx.cashRegister.updateMany({
      where: { id, status: "REQUESTED" },
      data: {
        status: "TO_MAKE",
        acceptedAt: new Date(),
        acceptedById: access.session.user.id,
        ...(startCounts ? { startCounts } : {}),
      },
    });
    if (updated.count === 0) return false;
    // Een toestel is een betaalregel zonder bedrag tot er geteld wordt; zo staat
    // het meteen klaar in de telling.
    await tx.cashRegisterPayment.createMany({
      data: chosen.map((choice, index) => ({ ...choice, registerId: id, amountCents: null, sortOrder: index })),
    });
    return true;
  });
  if (!accepted) return saveError("ALREADY_ACCEPTED");

  const register = await prisma.cashRegister.findUniqueOrThrow({
    where: { id },
    include: {
      payments: { orderBy: { sortOrder: "asc" }, select: { method: true, terminal: true } },
      requestedBy: {
        select: {
          name: true,
          firstName: true,
          email: true,
          personalEmail: true,
          emailPreference: true,
          googleEmail: true,
          locale: true,
        },
      },
    },
  });
  const target = `${register.activity} (${register.postLabel})`;
  const namesOf = (method: PaymentMethod) =>
    register.payments.filter((payment) => payment.method === method).map((payment) => payment.terminal);

  let detail: string;
  const requester = register.requestedBy;
  if (!requester) {
    detail = "Aanvaard. De aanvrager heeft geen account meer, dus er vertrok geen mail.";
  } else {
    const locale = requester.locale === "EN" ? "en" : "nl";
    const mail = cashRegisterAcceptedMail({
      locale,
      name: requester.firstName?.trim() || requester.name,
      activity: register.activity,
      date: register.date,
      startsAt: register.startsAt,
      endsAt: register.endsAt,
      postLabel: register.postLabel,
      responsibleName: register.responsibleName,
      startCounts: normaliseCounts(register.startCounts),
      wantsBancontact: register.wantsBancontact,
      wantsPayconiq: register.wantsPayconiq,
      bancontactTerminals: namesOf("BANCONTACT"),
      payconiqAccounts: namesOf("PAYCONIQ"),
      contactEmail: config.contactEmail,
      url: `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/admin/kassas/${register.id}`,
    });
    const to = cashRegisterMailTo(requester);
    const result = await deliverWebsiteMail(
      { to, subject: mail.subject, text: mail.text, html: mail.html, replyTo: config.contactEmail },
      { source: "cashRegisters" },
    );
    if (result.status === "sent" || result.status === "partial") {
      await prisma.cashRegister.update({ where: { id }, data: { acceptedMailSentAt: new Date() } });
      detail = `Aanvaard. ${requester.name} kreeg een mail op ${to} om een ophaalmoment af te spreken.`;
    } else if (result.status === "simulated") {
      detail = "Aanvaard. Er is hier geen mailserver, dus de mail staat enkel in de serverlog.";
    } else {
      detail = `Aanvaard, maar de mail naar ${to} kon niet vertrekken. Laat het ${requester.name} zelf weten.`;
    }
  }

  await logAudit({
    action: "update",
    entity: "cashRegister",
    entityId: id,
    target,
    summary: chosen.length
      ? `aanvaard, met ${chosen.map((choice) => `${choice.method === "BANCONTACT" ? "Bancontact" : "Payconiq"} ${choice.terminal}`).join(" en ")}`
      : "aanvaard",
  });
  revalidateCashRegisters(id);
  return saveOk(detail);
}

/**
 * De status met de hand zetten, zoals de keuzelijst in het rekenblad. Enkel na
 * de aanvaarding: van "aangevraagd" naar verder gaat via aanvaarden, anders
 * vertrekt er geen mail. Terug naar "aangevraagd" kan om dezelfde reden niet.
 */
export async function setCashRegisterStatusAction(formData: FormData): Promise<SaveState> {
  const access = await requireManager();
  if (!access) return saveError("FORBIDDEN");
  const id = text(formData, "id", 60);
  const status = text(formData, "status", 20);
  if (!isCashRegisterStatus(status) || status === "REQUESTED") return saveError("BAD_STATUS");

  const register = await prisma.cashRegister.findUnique({
    where: { id },
    select: { status: true, activity: true, postLabel: true },
  });
  if (!register) return saveError("NOT_FOUND");
  if (register.status === "REQUESTED") return saveError("NOT_ACCEPTED");
  if (register.status === status) return saveOk();

  await prisma.cashRegister.update({ where: { id }, data: { status } });
  await logAudit({
    action: "update",
    entity: "cashRegister",
    entityId: id,
    target: `${register.activity} (${register.postLabel})`,
    summary: `status ${statusLabel(register.status, true).toLowerCase()} → ${statusLabel(status, true).toLowerCase()}`,
  });
  revalidateCashRegisters(id);
  return saveOk(`Status op ${statusLabel(status, true).toLowerCase()} gezet.`);
}

// -----------------------------------------------------------------------------
// Beheer: tellen
// -----------------------------------------------------------------------------

/**
 * Wat er na het evenement binnenkwam: de eindkassa per coupure, de bonnen, de
 * Bancontact-bakjes en Payconiq-rekeningen met hun bedrag, de gekoppelde
 * ticketverkoop en een opmerking. Alles in één formulier, want zo wordt het ook
 * geteld: aan één tafel, met de kassa en de terminals ernaast.
 */
export async function saveCashRegisterCountAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await requireManager();
  if (!access) return saveError("FORBIDDEN");
  const id = text(formData, "id", 60);
  const register = await prisma.cashRegister.findUnique({
    where: { id },
    include: { payments: { select: { terminal: true } } },
  });
  if (!register) return saveError("NOT_FOUND");

  const endCounts = readCounts(formData, "end_");
  if (endCounts === "BAD_COUNT") return saveError("BAD_COUNT");
  const shiftVouchers = parseCountInput(text(formData, "shiftVouchers", 12));
  const elixirVouchers = parseCountInput(text(formData, "elixirVouchers", 12));
  if (shiftVouchers === undefined || elixirVouchers === undefined) return saveError("BAD_COUNT");

  // Een bakje moet in de instellingen staan, of al op deze kassa: een bakje dat
  // intussen hernoemd of geschrapt werd, blijft zo gewoon staan.
  const config = await getCashRegisterConfig();
  const known: Record<PaymentMethod, Set<string>> = {
    BANCONTACT: new Set([...config.bancontactTerminals, ...register.payments.map((p) => p.terminal)]),
    PAYCONIQ: new Set([...config.payconiqAccounts, ...register.payments.map((p) => p.terminal)]),
  };
  const methods = texts(formData, "paymentMethod");
  const terminals = texts(formData, "paymentTerminal");
  const amounts = texts(formData, "paymentAmount");
  const payments: Array<{ method: PaymentMethod; terminal: string; amountCents: number | null; sortOrder: number }> = [];
  for (let index = 0; index < methods.length; index++) {
    const method = methods[index];
    const terminal = (terminals[index] ?? "").trim();
    const amountRaw = amounts[index] ?? "";
    if (method !== "BANCONTACT" && method !== "PAYCONIQ") return saveError("BAD_TERMINAL");
    // Een regel zonder bakje en zonder bedrag is een lege regel die bleef staan.
    if (!terminal && !amountRaw.trim()) continue;
    if (!terminal || !known[method].has(terminal)) return saveError("BAD_TERMINAL");
    const amountCents = parseAmountInput(amountRaw);
    if (amountCents === undefined) return saveError("BAD_AMOUNT");
    payments.push({ method, terminal, amountCents, sortOrder: payments.length });
  }
  // Ook een bakje dat pas bij het tellen bijkomt, kan niet al elders liggen.
  const conflict = await terminalConflict(id, registerInterval(register), payments);
  if (conflict) return saveError("TERMINAL_BUSY", `Niet opgeslagen: ${conflict}.`);

  const requestedTickets = [...new Set(texts(formData, "ticketEventId").filter(Boolean))];
  const ticketEvents = requestedTickets.length
    ? await prisma.ticketEvent.findMany({ where: { id: { in: requestedTickets } }, select: { id: true } })
    : [];

  await prisma.$transaction([
    prisma.cashRegister.update({
      where: { id },
      data: {
        endCounts: endCounts ?? Prisma.DbNull,
        shiftVouchers,
        elixirVouchers,
        note: text(formData, "note", 2000) || null,
      },
    }),
    prisma.cashRegisterPayment.deleteMany({ where: { registerId: id } }),
    prisma.cashRegisterPayment.createMany({
      data: payments.map((payment) => ({ ...payment, registerId: id })),
    }),
    prisma.cashRegisterTicketEvent.deleteMany({ where: { registerId: id } }),
    prisma.cashRegisterTicketEvent.createMany({
      data: ticketEvents.map((event) => ({ registerId: id, ticketEventId: event.id })),
    }),
  ]);

  await logAudit({
    action: "update",
    entity: "cashRegister",
    entityId: id,
    target: `${register.activity} (${register.postLabel})`,
    summary: "telling bijgewerkt",
  });
  revalidateCashRegisters(id);
  return saveOk();
}

// -----------------------------------------------------------------------------
// Instellingen
// -----------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveCashRegisterConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await requireManager();
  if (!access) return saveError("FORBIDDEN");

  const shift = parseAmountInput(text(formData, "shiftVoucherValue", 12));
  const elixir = parseAmountInput(text(formData, "elixirVoucherValue", 12));
  if (shift === undefined || elixir === undefined) return saveError("BAD_AMOUNT");
  const contactEmail = text(formData, "contactEmail", 200);
  if (!EMAIL_PATTERN.test(contactEmail)) return saveError("BAD_EMAIL");

  const value = {
    bancontactTerminals: cleanTerminalNames(texts(formData, "bancontact")),
    payconiqAccounts: cleanTerminalNames(texts(formData, "payconiq")),
    shiftVoucherValueCents: shift ?? 0,
    elixirVoucherValueCents: elixir ?? 0,
    contactEmail,
  };
  await prisma.setting.upsert({
    where: { key: CASH_REGISTER_CONFIG_KEY },
    create: { key: CASH_REGISTER_CONFIG_KEY, value },
    update: { value },
  });

  await logAudit({
    action: "update",
    entity: "cashRegisterSettings",
    target: "Kassa's",
    summary: "instellingen bewaard",
  });
  revalidateCashRegisters();
  return saveOk();
}
