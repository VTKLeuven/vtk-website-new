"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@vtk/db";
import { deleteObject, newStorageKey, putObject } from "@vtk/storage";
import { requirePermission } from "@/lib/session";
import { RateLimiter, clientKeyFromHeaders, toMessageText, toSingleLine } from "@/lib/contactForm";
import { brusselsWallClockMinutes } from "@/lib/brussels";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import {
  CORE_QUESTIONS,
  DEPOSIT_CHOICE_META,
  EXTRA_QUESTION_TYPES,
  RENTAL_LIMITS,
  RENTAL_RATE_LIMIT,
  RENTAL_STATUS_META,
  REQUIRED_CORE_QUESTIONS,
  blocksRoom,
  guessRenterType,
  isContractState,
  isDepositState,
  isKeyState,
  isRentalStatus,
  isRenterType,
  parseDateField,
  parseRentalRequest,
  parseTimeField,
  type CoreQuestionKey,
  type RentalStatus,
} from "@/lib/theokotVerhuur";
import {
  RENTAL_CONFIG_KEY,
  RENTAL_GUIDE_KEY,
  RENTAL_MAIL_KEY,
  RENTAL_QUESTIONS_KEY,
  consumeDecisionToken,
  depositChoiceLabel,
  describeRentalWindow,
  formatRentalMoment,
  getRentalConfig,
  getRentalQuestions,
  getRentalTemplates,
  loadContractAttachment,
  logRentalMessage,
  lookupDecisionToken,
  notifyNewRental,
  revokeDecisionTokens,
  sendRentalMail,
} from "@/lib/theokotVerhuur-server";
import {
  clampLeadDays,
  defaultTemplateFor,
  rentalMailVars,
  renderRentalMail,
  splitEmails,
  type RentalTemplate,
  type RentalTemplateCategory,
} from "@/lib/theokotVerhuurMail";

/**
 * Server actions van de Theokot-verhuur.
 *
 * De publieke aanvraag staat bovenaan en is de enige zonder login; de beslissing
 * vanuit de meldingsmail hercontroleert een eenmalig token, en al de rest
 * hercontroleert `theokot.rentals.manage`.
 *
 * De regel die overal terugkomt: een status wijzigen en een mail versturen zijn
 * twee aparte acties. Het scherm en de mail zeggen allebei welke van de twee je
 * aanklikt, want "goedgekeurd" zetten zonder te mailen is een echt geval (een
 * afspraak die al telefonisch gemaakt is) en een mail die ongevraagd vertrekt is
 * niet terug te nemen.
 */

const ADMIN_PATHS = ["/admin/theokot/verhuur", "/en/admin/theokot/verhuur"];

function revalidateRentals() {
  for (const path of ADMIN_PATHS) revalidatePath(path);
}

/** Wandklok naar instant; `null` wanneer datum of uur niet kloppen. */
function toInstant(date: string, time: string): Date | null {
  const ymd = parseDateField(date);
  const minutes = parseTimeField(time);
  if (!ymd || minutes === null) return null;
  return brusselsWallClockMinutes(ymd, minutes);
}

/**
 * Het einde van een verhuur. Een fuif die om 02:00 stopt, stopt de volgende
 * ochtend; ligt het einduur voor het startuur, dan telt het als de dag erna.
 */
function endInstant(date: string, startTime: string, endTime: string): Date | null {
  const start = toInstant(date, startTime);
  const end = toInstant(date, endTime);
  if (!start || !end) return null;
  return end.getTime() <= start.getTime() ? new Date(end.getTime() + 86_400_000) : end;
}

// -----------------------------------------------------------------------------
// Publiek: de zaal aanvragen
// -----------------------------------------------------------------------------

/**
 * De teller staat in het geheugen van dit proces, net als bij het
 * contactformulier: bij een herstart begint ze opnieuw en met meerdere containers
 * telt elk zijn eigen deel. Voor een drempel tegen scripts volstaat dat.
 */
const limiter = new RateLimiter(RENTAL_RATE_LIMIT.max, RENTAL_RATE_LIMIT.windowMs);

/**
 * Het publieke aanvraagformulier op /theokot/verhuur.
 *
 * Bewust zonder login: de verantwoordelijke moet student aan de faculteit zijn,
 * maar lang niet elke student heeft een VTK-account, en die een account laten
 * maken om één zaal te vragen zou het formulier vervangen door een drempel. De
 * bescherming is dezelfde als bij het contactformulier: een honeypot en een
 * snelheidslimiet per IP.
 */
