"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { RateLimiter, clientKeyFromHeaders, toMessageText, toSingleLine } from "@/lib/contactForm";
import { brusselsWallClockMinutes } from "@/lib/brussels";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import {
  LESBEZOEK_COLOURS,
  LESBEZOEK_LIMITS,
  LESBEZOEK_RATE_LIMIT,
  isLesbezoekStatus,
  nextOrganisationColour,
  organisationKey,
  parseDateTimeFields,
  parseLesbezoekRequest,
  teacherNameFromEmail,
  visitEnd,
  type LesbezoekStatusCode,
} from "@/lib/lesbezoeken";
import {
  LESBEZOEK_CONFIG_KEY,
  LESBEZOEK_MAIL_KEY,
  notifyNewLesbezoek,
  sendLesbezoekMail,
} from "@/lib/lesbezoeken-server";
import {
  LESBEZOEK_TEMPLATE_KEYS,
  type LesbezoekTemplateItem,
} from "@/lib/lesbezoekenMail";

/**
 * Server actions van de lesbezoeken.
 *
 * De publieke aanvraag staat helemaal bovenaan en is de enige zonder login; al de
 * rest hercontroleert `lesbezoeken.manage`. De statuslogica zelf staat in
 * `lib/lesbezoeken.ts`, het versturen in `lib/lesbezoeken-server.ts`.
 */

const ADMIN_PATHS = ["/admin/lesbezoeken", "/en/admin/lesbezoeken"];

/** De beheerlijst moet mee verversen, anders blijft staan wat je net wijzigde. */
function revalidateLesbezoeken() {
  for (const path of ADMIN_PATHS) revalidatePath(path);
}

/** Wandklok naar instant; `null` wanneer datum of uur niet kloppen. */
function toInstant(date: string, time: string): Date | null {
  const parts = parseDateTimeFields(date, time);
  if (!parts) return null;
  return brusselsWallClockMinutes(
    { year: parts.year, month: parts.month, day: parts.day },
    parts.minutes,
  );
}

// -----------------------------------------------------------------------------
// Publiek: een lesbezoek aanvragen
// -----------------------------------------------------------------------------

/**
 * De teller staat in het geheugen van dit proces, net als bij het
 * contactformulier: bij een herstart begint ze opnieuw en met meerdere containers
 * telt elk zijn eigen deel. Voor een drempel tegen scripts volstaat dat, en het
 * scheelt een tabel en een opkuistaak.
 */
const limiter = new RateLimiter(LESBEZOEK_RATE_LIMIT.max, LESBEZOEK_RATE_LIMIT.windowMs);

/**
 * Het publieke aanvraagformulier op /lesbezoeken.
 *
 * Bewust zonder login: de helft van de aanvragers is geen VTK-lid (andere
 * kringen, studentenverenigingen, externen), en die een account laten maken om
 * één vraag te stellen zou het formulier vervangen door een drempel. De
 * bescherming is dus dezelfde als bij het contactformulier: een honeypot en een
 * snelheidslimiet per IP.
 */
