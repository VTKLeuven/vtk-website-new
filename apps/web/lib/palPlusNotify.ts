import "server-only";

import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vtk/db";
import { sendMail, smtpConfigured } from "@/lib/email";
import { preferredEmail } from "@/lib/brevo/contacts";
import { derivedGroupMailAddress, groupMailAddress } from "@/lib/groupMail";
import { siteBaseUrl } from "@/lib/calendar/feeds";
import {
  palPlusCourseLabel,
  palPlusRequestCourseLabel,
  palPlusRoomLabel,
  PAL_PLUS_REMINDER_LEAD_MS,
} from "@/lib/palPlus";
import { earnedPalPlusReward } from "@/lib/shift/rewards";
import { praesidiumYears } from "@/lib/shift/voucherEligibility";
import {
  palPlusNewRequestNotificationMail,
  palPlusRequestClosedMail,
  palPlusRequestPublishedMail,
  palPlusRequestReceivedMail,
  palPlusSessionCancelledMail,
  palPlusSessionChangedMail,
  palPlusSessionForRequestMail,
  palPlusSessionReminderMail,
  palPlusTutorAssignedMail,
  type PalPlusMail,
  type PalPlusMailLocale,
  type PalPlusMailRole,
  type PalPlusMailSession,
  type PalPlusSessionChange,
} from "@/lib/palPlusMail";

/**
 * Wie welke PAL+-mail krijgt, en wanneer. De teksten staan in
 * `lib/palPlusMail.ts`.
 *
 * De server actions roepen dit aan via `after()`: de mail vertrekt na het
 * antwoord, zodat een annulering met dertig ingeschrevenen niet wacht op dertig
 * keer de mailserver. Een mail die mislukt, laat de actie dus ook niet mislukken;
 * ze staat in het maillogboek (/admin/it/email-logboek, herkomst PAL+) en in
 * Sentry.
 *
 * Twee regels gelden overal:
 * - **Geen mail over een sessie die al begonnen is.** Onderwijs voert soms
 *   achteraf een sessie in, of annuleert er een die niet doorging; wie
 *   ingeschreven was, hoeft dan geen "je sessie gaat niet door" te krijgen voor
 *   iets van gisteren.
 * - **Een uitgeschreven account krijgt niets** (`deletedAt`): dat is
 *   geanonimiseerd.
 */

/**
 * De afzender. Een eigen variabele naast `MAIL_FROM`, zoals bij de lesbezoeken:
 * een PAL+-mail hoort niet als "Theokot VTK" in de inbox te landen. Antwoorden
 * gaat naar het adres van Onderwijs (`replyTo`), ook als de afzender een
 * no-reply-adres zou worden.
 */
const FROM = process.env.MAIL_FROM_PAL_PLUS?.trim() || "VTK Onderwijs <onderwijs@vtk.be>";

const ONDERWIJS_GROUP_CODE = "ONDERWIJS";

const recipientSelect = {
  id: true,
  name: true,
  firstName: true,
  locale: true,
  email: true,
  personalEmail: true,
  emailPreference: true,
  deletedAt: true,
} as const;

type Recipient = {
  id: string;
  name: string;
  firstName: string | null;
  locale: "NL" | "EN";
  email: string;
  personalEmail: string | null;
  emailPreference: "UNIVERSITY" | "PERSONAL";
  deletedAt: Date | null;
};

/** De aanhef: de voornaam wanneer die gekend is, anders de weergavenaam. */
function greetingName(user: Recipient): string {
  return user.firstName?.trim() || user.name;
}

function mailLocale(user: { locale: "NL" | "EN" }): PalPlusMailLocale {
  return user.locale === "EN" ? "en" : "nl";
}

function pageUrl(locale: PalPlusMailLocale): string {
  return `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/pal-plus`;
}

function calendarUrl(sessionId: string, locale: PalPlusMailLocale): string {
  return `${siteBaseUrl()}/api/pal-plus/sessie/${sessionId}${locale === "en" ? "?lang=en" : ""}`;
}