export async function requestRentalAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const [config, questions] = await Promise.all([getRentalConfig(), getRentalQuestions()]);
  if (!config.formOpen) return saveError("CLOSED");

  const date = toSingleLine(formData.get("date"));
  const startTime = toSingleLine(formData.get("startTime"));
  const endTime = toSingleLine(formData.get("endTime"));
  const startsAt = date && startTime ? toInstant(date, startTime) : null;

  const extra: Record<string, unknown> = {};
  for (const question of questions.extra) {
    extra[question.id] = formData.get(`extra:${question.id}`);
  }

  const parsed = parseRentalRequest(
    {
      locale: formData.get("locale"),
      responsibleName: formData.get("responsibleName"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      date,
      startTime,
      endTime,
      purpose: formData.get("purpose"),
      attendees: formData.get("attendees"),
      deposit: formData.get("deposit"),
      remarks: formData.get("remarks"),
      extra,
      honeypot: formData.get("website"),
    },
    questions,
    { startsAt, minLeadDays: config.minLeadDays },
  );

  // De honeypot: doen alsof het gelukt is. Een bot die een foutmelding krijgt,
  // weet dat hij ontdekt is en past zijn volgende poging aan.
  if (parsed.status === "honeypot") return saveOk();
  if (parsed.status === "error") {
    // Bij een eigen vraag zegt de code enkel "er ontbreekt er een"; de naam van
    // de vraag erbij scheelt de aanvrager het hele formulier aflopen.
    return saveError(
      parsed.code,
      parsed.field
        ? `Niet verstuurd: "${parsed.field}" is nog niet (of te lang) ingevuld.`
        : undefined,
    );
  }

  const request = parsed.request;
  const endsAt = endInstant(request.date, request.startTime, request.endTime);
  if (!startsAt || !endsAt) return saveError("DATE_INVALID");

  const key = clientKeyFromHeaders(await headers());
  if (!limiter.take(key)) return saveError("RATE_LIMITED");

  const renterType = guessRenterType(request.purpose);

  const created = await prisma.theokotRental.create({
    data: {
      locale: request.locale,
      responsibleName: request.responsibleName,
      phone: request.phone,
      email: request.email,
      startsAt,
      endsAt,
      purpose: request.purpose,
      attendees: request.attendees,
      depositChoice: request.depositChoice,
      // De waarborgkolom start op wat de aanvrager koos: "overschrijving" zonder
      // meer betekent gekozen maar nog niet binnen.
      deposit: request.depositChoice,
      remarks: request.remarks || null,
      extraAnswers: request.extraAnswers,
      renterType,
      // Een post of werkgroep betaalt geen waarborg en tekent geen contract met
      // zichzelf; die twee velden mogen dan meteen op NVT staan.
      contract: renterType === "INTERNAL" ? "NVT" : "PENDING",
    },
    select: { id: true },
  });

  // Botsingen erbij zoeken voor de melding: het formulier belooft dat een tweede
  // aanvraag voor een bezette dag geweigerd wordt, dus wie beslist moet dat zien
  // zonder de kalender te openen.
  const sameDay = await prisma.theokotRental.findMany({
    where: {
      id: { not: created.id },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { responsibleName: true, startsAt: true, endsAt: true, status: true },
  });

  await notifyNewRental({
    id: created.id,
    responsibleName: request.responsibleName,
    email: request.email,
    phone: request.phone,
    startsAt,
    endsAt,
    purpose: request.purpose,
    attendees: request.attendees,
    depositChoice: request.depositChoice,
    remarks: request.remarks || null,
    renterType,
    locale: request.locale,
    extraAnswers: questions.extra
      .filter((question) => request.extraAnswers[question.id])
      .map((question) => ({
        label: question.labelNl,
        value: request.extraAnswers[question.id]!,
      })),
    clashes: sameDay
      .filter((row) => blocksRoom(row.status))
      .map((row) => describeRentalWindow(row, "nl")),
  });

  await sendConfirmationMail(created.id);
  revalidateRentals();

  // Geen `redirect`: het formulier meldt zijn succes met een groene toast en een
  // zichtbare bevestiging op dezelfde pagina.
  return saveOk();
}

/**
 * De ontvangstbevestiging naar de aanvrager.
 *
 * Faalt stil: de aanvraag staat in het beheer, en een aanvrager die geen
 * bevestiging krijgt mag geen foutmelding zien alsof zijn aanvraag niet
 * aankwam.
 */
async function sendConfirmationMail(rentalId: string): Promise<void> {
  try {
    const [rental, templates, config] = await Promise.all([
      prisma.theokotRental.findUnique({ where: { id: rentalId } }),
      getRentalTemplates(),
      getRentalConfig(),
    ]);
    if (!rental) return;

    const locale = rental.locale === "en" ? "en" : "nl";
    const template = defaultTemplateFor(templates, "confirmation", locale);
    if (!template) return;

    const rendered = renderRentalMail(template, mailVarsForRow(rental, config.signature, locale));
    const delivered = await sendRentalMail({
      to: rental.email,
      subject: rendered.subject,
      text: rendered.body,
    });
    if (!delivered) return;

    await logRentalMessage({
      rentalId,
      kind: "confirmation",
      templateId: template.id,
      to: rental.email,
      subject: rendered.subject,
      body: rendered.body,
    });
  } catch (err) {
    console.error("[theokot-verhuur] ontvangstbevestiging niet verstuurd", err);
  }
}

type RentalRow = {
  id: string;
  responsibleName: string;
  startsAt: Date;
  endsAt: Date;
  purpose: string;
  attendees: number | null;
  depositChoice: "TRANSFER" | "CASH" | "NVT";
  remarks: string | null;
  decisionNote: string | null;
};

function mailVarsForRow(rental: RentalRow, signature: string, locale: "nl" | "en") {
  const start = formatRentalMoment(rental.startsAt, locale);
  const end = formatRentalMoment(rental.endsAt, locale);
  return rentalMailVars(
    {
      responsibleName: rental.responsibleName,
      mailDate: start.date,
      startTime: start.time,
      endTime: end.time,
      purpose: rental.purpose,
      attendees: rental.attendees,
      depositChoice: rental.depositChoice,
      depositLabel: depositChoiceLabel(rental.depositChoice, locale),
      remarks: rental.remarks,
      decisionNote: rental.decisionNote,
    },
    signature,
  );
}

// -----------------------------------------------------------------------------
// Beheer: de aanvraag bijwerken
// -----------------------------------------------------------------------------

async function requireRentalManager() {
  return requirePermission("theokot.rentals.manage");
}

/**
 * De vier opvolgvelden, de soort huurder en de notities.
 *
 * Dit verstuurt bewust **niets**. Een status hier wijzigen is het geval "we
 * spraken het al af aan de toog" of "dit is achteraf toch geannuleerd"; wie wil
 * antwoorden, gebruikt het mailpaneel ernaast. Het scherm zegt dat er ook bij.
 */
export async function updateRentalAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireRentalManager();
  const id = toSingleLine(formData.get("rentalId"));
  if (!id) return saveError("NOT_FOUND");

  const existing = await prisma.theokotRental.findUnique({ where: { id } });
  if (!existing) return saveError("NOT_FOUND");

  const status = formData.get("status");
  const deposit = formData.get("deposit");
  const contract = formData.get("contract");
  const keyStatus = formData.get("keyStatus");
  const renterType = formData.get("renterType");
  if (
    !isRentalStatus(status) ||
    !isDepositState(deposit) ||
    !isContractState(contract) ||
    !isKeyState(keyStatus) ||
    !isRenterType(renterType)
  ) {
    return saveError("INVALID_INPUT");
  }

  // De uren zijn achteraf bij te stellen: een verhuur schuift op, en dan moet de
  // kalender dat volgen zonder dat de aanvrager opnieuw moet indienen.
  const date = toSingleLine(formData.get("date"));
  const startTime = toSingleLine(formData.get("startTime"));
  const endTime = toSingleLine(formData.get("endTime"));
  const startsAt = toInstant(date, startTime);
  const endsAt = endInstant(date, startTime, endTime);
  if (!startsAt || !endsAt) return saveError("TIME_REQUIRED");

  const internalNote = toMessageText(formData.get("internalNote"));
  const decisionNote = toMessageText(formData.get("decisionNote"));
  if (internalNote.length > RENTAL_LIMITS.remarks || decisionNote.length > RENTAL_LIMITS.remarks) {
    return saveError("REMARKS_TOO_LONG");
  }

  const decided = status !== "UNANSWERED" && existing.status === "UNANSWERED";

  await prisma.theokotRental.update({
    where: { id },
    data: {
      status,
      deposit,
      contract,
      keyStatus,
      renterType,
      startsAt,
      endsAt,
      internalNote: internalNote || null,
      decisionNote: decisionNote || null,
      ...(decided
        ? { decidedAt: new Date(), decidedById: session.user.id, decidedViaMail: false }
        : {}),
    },
  });

  // Zodra er hier beslist is, mogen de knoppen uit de meldingsmail niets meer
  // doen: anders keert iemand die de mail later opent een beslissing om zonder
  // te zien dat er al geantwoord was.
  if (status !== "UNANSWERED") await revokeDecisionTokens(id);

  await logAudit({
    action: "update",
    entity: "theokotRental",
    entityId: id,
    target: existing.responsibleName,
    summary: `status ${RENTAL_STATUS_META[existing.status].nl} → ${RENTAL_STATUS_META[status].nl}, zonder mail`,
  });

  revalidateRentals();
  return saveOk();
}

