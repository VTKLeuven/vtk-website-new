import 'server-only';

import { prisma } from '@vtk/db';
import { workingYearOf } from '@vtk/auth';
import type { SessionPayload } from '@vtk/auth';
import { brusselsWallClockMinutes, brusselsYMD, shiftYMD, ymdKey, type YMD } from '@/lib/brussels';
import { sendMail, smtpConfigured } from '@/lib/email';
import { preferredEmail } from '@/lib/brevo/contacts';
import { THEOKOT_TEMPLATE_SLUG } from '@/lib/shift/templates';
import { getShiftTemplate } from '@/lib/shift/templateStore';
import {
  AFWAS_PICK_REMINDER_MS,
  afwasSlot,
  dateToDay,
  describeAfwas,
  pickReminderDue,
  dayToDate,
  groupSessionsByWeek,
  mondayOf,
  reminderDue,
  bookedSpan,
  theokotDayState,
  type AfwasSlot,
  type WeekSessions,
} from '@/lib/theokotAfwas';
import {
  afwasClosedMail,
  afwasNotedMail,
  afwasPickReminderMail,
  afwasReminderMail,
  type AfwasMail,
} from '@/lib/theokotAfwasMail';

/**
 * De serverkant van de Theokot-afwas: wie mag boeken, de verkoopdagen erbij
 * lezen, en de mails van de worker. Zie docs/design-decisions.md, "Theokot:
 * afwasbeurten".
 */

const FROM = 'Theokot VTK <theokot@vtk.be>';

/**
 * Theokot en Logistiek zien en regelen alles: elke groep toevoegen, met of
 * zonder namiddag, afvinken en annuleren. Logistiek brengt de vuile bekers naar
 * Theokot en haalt ze terug, en weet dus als eerste dat er iets af te wassen
 * valt. De rest regelt enkel wat van de eigen groep is.
 */
export function canManageAfwas(session: SessionPayload): boolean {
  return (
    session.user.isSuperAdmin ||
    session.permissions.includes('theokot.manage') ||
    session.permissions.includes('logistiek.manage')
  );
}

/**
 * Elk lid van een post, werkgroep of jaarwerking boekt voor zijn groep, en
 * Theokot voor elke groep. De sessie draagt de groepen van het lopende
 * werkingsjaar, jaarwerkingen inbegrepen.
 */
export function ownAfwasGroupIds(session: SessionPayload): string[] {
  return [...new Set(session.groups.map((group) => group.id))];
}

export type AfwasGroupOption = { id: string; name: string; type: 'PRAESIDIUM' | 'WERKGROEP' | 'JAARWERKING' };

/** De groepen waarvoor deze gebruiker mag boeken, op naam. */
export async function afwasGroupOptions(session: SessionPayload, nl: boolean): Promise<AfwasGroupOption[]> {
  const manage = canManageAfwas(session);
  const own = manage ? [] : ownAfwasGroupIds(session);
  if (!manage && own.length === 0) return [];
  const groups = await prisma.group.findMany({
    where: manage ? { active: true } : { id: { in: own } },
    select: { id: true, nameNl: true, nameEn: true, type: true },
  });
  return groups
    .map((group) => ({ id: group.id, name: (nl ? group.nameNl : group.nameEn) || group.nameNl, type: group.type }))
    .sort((a, b) => a.name.localeCompare(b.name, nl ? 'nl-BE' : 'en-GB'));
}

/** Het uur van de afwas, uit het sjabloon "Theokot opening". */
export async function loadAfwasSlot(): Promise<AfwasSlot> {
  return afwasSlot(await getShiftTemplate(THEOKOT_TEMPLATE_SLUG));
}

/** De verkoopdagen van de weken waarin `from` en `to` vallen (de hele weken). */
export async function loadWeekSessions(from: YMD, to: YMD): Promise<WeekSessions> {
  const monday = mondayOf(from);
  const nextMonday = shiftYMD(mondayOf(to), 7);
  const sessions = await prisma.theokotSession.findMany({
    where: {
      date: { gte: brusselsWallClockMinutes(monday, 0), lt: brusselsWallClockMinutes(nextMonday, 0) },
    },
    select: { date: true, isOpen: true },
  });
  return groupSessionsByWeek(sessions);
}

// -----------------------------------------------------------------------------
// De worker: de vier mails van de afwas
// -----------------------------------------------------------------------------

export type AfwasMailRun = { sent: number; failed: number; skipped?: 'geen-smtp' };

type Recipient = {
  id: string;
  name: string;
  locale: 'NL' | 'EN';
  email: string;
  personalEmail: string | null;
  emailPreference: 'UNIVERSITY' | 'PERSONAL';
};