export async function requestLesbezoekAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const date = toSingleLine(formData.get("date"));
  const time = toSingleLine(formData.get("time"));
  const startsAt = date && time ? toInstant(date, time) : null;

  const rawAudiences = formData.getAll("audience");
  const audience = rawAudiences.length > 1 ? rawAudiences : formData.get("audience");

  const parsed = parseLesbezoekRequest(
    {
      organisationId: formData.get("organisationId"),
      organisationName: formData.get("organisationName"),
      requesterName: formData.get("requesterName"),
      requesterEmail: formData.get("requesterEmail"),
      requesterPhone: formData.get("requesterPhone"),
      subject: formData.get("subject"),
      teacherNote: formData.get("teacherNote"),
      audience,
      audiences: formData.getAll("audiences"),
      audienceOther: formData.get("audienceOther"),
      course: formData.get("course"),
      teacherEmail: formData.get("teacherEmail"),
      date,
      time,
      longVisit: formData.get("longVisit"),
      honeypot: formData.get("website"),
    },
    { startsAt },
  );

  // De honeypot: doen alsof het gelukt is. Een bot die een foutmelding krijgt,
  // weet dat hij ontdekt is en past zijn volgende poging aan.
  if (parsed.status === "honeypot") return saveOk();
  if (parsed.status === "error") return saveError(parsed.code);
  if (!startsAt) return saveError("DATE_INVALID");

  const key = clientKeyFromHeaders(await headers());
  if (!limiter.take(key)) return saveError("RATE_LIMITED");

  const request = parsed.request;

  // De organisatie: uit de keuzelijst, of een naam die de aanvrager zelf intikte.
  // Die naam eerst hoofdletter- en streepjesongevoelig opzoeken, anders staan
  // "VTK - Onderwijs" en "VTK Onderwijs" morgen als twee kleuren in de kalender.
  let organisationId = request.organisationId;
  if (organisationId) {
    const exists = await prisma.lesbezoekOrganisation.findFirst({
      where: { id: organisationId, active: true },
      select: { id: true },
    });
    if (!exists) organisationId = null;
  }

  if (!organisationId) {
    const wanted = organisationKey(request.organisationName);
    if (!wanted) return saveError("ORGANISATION_REQUIRED");

    const all = await prisma.lesbezoekOrganisation.findMany({
      select: { id: true, name: true, colour: true },
    });
    const match = all.find((row) => organisationKey(row.name) === wanted);
    if (match) {
      organisationId = match.id;
    } else {
      const created = await prisma.lesbezoekOrganisation.create({
        data: {
          name: request.organisationName,
          colour: nextOrganisationColour(all.map((row) => row.colour)),
        },
        select: { id: true },
      });
      organisationId = created.id;
    }
  }

  const visit = await prisma.lesbezoek.create({
    data: {
      organisationId,
      startsAt,
      endsAt: visitEnd(startsAt, request.longVisit),
      longVisit: request.longVisit,
      audience: request.audience,
      course: request.course,
      subject: request.subject,
      teacherNote: request.teacherNote,
      teacherEmail: request.teacherEmail,
      teacherName: teacherNameFromEmail(request.teacherEmail),
      requesterName: request.requesterName || null,
      requesterEmail: request.requesterEmail,
      requesterPhone: request.requesterPhone,
    },
    select: {
      startsAt: true,
      course: true,
      audience: true,
      subject: true,
      teacherEmail: true,
      requesterEmail: true,
      organisation: { select: { name: true } },
    },
  });

  await notifyNewLesbezoek(visit);
  revalidateLesbezoeken();

  // Geen `redirect`: het formulier blijft staan met een groene toast en een
  // zichtbare bevestiging, zodat een organisatie meteen een tweede doelgroep kan
  // aanvragen zonder alles opnieuw te zoeken.
  return saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: het bezoek zelf
// -----------------------------------------------------------------------------