/** Een aanvraag weggooien. Voor spam en dubbele inzendingen, niet voor historiek. */
export async function deleteRentalAction(formData: FormData): Promise<void> {
  await requireRentalManager();
  const id = toSingleLine(formData.get("rentalId"));
  if (!id) return;

  const existing = await prisma.theokotRental.findUnique({
    where: { id },
    select: { responsibleName: true, startsAt: true },
  });
  if (!existing) return;

  await prisma.theokotRental.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "theokotRental",
    entityId: id,
    target: existing.responsibleName,
    summary: `aanvraag van ${formatRentalMoment(existing.startsAt, "nl").date} verwijderd`,
  });
  revalidateRentals();
}

// -----------------------------------------------------------------------------
// Beheer: antwoorden
// -----------------------------------------------------------------------------

/**
 * Verstuurt een sjabloonantwoord naar de aanvrager, en zet meteen de status die
 * bij dat antwoord hoort.
 *
 * Hier vertrekt er dus wél een mail. Dat staat op de knop en in de bevestiging
 * ernaast; de tekst is bovendien nog aan te passen voor je verstuurt, want een
 * sjabloon dat rechtstreeks de deur uit gaat verstuurt bij een fout honderd keer
 * dezelfde fout.
 */
export async function sendRentalReplyAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireRentalManager();
  const id = toSingleLine(formData.get("rentalId"));
  const subject = toSingleLine(formData.get("subject"));
  const body = toMessageText(formData.get("body"));
  const templateId = toSingleLine(formData.get("templateId")) || null;
  const attachContract = formData.get("attachContract") === "on";
  const statusRaw = toSingleLine(formData.get("setStatus"));

  if (!id) return saveError("NOT_FOUND");
  if (!subject || !body) return saveError("MAIL_EMPTY");

  const rental = await prisma.theokotRental.findUnique({ where: { id } });
  if (!rental) return saveError("NOT_FOUND");
  if (!rental.email) return saveError("NO_RECIPIENT");

  const attachment = attachContract
    ? await loadContractAttachment(rental.renterType, rental.locale === "en" ? "en" : "nl")
    : null;
  if (attachContract && !attachment) return saveError("CONTRACT_MISSING");

  const delivered = await sendRentalMail({
    to: rental.email,
    subject,
    text: body,
    attachments: attachment ? [attachment] : undefined,
  });
  if (!delivered) return saveError("MAIL_FAILED");

  await logRentalMessage({
    rentalId: id,
    kind: "reply",
    templateId,
    to: rental.email,
    subject,
    body,
    attachmentName: attachment?.filename ?? null,
    sentById: session.user.id,
  });

  const status = isRentalStatus(statusRaw) ? statusRaw : null;
  await prisma.theokotRental.update({
    where: { id },
    data: {
      requesterNotifiedAt: new Date(),
      ...(status
        ? {
            status,
            decidedAt: new Date(),
            decidedById: session.user.id,
            decidedViaMail: false,
          }
        : {}),
    },
  });
  if (status && status !== "UNANSWERED") await revokeDecisionTokens(id);

  await logAudit({
    action: "send",
    entity: "theokotRental",
    entityId: id,
    target: rental.responsibleName,
    summary: status
      ? `antwoord verstuurd, status op ${RENTAL_STATUS_META[status].nl}`
      : "antwoord verstuurd",
  });

  revalidateRentals();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Beslissen vanuit de meldingsmail
