import { prisma } from '@vtk/db';
import { sendMail } from '@/lib/mail';
import { preferredEmail } from '@/lib/brevo/contacts';

/**
 * Herinneringen voor een shift.
 *
 * Twee momenten: een dag vooraf, en twee uur vooraf. Het eerste valt samen met
 * `UNREGISTER_LOCK_MS` uit `lib/shift.ts`, het moment waarop je jezelf niet meer
 * kan uitschrijven; die mail zegt dat er dus meteen bij. Het tweede is de
 * vangnetmail voor wie het toch vergeten was.
 *
 * Beide zijn per lid uitzetbaar in het profiel. Het is transactionele post (je
 * hebt je zelf ingeschreven), dus geen `mailCategories`-check: die array is voor
 * opt-in nieuwsbrieven.
 */

export type ReminderLead = {
  key: 'dayBefore' | 'soon';
  /** Hoe lang voor de start de mail vertrekt. */
  ms: number;
};

export type ReminderLeadKey = ReminderLead['key'];

export const REMINDER_LEADS: readonly ReminderLead[] = [
  { key: 'dayBefore', ms: 24 * 60 * 60 * 1000 },
  { key: 'soon', ms: 2 * 60 * 60 * 1000 },
];

/**
 * Welke herinneringen voor deze shift al niet meer zinvol zijn.
 *
 * Wie zich drie uur voor de start inschrijft, hoort geen mail te krijgen die
 * begint met "morgen sta je ingepland". Bij het inschrijven markeren we die
 * vensters daarom meteen als afgehandeld, zodat de eerstvolgende run ze
 * overslaat in plaats van er alsnog eentje uit te sturen.
 */
export function passedLeads(startTime: Date, now: Date): ReminderLead['key'][] {
  const untilStart = startTime.getTime() - now.getTime();
  return REMINDER_LEADS.filter((lead) => untilStart <= lead.ms).map((lead) => lead.key);
}

/** De markeringen die bij `passedLeads` horen, klaar voor een Prisma-create. */
export function handledLeadFields(
  startTime: Date,
  now: Date,
): { reminderDayBeforeAt?: Date; reminderSoonAt?: Date } {
  const passed = passedLeads(startTime, now);
  return {
    ...(passed.includes('dayBefore') ? { reminderDayBeforeAt: now } : {}),
    ...(passed.includes('soon') ? { reminderSoonAt: now } : {}),
  };
}

const dateTimeFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const dateTimeFormatEn = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

export type ReminderShift = {
  name: string;
  startTime: Date;
  endTime: Date;
  location: string;
  reward: number;
};

/**
 * De mail zelf. Puur, zodat de tekst getest kan worden zonder database of
 * mailserver.
 */
export function shiftReminderMail(
  lead: ReminderLead['key'],
  user: { name: string; locale: 'NL' | 'EN' },
  shift: ReminderShift,
): { subject: string; text: string } {
  const nl = user.locale !== 'EN';
  const when = (nl ? dateTimeFormat : dateTimeFormatEn).format(shift.startTime);
  const until = timeFormat.format(shift.endTime);

  const subject = nl
    ? lead === 'dayBefore'
      ? `Morgen: ${shift.name}`
      : `Straks: ${shift.name}`
    : lead === 'dayBefore'
      ? `Tomorrow: ${shift.name}`
      : `Coming up: ${shift.name}`;

  const lines = nl
    ? [
        `Dag ${user.name},`,
        '',
        lead === 'dayBefore'
          ? 'Morgen sta je ingepland voor een shift.'
          : 'Straks sta je ingepland voor een shift.',
        '',
        `${shift.name}`,
        `${when} tot ${until}`,
        `Waar: ${shift.location}`,
        ...(shift.reward > 0
          ? [`Je verdient er ${shift.reward} ${shift.reward === 1 ? 'bonnetje' : 'bonnetjes'} mee.`]
          : []),
        '',
        lead === 'dayBefore'
          ? 'Uitschrijven kan vanaf nu niet meer via de site. Kan je toch niet, laat het dan zo snel mogelijk weten aan de verantwoordelijke.'
          : 'Kan je toch niet komen, laat het dan meteen weten aan de verantwoordelijke.',
        '',
        'Tot dan,',
        'VTK',
      ]
    : [
        `Hi ${user.name},`,
        '',
        lead === 'dayBefore'
          ? 'You are scheduled for a shift tomorrow.'
          : 'Your shift starts soon.',
        '',
        `${shift.name}`,
        `${when} until ${until}`,
        `Where: ${shift.location}`,
        ...(shift.reward > 0
          ? [`It earns you ${shift.reward} ${shift.reward === 1 ? 'token' : 'tokens'}.`]
          : []),
        '',
        lead === 'dayBefore'
          ? 'You can no longer unregister through the website. If you really cannot make it, tell the person in charge as soon as possible.'
          : 'If you cannot make it after all, tell the person in charge right away.',
        '',
        'See you there,',
        'VTK',
      ];

  return { subject, text: lines.join('\n') };
}