/** Beheerder maakt een bezoek aan of bewerkt er een. */
export async function saveLesbezoekAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("lesbezoeken.manage");

  const id = toSingleLine(formData.get("id"));
  const organisationId = toSingleLine(formData.get("organisationId"));
  const date = toSingleLine(formData.get("date"));
  const time = toSingleLine(formData.get("time"));
  const endTime = toSingleLine(formData.get("endTime"));
  const longVisit = formData.get("longVisit") === "on";

  if (!organisationId) return saveError("ORGANISATION_REQUIRED");
  const startsAt = toInstant(date, time);
  if (!startsAt) return saveError("DATE_INVALID");

  // Een eigen einduur mag, bijvoorbeeld wanneer de professor een ander moment
  // voorstelde; zonder ingevuld einduur volgt het uit "kort of lang bezoek".
  const explicitEnd = endTime ? toInstant(date, endTime) : null;
  const endsAt = explicitEnd && explicitEnd > startsAt ? explicitEnd : visitEnd(startsAt, longVisit);

   const teacherEmail = toSingleLine(formData.get("teacherEmail"));
  const rawAudiences = formData
    .getAll("audience")
    .map(toSingleLine)
    .filter((v) => v && v !== "__other__");
  const audience = (
    rawAudiences.length > 0 ? rawAudiences.join(", ") : toSingleLine(formData.get("audience"))
  ).slice(0, LESBEZOEK_LIMITS.audience);

  const data = {
    organisationId,
    startsAt,
    endsAt,
    longVisit,
    audience,
    course: toSingleLine(formData.get("course")).slice(0, LESBEZOEK_LIMITS.course),
    subject: toSingleLine(formData.get("subject")).slice(0, LESBEZOEK_LIMITS.subject),
    teacherNote: toMessageText(formData.get("teacherNote")).slice(0, LESBEZOEK_LIMITS.teacherNote),
    teacherEmail,
    teacherName: toSingleLine(formData.get("teacherName")) || teacherNameFromEmail(teacherEmail),
    requesterName: toSingleLine(formData.get("requesterName")) || null,
    requesterEmail: toSingleLine(formData.get("requesterEmail")) || null,
    requesterPhone: toSingleLine(formData.get("requesterPhone")) || null,
  };

  if (!data.audience || !data.course || !data.subject) return saveError("INVALID_INPUT");
  if (!data.teacherEmail) return saveError("TEACHER_EMAIL_REQUIRED");

  if (id) {
    const before = await prisma.lesbezoek.findUnique({
      where: { id },
      select: { course: true, organisation: { select: { name: true } } },
    });
    if (!before) return saveError("NOT_FOUND");
    await prisma.lesbezoek.update({ where: { id }, data });
    await logAudit({
      action: "update",
      entity: "lesbezoek",
      entityId: id,
      target: `${before.organisation.name} — ${data.course}`,
    });
  } else {
    const created = await prisma.lesbezoek.create({
      data: { ...data, createdById: session.user.id },
      select: { id: true, organisation: { select: { name: true } } },
    });
    await logAudit({
      action: "create",
      entity: "lesbezoek",
      entityId: created.id,
      target: `${created.organisation.name} — ${data.course}`,
    });
  }

  revalidateLesbezoeken();
  return saveOk();
}

/**
 * Zet de status van een aanvraag, met de reden erbij.
 *
 * De professor antwoordt per mail en niet in deze app, dus dit is het moment
 * waarop een mens zijn antwoord overzet. De reden komt in de terugkoppeling naar
 * de aanvrager terecht, en is bij een weigering daarom verplicht: "afgewezen"
 * zonder waarom levert alleen maar een mail terug op.
 */
export async function reviewLesbezoekAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("lesbezoeken.manage");

  const id = toSingleLine(formData.get("id"));
  const status = toSingleLine(formData.get("status"));
  const reviewNote = toMessageText(formData.get("reviewNote"));

  if (!id || !isLesbezoekStatus(status)) return saveError("INVALID_INPUT");
  const needsReason: LesbezoekStatusCode[] = ["REJECTED", "DECLINED"];
  if (needsReason.includes(status) && reviewNote === "") return saveError("REASON_REQUIRED");

  const before = await prisma.lesbezoek.findUnique({
    where: { id },
    select: { status: true, course: true, organisation: { select: { name: true } } },
  });
  if (!before) return saveError("NOT_FOUND");

  await prisma.lesbezoek.update({
    where: { id },
    data: {
      status,
      reviewNote: reviewNote || null,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    },
  });

  await logAudit({
    action: "update",
    entity: "lesbezoek",
    entityId: id,
    target: `${before.organisation.name} — ${before.course}`,
    summary: `status ${before.status} -> ${status}`,
  });

  revalidateLesbezoeken();
  return saveOk();
}