// -----------------------------------------------------------------------------

export type RentalDecisionPreview =
  | { status: "invalid"; reason: "unknown" | "expired" | "used" }
  | {
      status: "ok";
      action: "APPROVE" | "REJECT";
      rental: {
        id: string;
        responsibleName: string;
        email: string;
        phone: string;
        purpose: string;
        attendees: number | null;
        remarks: string | null;
        locale: "nl" | "en";
        renterType: "INTERNAL" | "EXTERNAL";
        depositLabel: string;
        statusLabel: { nl: string; en: string };
        alreadyDecided: boolean;
        startDate: string;
        startTime: string;
        endTime: string;
      };
      /**
       * Elk sjabloon, al ingevuld met de gegevens van deze aanvraag. Dat is
       * bewust de hele lijst en niet enkel het standaardsjabloon: wie vanuit de
       * mail beslist, moet net als in het beheer een andere tekst kunnen kiezen
       * (een weigering met een andere reden, of het Engelse sjabloon).
       */
      templates: {
        id: string;
        name: string;
        category: RentalTemplateCategory;
        lang: "nl" | "en";
        subject: string;
        body: string;
        attachContract: boolean;
      }[];
      /** Het sjabloon dat standaard voorgesteld wordt. */
      defaultTemplateId: string | null;
      contractReady: boolean;
      clashes: string[];
    };