/** Het adres van VTK Onderwijs: het ingestelde lijstadres, of `onderwijs@vtk.be`. */
async function onderwijsAddress(): Promise<string> {
  const group = await prisma.group.findUnique({
    where: { code: ONDERWIJS_GROUP_CODE },
    select: { id: true, code: true },
  });
  return (group ? await groupMailAddress(group) : null) ?? derivedGroupMailAddress(ONDERWIJS_GROUP_CODE)!;
}

async function deliver(
  to: string,
  mail: PalPlusMail,
  options: { replyTo: string; messageId?: string },
): Promise<boolean> {
  return sendMail(
    {
      to,
      from: FROM,
      replyTo: options.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(options.messageId ? { messageId: options.messageId } : {}),
    },
    { source: "palPlus" },
  );
}

/** Een mail mag nooit een actie of een andere mail meesleuren. */
async function safely(label: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (err) {
    console.error(`[pal-plus] ${label} mislukt`, err);
    Sentry.captureException(err);
  }
}

// -----------------------------------------------------------------------------
// Een sessie, klaar voor een mail
// -----------------------------------------------------------------------------

const sessionSelect = {
  id: true,
  description: true,
  startsAt: true,
  endsAt: true,
  roomText: true,
  cancelledAt: true,
  cancelReason: true,
  course: { select: { code: true, nameNl: true, nameEn: true } },
  room: { select: { code: true, name: true, building: { select: { shortCode: true } } } },
  tutors: {
    orderBy: { createdAt: "asc" },
    select: { userId: true, reward: true, user: { select: recipientSelect } },
  },
  attendees: {
    orderBy: { createdAt: "asc" },
    select: { userId: true, user: { select: recipientSelect } },
  },
} as const;

type SessionRow = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

function loadSession(sessionId: string) {
  return prisma.palPlusSession.findUnique({ where: { id: sessionId }, select: sessionSelect });
}

function toMailSession(row: SessionRow, locale: PalPlusMailLocale): PalPlusMailSession {
  return {
    courseLabel: palPlusCourseLabel(row.course, locale),
    description: row.description,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    roomLabel: palPlusRoomLabel(row.room, row.roomText),
    tutorNames: row.tutors.map((tutor) => tutor.user.name),
  };
}

/** Tutors en ingeschrevenen, elk met hun rol; een uitgeschreven account valt weg. */
function sessionPeople(row: SessionRow): { user: Recipient; role: PalPlusMailRole }[] {
  return [
    ...row.tutors.map((tutor) => ({ user: tutor.user as Recipient, role: "tutor" as const })),
    ...row.attendees.map((attendee) => ({ user: attendee.user as Recipient, role: "attendee" as const })),
  ].filter((person) => person.user.deletedAt === null);
}

// -----------------------------------------------------------------------------
// Aanvragen
// -----------------------------------------------------------------------------

const requestSelect = {
  id: true,
  kind: true,
  status: true,
  description: true,
  courseOther: true,
  proposedStartsAt: true,
  proposedEndsAt: true,
  preferredPeriod: true,
  reviewNote: true,
  course: { select: { code: true, nameNl: true, nameEn: true } },
  user: { select: recipientSelect },
  respondsTo: {
    select: { courseOther: true, course: { select: { code: true, nameNl: true, nameEn: true } } },
  },
} as const;

function proposedOf(request: { proposedStartsAt: Date | null; proposedEndsAt: Date | null }) {
  return request.proposedStartsAt && request.proposedEndsAt
    ? { startsAt: request.proposedStartsAt, endsAt: request.proposedEndsAt }
    : null;
}

/** Na het indienen: een bevestiging naar de indiener, een melding naar Onderwijs. */
export function notifyPalPlusRequestSubmitted(requestId: string): Promise<void> {
  return safely("mail na een nieuwe aanvraag", async () => {
    const request = await prisma.palPlusRequest.findUnique({ where: { id: requestId }, select: requestSelect });
    if (!request) return;
    const user = request.user as Recipient;
    const onderwijs = await onderwijsAddress();
    const submitterEmail = preferredEmail(user);

    if (user.deletedAt === null) {
      const locale = mailLocale(user);
      await deliver(
        submitterEmail,
        palPlusRequestReceivedMail({
          locale,
          name: greetingName(user),
          kind: request.kind,
          courseLabel: palPlusRequestCourseLabel(request, locale),
          description: request.description,
          proposed: proposedOf(request),
          pageUrl: pageUrl(locale),
        }),
        { replyTo: onderwijs },
      );
    }

    await deliver(
      onderwijs,
      palPlusNewRequestNotificationMail({
        kind: request.kind,
        submitterName: user.name,
        submitterEmail,
        courseLabel: palPlusRequestCourseLabel(request, "nl"),
        courseTyped: !request.course,
        description: request.description,
        proposed: proposedOf(request),
        preferredPeriod: request.preferredPeriod,
        respondsToLabel: request.respondsTo ? palPlusRequestCourseLabel(request.respondsTo, "nl") : null,
        adminUrl: `${siteBaseUrl()}/admin/pal-plus`,
      }),
      // Antwoorden gaat naar de indiener: dat is wie Onderwijs wil bereiken.
      { replyTo: submitterEmail },
    );
  });
}