const FROM = 'VTK Shiften <shiften@vtk.be>';

type Candidate = {
  shiftId: string;
  userId: string;
  shift: ReminderShift;
  user: { name: string; locale: 'NL' | 'EN'; email: string; personalEmail: string | null; emailPreference: 'UNIVERSITY' | 'PERSONAL' };
};

/**
 * Vanaf wanneer een venster meetelt. De ondergrens van de dag-vooraf-mail is de
 * bovengrens van de tweede: een bericht dat met "morgen" begint mag nooit
 * vertrekken voor een shift die over anderhalf uur start. Het inschrijven
 * markeert die vensters al als afgehandeld, maar dit is de tweede grendel, voor
 * het geval een deelnemer langs een andere weg in de tabel belandt.
 */
export function windowFor(lead: ReminderLead, now: Date): { after: Date; until: Date } {
  const soon = REMINDER_LEADS.find((other) => other.key === 'soon')!;
  return {
    after: lead.key === 'dayBefore' ? new Date(now.getTime() + soon.ms) : now,
    until: new Date(now.getTime() + lead.ms),
  };
}

async function candidatesFor(lead: ReminderLead, now: Date): Promise<Candidate[]> {
  const { after, until } = windowFor(lead, now);
  const rows = await prisma.shiftParticipant.findMany({
    where: {
      ...(lead.key === 'dayBefore' ? { reminderDayBeforeAt: null } : { reminderSoonAt: null }),
      // Nog niet begonnen: een herinnering voor iets dat al bezig is, is spam.
      shift: { startTime: { gt: after, lte: until } },
      user: {
        // Uitgeschreven accounts zijn geanonimiseerd; daar mag niets meer naartoe.
        deletedAt: null,
        ...(lead.key === 'dayBefore'
          ? { shiftReminderDayBefore: true }
          : { shiftReminderSoon: true }),
      },
    },
    select: {
      shiftId: true,
      userId: true,
      shift: {
        select: { name: true, startTime: true, endTime: true, location: true, reward: true },
      },
      user: {
        select: {
          name: true,
          locale: true,
          email: true,
          personalEmail: true,
          emailPreference: true,
        },
      },
    },
  });
  return rows as Candidate[];
}

/**
 * Verstuurt alle herinneringen die nu aan de beurt zijn.
 *
 * Eerst claimen, dan mailen: de markering gaat om in een voorwaardelijke
 * `updateMany`, en enkel wie die update wint, verstuurt. Bij twijfel liever geen
 * mail dan twee, dus een mislukte verzending zet de markering niet terug. Zelfde
 * afweging als bij de no-show-mails in `theokot-server.ts`.
 */
export async function processDueShiftReminders(
  now: Date = new Date(),
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const lead of REMINDER_LEADS) {
    const candidates = await candidatesFor(lead, now);

    for (const candidate of candidates) {
      const { count } = await prisma.shiftParticipant.updateMany({
        where: {
          shiftId: candidate.shiftId,
          userId: candidate.userId,
          ...(lead.key === 'dayBefore'
            ? { reminderDayBeforeAt: null }
            : { reminderSoonAt: null }),
        },
        data:
          lead.key === 'dayBefore' ? { reminderDayBeforeAt: now } : { reminderSoonAt: now },
      });
      if (count === 0) continue;

      const mail = shiftReminderMail(lead.key, candidate.user, candidate.shift);
      const ok = await sendMail({
        to: preferredEmail(candidate.user),
        from: FROM,
        subject: mail.subject,
        text: mail.text,
        messageId: `<shift-reminder-${lead.key}-${candidate.shiftId}-${candidate.userId}@vtk.be>`,
      });
      if (ok) sent += 1;
      else failed += 1;
    }
  }

  return { sent, failed };
}