/**
 * Wat de beslispagina moet tonen: de aanvraag, de mail die klaarstaat, en of er
 * een huurcontract is om bij te voegen.
 *
 * Leest het token maar verbruikt het niet. Een mailclient of een virusscanner
 * die links vooruitlaadt mag geen beslissing nemen; verbruiken gebeurt pas in
 * `decideRentalByTokenAction`, achter een echte klik.
 */
export async function loadRentalDecision(token: string): Promise<RentalDecisionPreview> {
  const lookup = await lookupDecisionToken(token);
  if (lookup.status !== "ok") return { status: "invalid", reason: lookup.status };

  const rental = await prisma.theokotRental.findUnique({ where: { id: lookup.rentalId } });
  if (!rental) return { status: "invalid", reason: "unknown" };

  const [templates, config] = await Promise.all([getRentalTemplates(), getRentalConfig()]);
  const locale = rental.locale === "en" ? "en" : "nl";
  const category: RentalTemplateCategory = lookup.action === "APPROVE" ? "approved" : "rejected";
  const template = defaultTemplateFor(templates, category, locale);

  const vars = mailVarsForRow(rental, config.signature, locale);
  const rendered = templates.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    lang: item.lang,
    attachContract: item.attachContract,
    ...renderRentalMail(item, vars),
  }));

  // Of er een contract klaarstaat hangt aan de aanvraag en niet aan het sjabloon,
  // dus dit antwoord geldt voor elke keuze in de lijst hierboven.
  const contract = await loadContractAttachment(rental.renterType, locale);

  const clashes = await prisma.theokotRental.findMany({
    where: {
      id: { not: rental.id },
      startsAt: { lt: rental.endsAt },
      endsAt: { gt: rental.startsAt },
    },
    select: { responsibleName: true, startsAt: true, endsAt: true, status: true },
  });

  const start = formatRentalMoment(rental.startsAt, locale);
  const end = formatRentalMoment(rental.endsAt, locale);

  return {
    status: "ok",
    action: lookup.action,
    rental: {
      id: rental.id,
      responsibleName: rental.responsibleName,
      email: rental.email,
      phone: rental.phone,
      purpose: rental.purpose,
      attendees: rental.attendees,
      remarks: rental.remarks,
      locale,
      renterType: rental.renterType,
      depositLabel: DEPOSIT_CHOICE_META[rental.depositChoice][locale],
      statusLabel: RENTAL_STATUS_META[rental.status],
      alreadyDecided: rental.status !== "UNANSWERED",
      startDate: start.date,
      startTime: start.time,
      endTime: end.time,
    },
    templates: rendered,
    defaultTemplateId: template?.id ?? rendered[0]?.id ?? null,
    contractReady: contract !== null,
    clashes: clashes.filter((row) => blocksRoom(row.status)).map((row) => describeRentalWindow(row, locale)),
  };
}

/**
 * De knop op de beslispagina.
 *
 * `mode` is het hele punt van dit scherm: `send` zet de status én mailt de
 * aanvrager, `status` zet enkel de status. Beide verbruiken het token, zodat de
 * andere knop uit dezelfde mail daarna niets meer doet.
 */