/** Onderwijs zette een hulpvraag online. */
export function notifyPalPlusRequestPublished(requestId: string): Promise<void> {
  return safely("mail na het online zetten", async () => {
    const request = await prisma.palPlusRequest.findUnique({ where: { id: requestId }, select: requestSelect });
    if (!request || request.status !== "OPEN") return;
    const user = request.user as Recipient;
    if (user.deletedAt !== null) return;
    const locale = mailLocale(user);
    await deliver(
      preferredEmail(user),
      palPlusRequestPublishedMail({
        locale,
        name: greetingName(user),
        courseLabel: palPlusRequestCourseLabel(request, locale),
        description: request.description,
        pageUrl: pageUrl(locale),
      }),
      { replyTo: await onderwijsAddress() },
    );
  });
}

/** Onderwijs sloot een aanvraag; de reden staat erin. */
export function notifyPalPlusRequestClosed(requestId: string, wasOnline: boolean): Promise<void> {
  return safely("mail na het sluiten", async () => {
    const request = await prisma.palPlusRequest.findUnique({ where: { id: requestId }, select: requestSelect });
    if (!request || request.status !== "CLOSED" || !request.reviewNote) return;
    const user = request.user as Recipient;
    if (user.deletedAt !== null) return;
    const locale = mailLocale(user);
    await deliver(
      preferredEmail(user),
      palPlusRequestClosedMail({
        locale,
        name: greetingName(user),
        kind: request.kind,
        wasOnline,
        courseLabel: palPlusRequestCourseLabel(request, locale),
        reason: request.reviewNote,
        pageUrl: pageUrl(locale),
      }),
      { replyTo: await onderwijsAddress() },
    );
  });
}

// -----------------------------------------------------------------------------
// Sessies
// -----------------------------------------------------------------------------

/**
 * Na het plannen of aanpassen: de nieuwe tutors krijgen "je geeft een sessie",
 * en wie een net gekoppelde hulpvraag stelde of steunde, krijgt "er is een
 * sessie voor je vraag".
 *
 * Wie al tutor is of al ingeschreven, krijgt die tweede mail niet, en wie twee
 * gekoppelde vragen steunde, krijgt ze één keer. Het aanbod van een tutor die
 * Onderwijs uiteindelijk niet koos, krijgt geen mail: dat aanbod staat op
 * "Sessie gepland" bij de indiener, en een mail "er is een sessie, maar niet met
 * jou" verwart meer dan ze uitlegt.
 */