/** De leden van de groep in het werkingsjaar van `at`. */
async function recipientsFor(groupId: string, at: Date, cache: Map<string, Recipient[]>): Promise<Recipient[]> {
  const year = workingYearOf(at);
  const key = `${groupId}:${year}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId, year, user: { active: true, deletedAt: null } },
    select: {
      user: {
        select: { id: true, name: true, locale: true, email: true, personalEmail: true, emailPreference: true },
      },
    },
  });
  const recipients = memberships.map((membership) => membership.user as Recipient);
  cache.set(key, recipients);
  return recipients;
}

/** Het werkingsjaar kantelt op 15 juli; het uur van die dag doet er niet toe. */
function noonOf(day: YMD): Date {
  return brusselsWallClockMinutes(day, 12 * 60);
}

type MailKind = 'noted' | 'pick' | 'closed' | 'reminder';

const CLAIM: Record<MailKind, 'noticeSentAt' | 'pickReminderSentAt' | 'closedNoticeSentAt' | 'reminderSentAt'> = {
  noted: 'noticeSentAt',
  pick: 'pickReminderSentAt',
  closed: 'closedNoticeSentAt',
  reminder: 'reminderSentAt',
};

/**
 * Verstuurt wat nu aan de beurt is, elke vijf minuten via de shift-worker
 * (`/api/shift/maintenance`). Vier mails, aan elk lid van de groep:
 *
 * - **Genoteerd**: iemand buiten de groep (Theokot, Logistiek) zette afwas voor
 *   haar op de lijst. Zette de groep het zelf, dan is `noticeSentAt` al gezet.
 * - **Kies een namiddag**: twee dagen na het noteren nog geen namiddag; één keer.
 * - **Dicht**: staat de week van de namiddag online zonder die dag (of op
 *   dicht), dan één melding om een andere te kiezen. Een week waar nog niets
 *   voor online staat, telt als open: dat is de gewone toestand voor alles wat
 *   verder dan een week weg is.
 * - **Herinnering**: binnen 24 uur voor het begin, als Theokot die dag niet
 *   dicht is.
 *
 * Wat afgevinkt is, krijgt niets meer. Eerst claimen, dan mailen, zoals bij de
 * shiftherinneringen: een mislukte verzending zet de markering niet terug,
 * liever geen mail dan twee. Zonder mailserver in productie gebeurt er niets,
 * anders zouden alle markeringen gezet worden zonder dat er iets aankwam.
 */
export async function processDueAfwasMails(now: Date = new Date()): Promise<AfwasMailRun> {
  if (!smtpConfigured() && process.env.NODE_ENV === 'production') {
    return { sent: 0, failed: 0, skipped: 'geen-smtp' };
  }

  const today = brusselsYMD(now);
  const rows = await prisma.theokotDishwash.findMany({
    where: {
      washedAt: null,
      OR: [
        { noticeSentAt: null },
        { day: null, pickReminderSentAt: null, createdAt: { lte: new Date(now.getTime() - AFWAS_PICK_REMINDER_MS) } },
        { day: { gte: dayToDate(today) }, OR: [{ reminderSentAt: null }, { closedNoticeSentAt: null }] },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      day: true,
      hours: { select: { hour: true } },
      note: true,
      kinds: true,
      quantity: true,
      eventDate: true,
      groupId: true,
      createdAt: true,
      noticeSentAt: true,
      pickReminderSentAt: true,
      reminderSentAt: true,
      closedNoticeSentAt: true,
      group: { select: { nameNl: true, nameEn: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const slot = await loadAfwasSlot();
  const planned = rows
    .flatMap((row) => (row.day ? [dateToDay(row.day)] : []))
    .sort((a, b) => ymdKey(a).localeCompare(ymdKey(b)));
  const weeks = planned.length > 0 ? await loadWeekSessions(planned[0], planned[planned.length - 1]) : new Map();
  const cache = new Map<string, Recipient[]>();

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const day = row.day ? dateToDay(row.day) : null;
    // Zonder uren (kan niet via het scherm) telt de dag als zonder namiddag.
    const span = day && row.hours.length > 0 ? bookedSpan(day, slot, row.hours.map((h) => h.hour)) : null;
    const start = span?.start ?? null;
    const end = span?.end ?? null;
    const upcoming = start !== null && start.getTime() > now.getTime();

    const due: MailKind[] = [];
    if (row.noticeSentAt === null) due.push('noted');
    if (!day && row.pickReminderSentAt === null && pickReminderDue(row.createdAt, now)) due.push('pick');
    if (day && upcoming) {
      if (theokotDayState(day, weeks) === 'closed') {
        if (row.closedNoticeSentAt === null) due.push('closed');
      } else if (row.reminderSentAt === null && reminderDue(start as Date, now)) {
        due.push('reminder');
      }
    }

    for (const kind of due) {
      const field = CLAIM[kind];
      const { count } = await prisma.theokotDishwash.updateMany({
        where: { id: row.id, [field]: null },
        data: { [field]: now },
      });
      if (count === 0) continue;
      // Een melding over een namiddag die al voorbij is, zegt niemand nog iets:
      // wel afvinken als afgehandeld, niet versturen.
      if (kind === 'noted' && day && !upcoming) continue;

      for (const recipient of await recipientsFor(row.groupId, day ? noonOf(day) : now, cache)) {
        const nl = recipient.locale !== 'EN';
        const base = {
          name: recipient.name,
          locale: recipient.locale,
          groupName: (nl ? row.group.nameNl : row.group.nameEn) || row.group.nameNl,
          what: describeAfwas(row.quantity, row.kinds, nl),
          note: row.note,
        };
        let mail: AfwasMail;
        if (kind === 'noted' || kind === 'pick') {
          const open = { ...base, eventDate: row.eventDate ? noonOf(dateToDay(row.eventDate)) : null, start, end };
          mail =
            kind === 'noted'
              ? afwasNotedMail({ ...open, notedBy: row.createdBy?.name ?? 'Theokot' })
              : afwasPickReminderMail(open);
        } else {
          const timed = { ...base, start: start as Date, end: end as Date };
          mail = kind === 'closed' ? afwasClosedMail(timed) : afwasReminderMail(timed);
        }
        const ok = await sendMail(
          {
            to: preferredEmail(recipient),
            from: FROM,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            messageId: `<theokot-afwas-${kind}-${row.id}-${recipient.id}@vtk.be>`,
          },
          { source: 'theokot' },
        );
        if (ok) sent += 1;
        else failed += 1;
      }
    }
  }

  return { sent, failed };
}

/** Voor de logregel en de toast: "di 25 november". */
export function afwasDayLabel(day: YMD, nl: boolean): string {
  return new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(day.year, day.month - 1, day.day, 12)));
}