export async function decideRentalByTokenAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const token = toSingleLine(formData.get("token"));
  const mode = toSingleLine(formData.get("mode"));
  if (!token) return saveError("NOT_FOUND");

  const lookup = await lookupDecisionToken(token);
  if (lookup.status !== "ok") return saveError("NOT_FOUND");

  const rental = await prisma.theokotRental.findUnique({ where: { id: lookup.rentalId } });
  if (!rental) return saveError("NOT_FOUND");

  const status: RentalStatus = lookup.action === "APPROVE" ? "APPROVED" : "REJECTED";
  const now = new Date();

  if (mode === "send") {
    const subject = toSingleLine(formData.get("subject"));
    const body = toMessageText(formData.get("body"));
    if (!subject || !body) return saveError("MAIL_EMPTY");
    if (!rental.email) return saveError("NO_RECIPIENT");

    const attachContract = formData.get("attachContract") === "on";
    const attachment = attachContract
      ? await loadContractAttachment(rental.renterType, rental.locale === "en" ? "en" : "nl")
      : null;
    if (attachContract && !attachment) return saveError("CONTRACT_MISSING");

    // Pas claimen wanneer de mail echt weg kan: een mislukte verzending mag het
    // token niet opbranden, anders staat wie op de knop drukte met lege handen.
    if (!(await consumeDecisionToken(lookup.tokenId, now))) return saveError("NOT_FOUND");

    const delivered = await sendRentalMail({
      to: rental.email,
      subject,
      text: body,
      attachments: attachment ? [attachment] : undefined,
    });
    if (!delivered) return saveError("MAIL_FAILED");

    await logRentalMessage({
      rentalId: rental.id,
      kind: "reply",
      templateId: toSingleLine(formData.get("templateId")) || null,
      to: rental.email,
      subject,
      body,
      attachmentName: attachment?.filename ?? null,
      sentViaMail: true,
    });
    await prisma.theokotRental.update({
      where: { id: rental.id },
      data: {
        status,
        decidedAt: now,
        decidedViaMail: true,
        requesterNotifiedAt: now,
      },
    });
  } else {
    if (!(await consumeDecisionToken(lookup.tokenId, now))) return saveError("NOT_FOUND");
    await prisma.theokotRental.update({
      where: { id: rental.id },
      data: { status, decidedAt: now, decidedViaMail: true },
    });
  }

  await revokeDecisionTokens(rental.id, now);
  await logAudit({
    action: "update",
    entity: "theokotRental",
    entityId: rental.id,
    target: rental.responsibleName,
    summary:
      mode === "send"
        ? `via de meldingsmail op ${RENTAL_STATUS_META[status].nl} gezet, met mail naar de aanvrager`
        : `via de meldingsmail op ${RENTAL_STATUS_META[status].nl} gezet, zonder mail`,
  });

  revalidateRentals();
  return saveOk();
}

/**
 * Nieuwe knoppen voor een aanvraag waarvan de vorige mail verlopen of verbruikt
 * is. Stuurt de melding opnieuw naar de behandelaars.
 */
export async function resendRentalNotificationAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireRentalManager();
  const id = toSingleLine(formData.get("rentalId"));
  const rental = await prisma.theokotRental.findUnique({ where: { id } });
  if (!rental) return saveError("NOT_FOUND");

  const questions = await getRentalQuestions();
  const answers = (rental.extraAnswers ?? {}) as Record<string, string>;
  const clashes = await prisma.theokotRental.findMany({
    where: { id: { not: rental.id }, startsAt: { lt: rental.endsAt }, endsAt: { gt: rental.startsAt } },
    select: { responsibleName: true, startsAt: true, endsAt: true, status: true },
  });

  await revokeDecisionTokens(rental.id);
  await notifyNewRental({
    id: rental.id,
    responsibleName: rental.responsibleName,
    email: rental.email,
    phone: rental.phone,
    startsAt: rental.startsAt,
    endsAt: rental.endsAt,
    purpose: rental.purpose,
    attendees: rental.attendees,
    depositChoice: rental.depositChoice,
    remarks: rental.remarks,
    renterType: rental.renterType,
    locale: rental.locale === "en" ? "en" : "nl",
    extraAnswers: questions.extra
      .filter((question) => answers[question.id])
      .map((question) => ({ label: question.labelNl, value: answers[question.id]! })),
    clashes: clashes.filter((row) => blocksRoom(row.status)).map((row) => describeRentalWindow(row, "nl")),
  });

  return saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: instellingen
// -----------------------------------------------------------------------------

async function writeSetting(key: string, value: unknown): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value: value as object },
    create: { key, value: value as object },
  });
}

export async function saveRentalConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireRentalManager();

  const notifyEmails = splitEmails(toMessageText(formData.get("notifyEmails")));
  if (notifyEmails.length === 0) return saveError("NO_NOTIFY_EMAIL");

  const replyTo = toSingleLine(formData.get("replyTo")) || notifyEmails[0]!;
  const signature = toMessageText(formData.get("signature"));
  const minLeadDays = clampLeadDays(formData.get("minLeadDays"));
  const formOpen = formData.get("formOpen") === "on";

  await writeSetting(RENTAL_CONFIG_KEY, {
    notifyEmails,
    replyTo,
    signature,
    minLeadDays,
    formOpen,
    closedNoticeNl: toMessageText(formData.get("closedNoticeNl")),
    closedNoticeEn: toMessageText(formData.get("closedNoticeEn")),
  });

  await logAudit({
    action: "update",
    entity: "theokotRentalSettings",
    target: "Verhuurinstellingen",
    summary: formOpen ? "formulier staat open" : "formulier staat dicht",
  });
  revalidateRentals();
  revalidatePath("/theokot/verhuur");
  revalidatePath("/en/theokot/verhuur");
  return saveOk();
}