export function notifyPalPlusSessionPlanned(input: {
  sessionId: string;
  newTutorIds: string[];
  linkedRequestIds: string[];
}): Promise<void> {
  return safely("mail na het plannen", async () => {
    if (input.newTutorIds.length === 0 && input.linkedRequestIds.length === 0) return;
    const row = await loadSession(input.sessionId);
    if (!row || row.cancelledAt || row.startsAt.getTime() <= Date.now()) return;
    const onderwijs = await onderwijsAddress();

    const linked = await prisma.palPlusRequest.findMany({
      where: { id: { in: input.linkedRequestIds }, sessionId: row.id },
      orderBy: { createdAt: "asc" },
      select: {
        kind: true,
        userId: true,
        user: { select: recipientSelect },
        backers: { select: { user: { select: recipientSelect } } },
      },
    });

    const newTutors = row.tutors.filter((tutor) => input.newTutorIds.includes(tutor.userId));
    const praesidium = await praesidiumYears(newTutors.map((tutor) => tutor.userId));
    for (const tutor of newTutors) {
      const user = tutor.user as Recipient;
      if (user.deletedAt !== null) continue;
      const locale = mailLocale(user);
      await deliver(
        preferredEmail(user),
        palPlusTutorAssignedMail({
          locale,
          name: greetingName(user),
          session: toMailSession(row, locale),
          fromOffer: linked.some((request) => request.kind === "GIVE" && request.userId === tutor.userId),
          coTutorNames: row.tutors.filter((other) => other.userId !== tutor.userId).map((other) => other.user.name),
          reward: earnedPalPlusReward(
            { userId: tutor.userId, reward: tutor.reward, startsAt: row.startsAt, cancelledAt: null },
            praesidium,
          ),
          pageUrl: pageUrl(locale),
          calendarUrl: calendarUrl(row.id, locale),
        }),
        { replyTo: onderwijs },
      );
    }

    // Eerst wie een vraag stelde, dan wie steunde: wie allebei deed, is "asker".
    const skip = new Set([...row.tutors.map((tutor) => tutor.userId), ...row.attendees.map((attendee) => attendee.userId)]);
    const audience = new Map<string, { user: Recipient; role: "asker" | "backer" }>();
    for (const request of linked) {
      if (request.kind !== "FOLLOW") continue;
      const user = request.user as Recipient;
      if (!skip.has(user.id)) audience.set(user.id, { user, role: "asker" });
    }
    for (const request of linked) {
      if (request.kind !== "FOLLOW") continue;
      for (const backer of request.backers) {
        const user = backer.user as Recipient;
        if (!skip.has(user.id) && !audience.has(user.id)) audience.set(user.id, { user, role: "backer" });
      }
    }
    for (const { user, role } of audience.values()) {
      if (user.deletedAt !== null) continue;
      const locale = mailLocale(user);
      await deliver(
        preferredEmail(user),
        palPlusSessionForRequestMail({
          locale,
          name: greetingName(user),
          role,
          session: toMailSession(row, locale),
          pageUrl: pageUrl(locale),
          calendarUrl: calendarUrl(row.id, locale),
        }),
        { replyTo: onderwijs },
      );
    }
  });
}

/**
 * Het moment of het lokaal veranderde: naar de tutors en de ingeschrevenen. Wie
 * net tutor werd (`skipUserIds`), kreeg al de mail met het nieuwe moment.
 */
export function notifyPalPlusSessionChanged(input: {
  sessionId: string;
  change: PalPlusSessionChange;
  skipUserIds: string[];
}): Promise<void> {
  return safely("mail na een wijziging", async () => {
    if (!input.change.previousMoment && !input.change.previousRoom) return;
    const row = await loadSession(input.sessionId);
    if (!row || row.cancelledAt || row.startsAt.getTime() <= Date.now()) return;
    const onderwijs = await onderwijsAddress();
    for (const { user, role } of sessionPeople(row)) {
      if (input.skipUserIds.includes(user.id)) continue;
      const locale = mailLocale(user);
      await deliver(
        preferredEmail(user),
        palPlusSessionChangedMail({
          locale,
          name: greetingName(user),
          role,
          session: toMailSession(row, locale),
          change: input.change,
          pageUrl: pageUrl(locale),
          calendarUrl: calendarUrl(row.id, locale),
        }),
        { replyTo: onderwijs },
      );
    }
  });
}

/** Een geannuleerde sessie die nog moest beginnen: naar de tutors en de ingeschrevenen. */
export function notifyPalPlusSessionCancelled(sessionId: string): Promise<void> {
  return safely("mail na een annulering", async () => {
    const row = await loadSession(sessionId);
    if (!row?.cancelledAt || !row.cancelReason) return;
    // Achteraf geannuleerd omdat ze niet doorging: daar valt niemand meer iets te melden.
    if (row.startsAt.getTime() <= row.cancelledAt.getTime()) return;
    const onderwijs = await onderwijsAddress();
    for (const { user, role } of sessionPeople(row)) {
      const locale = mailLocale(user);
      await deliver(
        preferredEmail(user),
        palPlusSessionCancelledMail({
          locale,
          name: greetingName(user),
          role,
          session: toMailSession(row, locale),
          reason: row.cancelReason,
          pageUrl: pageUrl(locale),
        }),
        { replyTo: onderwijs },
      );
    }
  });
}