/** Verwijdert een aanvraag. Voor rommel en dubbels; een echte weigering is een status. */
export async function deleteLesbezoekAction(formData: FormData): Promise<void> {
  await requirePermission("lesbezoeken.manage");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const before = await prisma.lesbezoek.findUnique({
    where: { id },
    select: { course: true, organisation: { select: { name: true } } },
  });
  if (!before) return;

  await prisma.lesbezoek.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "lesbezoek",
    entityId: id,
    target: `${before.organisation.name} — ${before.course}`,
  });
  revalidateLesbezoeken();
}

// -----------------------------------------------------------------------------
// Beheer: mailen
// -----------------------------------------------------------------------------

/** Welke mail er vertrekt, en wat dat met de aanvraag doet. */
const MAIL_KINDS = {
  /** De vraag naar de professor. Zet de aanvraag op "bij de prof". */
  professor: { status: "ASKED" as LesbezoekStatusCode, stamp: "professorMailedAt" as const },
  /** Een herinnering aan diezelfde professor; de status verandert niet. */
  nudge: { status: null, stamp: "professorNudgedAt" as const },
  /** De terugkoppeling naar de aanvrager; de status verandert niet. */
  requester: { status: null, stamp: "requesterNotifiedAt" as const },
} as const;

type MailKind = keyof typeof MAIL_KINDS;

function isMailKind(value: string): value is MailKind {
  return value in MAIL_KINDS;
}

/**
 * Verstuurt een mail over een lesbezoek en houdt bij dat ze vertrokken is.
 *
 * Onderwerp en tekst komen uit het formulier en niet rechtstreeks uit het
 * sjabloon: het scherm vult het sjabloon in, laat het nalezen en aanpassen, en
 * pas dan gaat het weg. Dat is de plek waar de oude werkwijze een "Uitvoeren"- en
 * een "Vliegveld"-tabblad voor nodig had.
 */
export async function sendLesbezoekMailAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("lesbezoeken.manage");

  const id = toSingleLine(formData.get("id"));
  const kind = toSingleLine(formData.get("kind"));
  const subject = toSingleLine(formData.get("subject"));
  const body = toMessageText(formData.get("body"));

  if (!id || !isMailKind(kind)) return saveError("INVALID_INPUT");
  if (!subject || !body) return saveError("MAIL_EMPTY");

  const visit = await prisma.lesbezoek.findUnique({
    where: { id },
    select: {
      teacherEmail: true,
      requesterEmail: true,
      course: true,
      organisation: { select: { name: true, contactEmail: true } },
    },
  });
  if (!visit) return saveError("NOT_FOUND");

  const to = kind === "requester" ? visit.requesterEmail : visit.teacherEmail;
  if (!to) return saveError("NO_RECIPIENT");

  const delivered = await sendLesbezoekMail({
    to,
    subject,
    text: body,
    // De mailbox van de organisatie leest mee bij een terugkoppeling: de persoon
    // die aanvroeg is volgend jaar weg, de post blijft.
    cc: kind === "requester" ? (visit.organisation.contactEmail ?? undefined) : undefined,
  });
  if (!delivered) return saveError("MAIL_FAILED");

  const rule = MAIL_KINDS[kind];
  await prisma.$transaction([
    prisma.lesbezoek.update({
      where: { id },
      data: {
        [rule.stamp]: new Date(),
        ...(rule.status ? { status: rule.status } : {}),
      },
    }),
    prisma.lesbezoekScheduledMail.deleteMany({
      where: { lesbezoekId: id, sentAt: null },
    }),
  ]);

  await logAudit({
    action: "send",
    entity: "lesbezoek",
    entityId: id,
    target: `${visit.organisation.name} — ${visit.course}`,
    summary: `mail naar ${to}`,
  });

  revalidateLesbezoeken();
  return saveOk();
}

/**
 * Plant een mail in voor een lesbezoek op een toekomstig tijdstip (Brussel-tijd).
 */
export async function scheduleLesbezoekMailAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("lesbezoeken.manage");

  const id = toSingleLine(formData.get("id"));
  const kind = toSingleLine(formData.get("kind"));
  const subject = toSingleLine(formData.get("subject"));
  const body = toMessageText(formData.get("body"));
  const sendAtDate = toSingleLine(formData.get("sendAtDate"));
  const sendAtTime = toSingleLine(formData.get("sendAtTime"));

  if (!id || !isMailKind(kind)) return saveError("INVALID_INPUT");
  if (!subject || !body) return saveError("MAIL_EMPTY");
  if (!sendAtDate || !sendAtTime) return saveError("SCHEDULE_TIME_INVALID");

  const sendAt = toInstant(sendAtDate, sendAtTime);
  if (!sendAt) return saveError("SCHEDULE_TIME_INVALID");

  // Moet in de toekomst liggen (met kleine speling van 30s)
  if (sendAt.getTime() <= Date.now() + 30_000) {
    return saveError("SCHEDULE_TIME_PAST");
  }

  const visit = await prisma.lesbezoek.findUnique({
    where: { id },
    select: {
      teacherEmail: true,
      requesterEmail: true,
      course: true,
      organisation: { select: { name: true, contactEmail: true } },
    },
  });
  if (!visit) return saveError("NOT_FOUND");

  const to = kind === "requester" ? visit.requesterEmail : visit.teacherEmail;
  if (!to) return saveError("NO_RECIPIENT");
  const cc = kind === "requester" ? (visit.organisation.contactEmail ?? null) : null;

  // Vervang eventuele eerdere openstaande geplande mail voor dit lesbezoek
  await prisma.lesbezoekScheduledMail.deleteMany({
    where: { lesbezoekId: id, sentAt: null },
  });

  const created = await prisma.lesbezoekScheduledMail.create({
    data: {
      lesbezoekId: id,
      kind,
      to,
      cc,
      subject,
      body,
      sendAt,
      createdById: session.user.id,
    },
    select: { id: true },
  });

  await logAudit({
    action: "create",
    entity: "lesbezoekScheduledMail",
    entityId: created.id,
    target: `${visit.organisation.name} — ${visit.course}`,
    summary: `mail naar ${to} ingepland voor ${sendAtDate} om ${sendAtTime}`,
  });

  revalidateLesbezoeken();
  return saveOk();
}

/**
 * Annuleert een ingeplande mail voordat deze verstuurd is.
 */
export async function cancelLesbezoekScheduledMailAction(
  formData: FormData,
): Promise<void> {
  await requirePermission("lesbezoeken.manage");

  const id = toSingleLine(formData.get("id"));
  const lesbezoekId = toSingleLine(formData.get("lesbezoekId"));

  if (id) {
    const before = await prisma.lesbezoekScheduledMail.findUnique({
      where: { id },
      select: {
        to: true,
        lesbezoek: { select: { organisation: { select: { name: true } }, course: true } },
      },
    });
    if (before) {
      await prisma.lesbezoekScheduledMail.delete({ where: { id } });
      await logAudit({
        action: "delete",
        entity: "lesbezoekScheduledMail",
        entityId: id,
        target: `${before.lesbezoek.organisation.name} — ${before.lesbezoek.course}`,
        summary: `planning geannuleerd voor ${before.to}`,
      });
    }
  } else if (lesbezoekId) {
    await prisma.lesbezoekScheduledMail.deleteMany({
      where: { lesbezoekId, sentAt: null },
    });
  }

  revalidateLesbezoeken();
}

/**
 * Verstuurt een ingeplande mail onmiddellijk in plaats van te wachten op het geplande tijdstip.
 */