export async function saveRentalGuideAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireRentalManager();
  await writeSetting(RENTAL_GUIDE_KEY, {
    guidelinesNl: toMessageText(formData.get("guidelinesNl")),
    guidelinesEn: toMessageText(formData.get("guidelinesEn")),
    handbook: toMessageText(formData.get("handbook")),
  });
  await logAudit({
    action: "update",
    entity: "theokotRentalSettings",
    target: "Richtlijnen en handleiding",
  });
  revalidateRentals();
  revalidatePath("/theokot/verhuur");
  revalidatePath("/en/theokot/verhuur");
  return saveOk();
}

/**
 * De vragenlijst van het publieke formulier.
 *
 * De kernvragen zijn te herschrijven maar niet te schrappen: op `day`,
 * `startTime` en `endTime` hangt de kalender, en zonder `email` gaat er geen
 * enkele mail ergens naartoe. Wat Theokot er zelf bij zet, staat los.
 */
export async function saveRentalQuestionsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireRentalManager();

  const core: Record<string, unknown> = {};
  for (const key of CORE_QUESTIONS) {
    const labelNl = toSingleLine(formData.get(`core:${key}:labelNl`));
    if (!labelNl) return saveError("QUESTION_EMPTY");
    core[key] = {
      labelNl,
      labelEn: toSingleLine(formData.get(`core:${key}:labelEn`)) || labelNl,
      helpNl: toMessageText(formData.get(`core:${key}:helpNl`)),
      helpEn: toMessageText(formData.get(`core:${key}:helpEn`)),
      required: REQUIRED_CORE_QUESTIONS.includes(key as CoreQuestionKey)
        ? true
        : formData.get(`core:${key}:required`) === "on",
    };
  }

  const extra: unknown[] = [];
  const ids = formData.getAll("extraId").map((value) => toSingleLine(value)).filter(Boolean);
  for (const id of ids) {
    const labelNl = toSingleLine(formData.get(`extra:${id}:labelNl`));
    if (!labelNl) return saveError("QUESTION_EMPTY");
    const typeRaw = toSingleLine(formData.get(`extra:${id}:type`));
    const type = (EXTRA_QUESTION_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : "text";
    const options = toMessageText(formData.get(`extra:${id}:options`))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // "Ja | Yes" zet de Engelse variant achter een pijp; zonder pijp geldt
        // dezelfde tekst in beide talen.
        const [nl, en] = line.split("|").map((part) => part.trim());
        return { value: nl!, labelNl: nl!, labelEn: en || nl! };
      });

    extra.push({
      id,
      type,
      labelNl,
      labelEn: toSingleLine(formData.get(`extra:${id}:labelEn`)) || labelNl,
      helpNl: toMessageText(formData.get(`extra:${id}:helpNl`)),
      helpEn: toMessageText(formData.get(`extra:${id}:helpEn`)),
      required: formData.get(`extra:${id}:required`) === "on",
      options,
    });
  }

  await writeSetting(RENTAL_QUESTIONS_KEY, { core, extra });
  await logAudit({
    action: "update",
    entity: "theokotRentalSettings",
    target: "Vragen van het aanvraagformulier",
    summary: `${extra.length} eigen ${extra.length === 1 ? "vraag" : "vragen"}`,
  });
  revalidateRentals();
  revalidatePath("/theokot/verhuur");
  revalidatePath("/en/theokot/verhuur");
  return saveOk();
}