// -----------------------------------------------------------------------------
// De herinnering van de dag vooraf
// -----------------------------------------------------------------------------

export type PalPlusReminderRun = {
  sent: number;
  failed: number;
  /** Gezet wanneer er niets geprobeerd is, met de reden erbij. */
  skipped?: "geen-smtp";
};

/**
 * Verstuurt de herinneringen die nu aan de beurt zijn: voor elke tutor en elke
 * ingeschrevene van een sessie die binnen 24 uur begint en nog geen herinnering
 * kreeg. Draait mee in de background-worker (elke vijf minuten).
 *
 * Eerst claimen, dan mailen, zoals bij de shiften (`processDueShiftReminders`):
 * de markering gaat om in een voorwaardelijke update, en enkel wie die wint,
 * verstuurt. Een mislukte verzending zet de markering niet terug: liever geen
 * herinnering dan twee. En zonder mailserver in productie gebeurt er niets, want
 * anders zou alles als verstuurd afgevinkt worden zonder dat er iets aankwam.
 */
export async function processDuePalPlusReminders(now: Date = new Date()): Promise<PalPlusReminderRun> {
  if (!smtpConfigured() && process.env.NODE_ENV === "production") {
    return { sent: 0, failed: 0, skipped: "geen-smtp" };
  }

  const window = {
    cancelledAt: null,
    startsAt: { gt: now, lte: new Date(now.getTime() + PAL_PLUS_REMINDER_LEAD_MS) },
  };
  const [tutors, attendees] = await Promise.all([
    prisma.palPlusSessionTutor.findMany({
      where: { reminderSentAt: null, session: window, user: { deletedAt: null } },
      select: { sessionId: true, userId: true },
    }),
    prisma.palPlusSessionAttendee.findMany({
      where: { reminderSentAt: null, session: window, user: { deletedAt: null } },
      select: { sessionId: true, userId: true },
    }),
  ]);
  const due = [
    ...tutors.map((row) => ({ ...row, role: "tutor" as const })),
    ...attendees.map((row) => ({ ...row, role: "attendee" as const })),
  ];
  if (due.length === 0) return { sent: 0, failed: 0 };

  const sessions = new Map<string, SessionRow>();
  const onderwijs = await onderwijsAddress();
  let sent = 0;
  let failed = 0;

  for (const item of due) {
    const claimWhere = { sessionId: item.sessionId, userId: item.userId, reminderSentAt: null };
    const { count } =
      item.role === "tutor"
        ? await prisma.palPlusSessionTutor.updateMany({ where: claimWhere, data: { reminderSentAt: now } })
        : await prisma.palPlusSessionAttendee.updateMany({ where: claimWhere, data: { reminderSentAt: now } });
    if (count === 0) continue;

    let row = sessions.get(item.sessionId);
    if (!row) {
      const loaded = await loadSession(item.sessionId);
      if (!loaded) continue;
      row = loaded;
      sessions.set(item.sessionId, row);
    }
    const person = sessionPeople(row).find((entry) => entry.user.id === item.userId && entry.role === item.role);
    if (!person) continue;

    const locale = mailLocale(person.user);
    try {
      const ok = await deliver(
        preferredEmail(person.user),
        palPlusSessionReminderMail({
          locale,
          name: greetingName(person.user),
          role: item.role,
          session: toMailSession(row, locale),
          attendeeCount: row.attendees.length,
          pageUrl: pageUrl(locale),
          calendarUrl: calendarUrl(row.id, locale),
        }),
        {
          replyTo: onderwijs,
          // Het moment hoort erbij: verschuift de sessie, dan is de tweede
          // herinnering een ander bericht, en Gmail laat een herhaald
          // Message-ID stil vallen.
          messageId: `<pal-plus-reminder-${item.sessionId}-${item.userId}-${row.startsAt.getTime()}@vtk.be>`,
        },
      );
      if (ok) sent += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error("[pal-plus] herinnering mislukt", err);
      Sentry.captureException(err);
    }
  }

  return { sent, failed };
}