export async function sendNowLesbezoekScheduledMailAction(
  formData: FormData,
): Promise<void> {
  await requirePermission("lesbezoeken.manage");

  const id = toSingleLine(formData.get("id"));
  if (!id) return;

  const item = await prisma.lesbezoekScheduledMail.findUnique({
    where: { id },
    include: {
      lesbezoek: {
        select: {
          id: true,
          status: true,
          organisation: { select: { name: true } },
          course: true,
        },
      },
    },
  });
  if (!item || item.sentAt) return;

  const delivered = await sendLesbezoekMail({
    to: item.to,
    cc: item.cc ?? undefined,
    subject: item.subject,
    text: item.body,
  });

  if (delivered) {
    const now = new Date();
    await prisma.lesbezoekScheduledMail.update({
      where: { id },
      data: { sentAt: now },
    });

    const updateData: {
      professorMailedAt?: Date;
      professorNudgedAt?: Date;
      requesterNotifiedAt?: Date;
      status?: "ASKED";
    } = {};

    if (item.kind === "professor") {
      updateData.professorMailedAt = now;
      if (item.lesbezoek.status === "PENDING") {
        updateData.status = "ASKED";
      }
    } else if (item.kind === "nudge") {
      updateData.professorNudgedAt = now;
    } else if (item.kind === "requester") {
      updateData.requesterNotifiedAt = now;
    }

    await prisma.lesbezoek.update({
      where: { id: item.lesbezoekId },
      data: updateData,
    });

    await logAudit({
      action: "send",
      entity: "lesbezoekScheduledMail",
      entityId: id,
      target: `${item.lesbezoek.organisation.name} — ${item.lesbezoek.course}`,
      summary: `direct verzonden naar ${item.to}`,
    });
  }

  revalidateLesbezoeken();
}

// -----------------------------------------------------------------------------
// Beheer: organisaties
// -----------------------------------------------------------------------------

export async function saveLesbezoekOrganisationAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("lesbezoeken.manage");

  const id = toSingleLine(formData.get("id"));
  const name = toSingleLine(formData.get("name")).slice(0, LESBEZOEK_LIMITS.organisation);
  if (!name) return saveError("ORGANISATION_REQUIRED");

  const colour = toSingleLine(formData.get("colour"));
  const data = {
    name,
    colour: /^#[0-9a-f]{6}$/i.test(colour) ? colour : LESBEZOEK_COLOURS[0],
    contactEmail: toSingleLine(formData.get("contactEmail")) || null,
    note: toMessageText(formData.get("note")) || null,
    active: formData.get("active") === "on",
  };

  try {
    if (id) {
      await prisma.lesbezoekOrganisation.update({ where: { id }, data });
      await logAudit({
        action: "update",
        entity: "lesbezoekOrganisation",
        entityId: id,
        target: name,
      });
    } else {
      const created = await prisma.lesbezoekOrganisation.create({
        data,
        select: { id: true },
      });
      await logAudit({
        action: "create",
        entity: "lesbezoekOrganisation",
        entityId: created.id,
        target: name,
      });
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return saveError("ORGANISATION_TAKEN");
    }
    throw err;
  }

  revalidateLesbezoeken();
  return saveOk();
}

/**
 * Verwijdert een organisatie. Kan enkel wanneer er geen bezoeken meer aan hangen:
 * de kalender van vorig jaar mag niet halveren omdat iemand opruimt. Wie een
 * organisatie uit het formulier wil, zet ze op niet-actief.
 */
export async function deleteLesbezoekOrganisationAction(formData: FormData): Promise<void> {
  await requirePermission("lesbezoeken.manage");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const organisation = await prisma.lesbezoekOrganisation.findUnique({
    where: { id },
    select: { name: true, _count: { select: { visits: true } } },
  });
  if (!organisation || organisation._count.visits > 0) return;

  await prisma.lesbezoekOrganisation.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "lesbezoekOrganisation",
    entityId: id,
    target: organisation.name,
  });
  revalidateLesbezoeken();
}

// -----------------------------------------------------------------------------
// Beheer: bijzonderheden
// -----------------------------------------------------------------------------

export async function saveLesbezoekPeculiarityAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("lesbezoeken.manage");

  const id = toSingleLine(formData.get("id"));
  const subject = toSingleLine(formData.get("subject")).slice(0, 200);
  const note = toMessageText(formData.get("note")).slice(0, 1000);
  if (!subject || !note) return saveError("INVALID_INPUT");

  if (id) {
    await prisma.lesbezoekPeculiarity.update({ where: { id }, data: { subject, note } });
    await logAudit({ action: "update", entity: "lesbezoekPeculiarity", entityId: id, target: subject });
  } else {
    const created = await prisma.lesbezoekPeculiarity.create({
      data: { subject, note },
      select: { id: true },
    });
    await logAudit({
      action: "create",
      entity: "lesbezoekPeculiarity",
      entityId: created.id,
      target: subject,
    });
  }

  revalidateLesbezoeken();
  return saveOk();
}

export async function deleteLesbezoekPeculiarityAction(formData: FormData): Promise<void> {
  await requirePermission("lesbezoeken.manage");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const before = await prisma.lesbezoekPeculiarity.findUnique({
    where: { id },
    select: { subject: true },
  });
  if (!before) return;

  await prisma.lesbezoekPeculiarity.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "lesbezoekPeculiarity",
    entityId: id,
    target: before.subject,
  });
  revalidateLesbezoeken();
}

// -----------------------------------------------------------------------------
// Beheer: instellingen en sjablonen
// -----------------------------------------------------------------------------

export async function saveLesbezoekSettingsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("lesbezoeken.manage");

  const signature = toMessageText(formData.get("signature")).slice(0, 500);
  const notifyEmail = toSingleLine(formData.get("notifyEmail"));
  if (!notifyEmail) return saveError("INVALID_INPUT");

  const value = { signature, notifyEmail };
  await prisma.setting.upsert({
    where: { key: LESBEZOEK_CONFIG_KEY },
    create: { key: LESBEZOEK_CONFIG_KEY, value },
    update: { value },
  });

  await logAudit({ action: "update", entity: "lesbezoekSettings", target: "Instellingen" });
  revalidateLesbezoeken();
  return saveOk();
}

/**
 * Bewaart de mailsjablonen. Ondersteunt zowel dynamische sjablonen (toevoegen,
 * hernoemen, verwijderen) via JSON als de klassieke formuliervelden.
 */
export async function saveLesbezoekTemplatesAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("lesbezoeken.manage");

  const json = formData.get("templatesJson");
  const itemsToSave: LesbezoekTemplateItem[] = [];

  if (typeof json === "string" && json.trim()) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        for (const raw of parsed) {
          if (!raw || typeof raw !== "object") continue;
          const id = toSingleLine(raw.id) || `custom_${Math.random().toString(36).slice(2, 8)}`;
          const name = toSingleLine(raw.name) || "Sjabloon";
          const subject = toSingleLine(raw.subject);
          const body = toMessageText(raw.body);
          const category =
            raw.category === "professor" || raw.category === "nudge" || raw.category === "requester"
              ? raw.category
              : "other";
          const lang = raw.lang === "en" ? "en" : "nl";
          const isDefault = Boolean(raw.isDefault);

          itemsToSave.push({
            id,
            name,
            subject,
            body,
            category,
            lang,
            isDefault,
          });
        }
      }
    } catch {
      return saveError("INVALID_INPUT");
    }
  } else {
    for (const key of LESBEZOEK_TEMPLATE_KEYS) {
      const subject = toSingleLine(formData.get(`${key}.subject`));
      const body = toMessageText(formData.get(`${key}.body`));
      const name = toSingleLine(formData.get(`${key}.name`));
      itemsToSave.push({
        id: key,
        name: name || key,
        subject,
        body,
        isDefault: true,
      });
    }
  }

  await prisma.setting.upsert({
    where: { key: LESBEZOEK_MAIL_KEY },
    create: { key: LESBEZOEK_MAIL_KEY, value: itemsToSave },
    update: { value: itemsToSave },
  });

  await logAudit({ action: "update", entity: "lesbezoekSettings", target: "Mailsjablonen" });
  revalidateLesbezoeken();
  return saveOk();
}
