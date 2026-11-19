import { workingYearOf } from '@vtk/auth';
import type { PraesidiumYears } from '@/lib/shift/rewards';
import {
  MAIL_COLOR,
  MAIL_FONT,
  escapeHtml,
  mailButton,
  mailContentRow,
  mailDateStub,
  mailDocument,
  mailFooterRow,
  mailHeaderRow,
  mailHeading,
  mailParagraph,
} from '@/lib/mailDesign';

/*
 * Vervangbaar op een shift.
 *
 * Een praesidiumlid vult soms een shift in omdat ze anders leeg blijft. Duikt er
 * later toch een student op, dan had dat praesidiumlid die shift niet hoeven te
 * doen. Wie zich zo inschrijft, duidt aan dat hij vervangen mag worden
 * (`ShiftParticipant.replaceable`); een student die zich dan inschrijft op een
 * shift die vol staat, neemt zijn plaats in, en het praesidiumlid krijgt een mail.
 *
 * De student ziet daar niets van: voor hem telt die plaats als vrij en staat die
 * naam niet in de lijst. Puur, op de mail na die enkel tekst opbouwt.
 */

/** In het praesidium in het werkingsjaar van deze shift (kantelt op 15 juli). */
export function isPraesidiumFor(
  userId: string,
  shift: { startTime: Date },
  praesidium: PraesidiumYears,
): boolean {
  return praesidium.get(userId)?.has(workingYearOf(shift.startTime)) ?? false;
}

/**
 * Mag deze inschrijving vervangbaar zijn? Enkel voor een praesidiumlid, en niet
 * op een gespiegelde shift van de cursusdienst: daar staat de inschrijving ook
 * op cudi.vtk.be, en die kunnen we niet zomaar omwisselen.
 */
export function canBeReplaceable(
  userId: string,
  shift: { startTime: Date; sourceSystem: string | null },
  praesidium: PraesidiumYears,
): boolean {
  return shift.sourceSystem === null && isPraesidiumFor(userId, shift, praesidium);
}

/**
 * Kan deze kijker een vervangbaar praesidiumlid vervangen? Iedereen zonder post
 * in dat werkingsjaar: een praesidiumlid neemt de plaats van een ander niet in.
 */
export function canReplace(
  viewerId: string,
  shift: { startTime: Date; sourceSystem: string | null },
  praesidium: PraesidiumYears,
): boolean {
  return shift.sourceSystem === null && !isPraesidiumFor(viewerId, shift, praesidium);
}

/**
 * Wie er vervangen wordt: van de vervangbare inschrijvingen de laatste. Wie zich
 * het laatst inschreef, heeft er het minst lang op gerekend.
 */
export function pickReplaced<T extends { replaceable: boolean; registeredAt: Date }>(
  participants: readonly T[],
): T | null {
  return (
    [...participants]
      .filter((participant) => participant.replaceable)
      .sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime())[0] ?? null
  );
}

/**
 * De deelnemers zoals deze kijker ze ziet: wie een vervangbaar praesidiumlid kan
 * vervangen, ziet die plaats als vrij.
 */
export function visibleParticipants<T extends { replaceable: boolean }>(
  participants: readonly T[],
  viewerCanReplace: boolean,
): T[] {
  return viewerCanReplace
    ? participants.filter((participant) => !participant.replaceable)
    : [...participants];
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

export type ReplacedShift = {
  name: string;
  startTime: Date;
  endTime: Date;
  location: string;
};

/**
 * De mail aan het praesidiumlid dat vervangen werd: dat het niet meer moet
 * komen. Bewust zonder de naam van wie zijn plaats innam; het gaat om de shift.
 */
export function shiftReplacedMail(
  user: { name: string; locale: 'NL' | 'EN' },
  shift: ReplacedShift,
): { subject: string; text: string; html: string } {
  const nl = user.locale !== 'EN';
  const when = (nl ? dateTimeFormat : dateTimeFormatEn).format(shift.startTime);
  const until = timeFormat.format(shift.endTime);
  const subject = nl
    ? `Je hoeft niet meer te komen: ${shift.name}`
    : `You no longer need to come: ${shift.name}`;

  const intro = nl
    ? 'Je had aangeduid dat een student je plaats mocht innemen, en dat is gebeurd. Je staat niet meer ingeschreven voor deze shift en hoeft niet meer te komen.'
    : 'You had indicated that a student could take your place, and that has happened. You are no longer registered for this shift and do not need to come.';

  const lines = [
    nl ? `Dag ${user.name},` : `Hi ${user.name},`,
    '',
    intro,
    '',
    shift.name,
    nl ? `${when} tot ${until}` : `${when} until ${until}`,
    `${nl ? 'Waar' : 'Where'}: ${shift.location}`,
    '',
    nl ? 'Bedankt om in te springen.' : 'Thanks for stepping in.',
    'VTK',
  ];

  const card = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border:1px solid ${MAIL_COLOR.line};border-radius:18px;overflow:hidden"><tr>${mailDateStub(
    { date: shift.startTime, locale: nl ? 'nl' : 'en' },
  )}<td valign="middle" style="padding:18px 20px;font-family:${MAIL_FONT}"><div style="font-size:12px;font-weight:600;color:${MAIL_COLOR.muted}">${
    nl ? 'Niet meer ingeschreven' : 'No longer registered'
  }</div><div style="margin:4px 0 6px;font-size:18px;font-weight:650;letter-spacing:-.02em;color:${MAIL_COLOR.ink}">${escapeHtml(
    shift.name,
  )}</div><div style="font-size:13px;line-height:1.5;color:${MAIL_COLOR.body}"><strong>${escapeHtml(
    when,
  )}</strong> ${nl ? 'tot' : 'until'} <strong>${escapeHtml(until)}</strong><br>${
    nl ? 'Locatie:' : 'Location:'
  } ${escapeHtml(shift.location)}</div></td></tr></table>`;

  const html = mailDocument({
    lang: nl ? 'nl' : 'en',
    title: subject,
    rows: `${mailHeaderRow({ kicker: 'VTK Shiften' })}${mailContentRow(
      `${mailHeading(nl ? 'Een student neemt je plaats in' : 'A student takes your place')}${mailParagraph(
        nl ? `Dag ${user.name},` : `Hi ${user.name},`,
      )}${mailParagraph(intro)}${card}${mailParagraph(
        nl ? 'Bedankt om in te springen.' : 'Thanks for stepping in.',
      )}<div style="margin-top:22px">${mailButton(
        'https://vtk.be/shift',
        nl ? 'Bekijk je shiften' : 'View your shifts',
      )}</div>`,
    )}${mailFooterRow(
      nl
        ? 'Je krijgt deze mail omdat je bij het inschrijven aanduidde dat een student je plaats mocht innemen.'
        : 'You received this email because you indicated, when signing up, that a student could take your place.',
    )}`,
  });

  return { subject, text: lines.join('\n'), html };
}