/** Eén sjabloon bewaren; een nieuw sjabloon krijgt hier zijn id. */
export async function saveRentalTemplateAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireRentalManager();

  const name = toSingleLine(formData.get("name"));
  const subject = toSingleLine(formData.get("subject"));
  const body = toMessageText(formData.get("body"));
  if (!name || !subject || !body) return saveError("TEMPLATE_EMPTY");

  const templates = await getRentalTemplates();
  const id = toSingleLine(formData.get("templateId")) || `custom-${Date.now().toString(36)}`;
  const categoryRaw = toSingleLine(formData.get("category"));
  const category: RentalTemplateCategory =
    categoryRaw === "confirmation" || categoryRaw === "approved" || categoryRaw === "rejected"
      ? categoryRaw
      : "other";

  const next: RentalTemplate = {
    id,
    name,
    category,
    lang: toSingleLine(formData.get("lang")) === "en" ? "en" : "nl",
    subject,
    body,
    attachContract: formData.get("attachContract") === "on",
    isDefault: templates.find((item) => item.id === id)?.isDefault ?? false,
  };

  const items = templates.some((item) => item.id === id)
    ? templates.map((item) => (item.id === id ? next : item))
    : [...templates, next];

  await writeSetting(RENTAL_MAIL_KEY, { items });
  await logAudit({
    action: "update",
    entity: "theokotRentalSettings",
    entityId: id,
    target: name,
    summary: "mailsjabloon bewaard",
  });
  revalidateRentals();
  return saveOk();
}

export async function deleteRentalTemplateAction(formData: FormData): Promise<void> {
  await requireRentalManager();
  const id = toSingleLine(formData.get("templateId"));
  if (!id) return;

  const templates = await getRentalTemplates();
  const target = templates.find((item) => item.id === id);
  // Een standaardsjabloon verdwijnt niet: de knoppen in het beheer en in de
  // meldingsmail rekenen erop dat er altijd een goedkeurings- en een
  // weigeringstekst is. Bewerken mag wel.
  if (!target || target.isDefault) return;

  await writeSetting(RENTAL_MAIL_KEY, { items: templates.filter((item) => item.id !== id) });
  await logAudit({
    action: "delete",
    entity: "theokotRentalSettings",
    entityId: id,
    target: target.name,
    summary: "mailsjabloon verwijderd",
  });
  revalidateRentals();
}

// -----------------------------------------------------------------------------
// Beheer: het huurcontract
// -----------------------------------------------------------------------------

/** Een huurcontract is een paar bladzijden tekst; meer dan dit is een vergissing. */
const MAX_CONTRACT_BYTES = 15 * 1024 * 1024;

export async function uploadRentalContractAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireRentalManager();

  const audience = toSingleLine(formData.get("audience"));
  const locale = toSingleLine(formData.get("locale")) === "en" ? "en" : "nl";
  if (!isRenterType(audience)) return saveError("INVALID_INPUT");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return saveError("FILE_REQUIRED");
  if (file.size > MAX_CONTRACT_BYTES) return saveError("FILE_TOO_LARGE");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return saveError("FILE_NOT_PDF");

  const storageKey = newStorageKey("theokot/contracten", file.name || "huurcontract.pdf");
  await putObject(storageKey, Buffer.from(await file.arrayBuffer()), "application/pdf");

  const previous = await prisma.theokotRentalContractDoc.findUnique({
    where: { audience_locale: { audience, locale } },
    select: { storageKey: true },
  });

  await prisma.theokotRentalContractDoc.upsert({
    where: { audience_locale: { audience, locale } },
    update: {
      storageKey,
      fileName: file.name || "huurcontract.pdf",
      sizeBytes: file.size,
      uploadedById: session.user.id,
    },
    create: {
      audience,
      locale,
      storageKey,
      fileName: file.name || "huurcontract.pdf",
      sizeBytes: file.size,
      uploadedById: session.user.id,
    },
  });

  // Het oude bestand pas weg wanneer de rij naar het nieuwe wijst; loopt de
  // upsert mis, dan staat er nog altijd een werkend contract.
  if (previous?.storageKey && previous.storageKey !== storageKey) {
    await deleteObject(previous.storageKey).catch(() => {});
  }

  await logAudit({
    action: "update",
    entity: "theokotRentalContract",
    target: `${audience === "INTERNAL" ? "Intern" : "Extern"} · ${locale.toUpperCase()}`,
    summary: `huurcontract vervangen door ${file.name}`,
  });
  revalidateRentals();
  return saveOk();
}

export async function deleteRentalContractAction(formData: FormData): Promise<void> {
  await requireRentalManager();
  const id = toSingleLine(formData.get("contractId"));
  if (!id) return;

  const doc = await prisma.theokotRentalContractDoc.findUnique({ where: { id } });
  if (!doc) return;

  await prisma.theokotRentalContractDoc.delete({ where: { id } });
  await deleteObject(doc.storageKey).catch(() => {});
  await logAudit({
    action: "delete",
    entity: "theokotRentalContract",
    target: `${doc.audience === "INTERNAL" ? "Intern" : "Extern"} · ${doc.locale.toUpperCase()}`,
    summary: `huurcontract ${doc.fileName} verwijderd`,
  });
  revalidateRentals();
}
