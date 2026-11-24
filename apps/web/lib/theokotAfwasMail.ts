/**
 * De twee mails van de Theokot-afwas, aan de leden van de groep die boekte:
 * de herinnering de dag ervoor, en de melding dat Theokot die dag toch niet
 * open is. Puur, zodat /admin/it/flows dezelfde mail toont als de worker
 * verstuurt (`lib/theokotAfwas-server.ts`). Zie docs/design-decisions.md,
 * "Theokot: afwasbeurten".
 */

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
  mailNoticeBox,
  mailParagraph,
} from '@/lib/mailDesign';

export type AfwasMailInput = {
  /** De voornaam of naam van wie de mail krijgt. */
  name: string;
  locale: 'NL' | 'EN';
  /** De naam van de post, werkgroep of jaarwerking, in de taal van de ontvanger. */
  groupName: string;
  /** Het begin van de namiddag; daar komt de dag in de mail uit. */
  start: Date;
  end: Date;
  /** Wat en hoeveel, zoals `describeAfwas` het zegt: "3 bakken · Ecocups". */
  what: string;
  /** Welk evenement, of een opmerking, zoals de groep het invulde. */
  note: string | null;
};

export type AfwasMail = { subject: string; text: string; html: string };

const AFWAS_URL = 'https://vtk.be/admin/theokot/afwas';
const AFWAS_URL_EN = 'https://vtk.be/en/admin/theokot/afwas';

function formats(nl: boolean) {
  const tag = nl ? 'nl-BE' : 'en-GB';
  return {
    day: new Intl.DateTimeFormat(tag, { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long' }),
    time: new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }),
  };
}

function card(input: AfwasMailInput, nl: boolean, kicker: string): string {
  const f = formats(nl);
  const when = `${f.time.format(input.start)} ${nl ? 'tot' : 'until'} ${f.time.format(input.end)}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border:1px solid ${MAIL_COLOR.line};border-radius:18px;overflow:hidden"><tr>${mailDateStub(
    { date: input.start, locale: nl ? 'nl' : 'en' },
  )}<td valign="middle" style="padding:18px 20px;font-family:${MAIL_FONT}"><div style="font-size:12px;font-weight:600;color:${MAIL_COLOR.muted}">${escapeHtml(
    kicker,
  )}</div><div style="margin:4px 0 6px;font-size:18px;font-weight:650;letter-spacing:-.02em;color:${MAIL_COLOR.ink}">${escapeHtml(
    input.groupName,
  )}</div><div style="font-size:13px;line-height:1.5;color:${MAIL_COLOR.body}"><strong>${escapeHtml(
    f.day.format(input.start),
  )}</strong>, ${escapeHtml(when)}<br>${nl ? 'Af te wassen' : 'To wash'}: ${escapeHtml(input.what)}${
    input.note ? `<br>${nl ? 'Evenement' : 'Event'}: ${escapeHtml(input.note)}` : ''
  }</div></td></tr></table>`;
}

/** De dag ervoor: morgen komt jullie groep afwassen. */
export function afwasReminderMail(input: AfwasMailInput): AfwasMail {
  const nl = input.locale !== 'EN';
  const f = formats(nl);
  const day = f.day.format(input.start);
  const from = f.time.format(input.start);
  const until = f.time.format(input.end);

  const subject = nl ? `Morgen afwassen in Theokot (${input.groupName})` : `Washing up in Theokot tomorrow (${input.groupName})`;
  const intro = nl
    ? `Morgen komt ${input.groupName} afwassen in Theokot.`
    : `Tomorrow ${input.groupName} is washing up in Theokot.`;
  const notice = nl
    ? 'Spreek met je groep af wie er gaat, en vink de afwas op de site af wanneer alles proper is. Logistiek haalt alles de maandag erop terug. Kan het toch niet, kies dan op de site een andere namiddag.'
    : 'Agree with your team who is going, and tick the washing up off on the website once everything is clean. Logistics collects it all the following Monday. If it no longer works out, pick another afternoon on the website.';

  const text = [
    nl ? `Dag ${input.name},` : `Hi ${input.name},`,
    '',
    intro,
    '',
    nl ? `${day}, ${from} tot ${until}` : `${day}, ${from} until ${until}`,
    nl ? 'Waar: Theokot' : 'Where: Theokot',
    nl ? `Af te wassen: ${input.what}` : `To wash: ${input.what}`,
    ...(input.note ? [nl ? `Evenement: ${input.note}` : `Event: ${input.note}`] : []),
    '',
    notice,
    '',
    nl ? AFWAS_URL : AFWAS_URL_EN,
    '',
    nl ? 'Tot morgen,' : 'See you tomorrow,',
    'Theokot',
  ].join('\n');

  const html = mailDocument({
    lang: nl ? 'nl' : 'en',
    title: subject,
    rows: `${mailHeaderRow({ kicker: 'VTK Theokot' })}${mailContentRow(
      `${mailHeading(nl ? 'Morgen afwassen' : 'Washing up tomorrow')}${mailParagraph(
        nl ? `Dag ${input.name},` : `Hi ${input.name},`,
      )}${mailParagraph(intro)}${card(input, nl, nl ? 'Afwas' : 'Washing up')}${mailNoticeBox(
        notice,
        nl ? 'Aandachtspunt' : 'Important',
      )}<div style="margin-top:22px">${mailButton(nl ? AFWAS_URL : AFWAS_URL_EN, nl ? 'Bekijk de afwasplanning' : 'View the washing-up schedule')}</div>`,
    )}${mailFooterRow(
      nl
        ? `Je krijgt deze mail omdat je dit werkingsjaar in ${input.groupName} zit en jullie deze namiddag boekten.`
        : `You received this email because you are in ${input.groupName} this year and your team booked this afternoon.`,
    )}`,
  });

  return { subject, text, html };
}

/** De week staat online zonder deze dag: de afwas kan die namiddag niet. */
export function afwasClosedMail(input: AfwasMailInput): AfwasMail {
  const nl = input.locale !== 'EN';
  const f = formats(nl);
  const day = f.day.format(input.start);

  const subject = nl ? `Theokot is ${day} niet open` : `Theokot is closed on ${day}`;
  const intro = nl
    ? `${input.groupName} boekte ${day} om af te wassen in Theokot, maar Theokot is die dag niet open.`
    : `${input.groupName} booked ${day} to wash up in Theokot, but Theokot is closed that day.`;
  const ask = nl
    ? 'Kies op de site een andere namiddag met "Namiddag wijzigen", liefst nog in dezelfde week, want Logistiek haalt alles de maandag erop terug.'
    : 'Pick another afternoon on the website with "Change afternoon", preferably in the same week, because Logistics collects everything the following Monday.';

  const text = [
    nl ? `Dag ${input.name},` : `Hi ${input.name},`,
    '',
    intro,
    '',
    nl ? `Af te wassen: ${input.what}` : `To wash: ${input.what}`,
    ...(input.note ? [nl ? `Evenement: ${input.note}` : `Event: ${input.note}`] : []),
    '',
    ask,
    '',
    nl ? AFWAS_URL : AFWAS_URL_EN,
    '',
    nl ? 'Groetjes,' : 'Kind regards,',
    'Theokot',
  ].join('\n');

  const html = mailDocument({
    lang: nl ? 'nl' : 'en',
    title: subject,
    rows: `${mailHeaderRow({ kicker: 'VTK Theokot' })}${mailContentRow(
      `${mailHeading(nl ? 'Theokot is die dag dicht' : 'Theokot is closed that day')}${mailParagraph(
        nl ? `Dag ${input.name},` : `Hi ${input.name},`,
      )}${mailParagraph(intro)}${card(input, nl, nl ? 'Afwas gaat niet door' : 'Washing up is off')}${mailNoticeBox(
        ask,
        nl ? 'Wat nu?' : 'What now?',
      )}<div style="margin-top:22px">${mailButton(nl ? AFWAS_URL : AFWAS_URL_EN, nl ? 'Kies een andere namiddag' : 'Pick another afternoon')}</div>`,
    )}${mailFooterRow(
      nl
        ? `Je krijgt deze mail omdat je dit werkingsjaar in ${input.groupName} zit en jullie deze namiddag boekten.`
        : `You received this email because you are in ${input.groupName} this year and your team booked this afternoon.`,
    )}`,
  });

  return { subject, text, html };
}

/** Wat de twee mails zonder vaste namiddag nodig hebben. */
export type AfwasOpenMailInput = {
  name: string;
  locale: 'NL' | 'EN';
  groupName: string;
  what: string;
  /** Welk evenement, of een opmerking. */
  note: string | null;
  /** De dag van het evenement, als die er is. */
  eventDate: Date | null;
  /**
   * De namiddag, als wie noteerde er al een koos. Dan zegt de mail wanneer, in
   * plaats van te vragen er een te kiezen.
   */
  start: Date | null;
  end: Date | null;
};

function openCard(input: AfwasOpenMailInput, nl: boolean, kicker: string): string {
  const f = formats(nl);
  const lines = [
    `${nl ? 'Af te wassen' : 'To wash'}: ${escapeHtml(input.what)}`,
    ...(input.note || input.eventDate
      ? [
          `${nl ? 'Evenement' : 'Event'}: ${escapeHtml(
            [input.note, input.eventDate ? f.day.format(input.eventDate) : null].filter(Boolean).join(', '),
          )}`,
        ]
      : []),
    input.start && input.end
      ? `${nl ? 'Namiddag' : 'Afternoon'}: <strong>${escapeHtml(f.day.format(input.start))}</strong>, ${escapeHtml(
          `${f.time.format(input.start)} ${nl ? 'tot' : 'until'} ${f.time.format(input.end)}`,
        )}`
      : `${nl ? 'Namiddag' : 'Afternoon'}: <strong>${nl ? 'nog te kiezen' : 'still to pick'}</strong>`,
  ];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border:1px solid ${MAIL_COLOR.line};border-left:4px solid ${MAIL_COLOR.yellow};border-radius:0 18px 18px 0"><tr><td style="padding:18px 20px;font-family:${MAIL_FONT}"><div style="font-size:12px;font-weight:600;color:${MAIL_COLOR.muted}">${escapeHtml(
    kicker,
  )}</div><div style="margin:4px 0 6px;font-size:18px;font-weight:650;letter-spacing:-.02em;color:${MAIL_COLOR.ink}">${escapeHtml(
    input.groupName,
  )}</div><div style="font-size:13px;line-height:1.6;color:${MAIL_COLOR.body}">${lines.join('<br>')}</div></td></tr></table>`;
}

function openText(input: AfwasOpenMailInput, nl: boolean): string[] {
  const f = formats(nl);
  return [
    nl ? `Af te wassen: ${input.what}` : `To wash: ${input.what}`,
    ...(input.note || input.eventDate
      ? [
          `${nl ? 'Evenement' : 'Event'}: ${[input.note, input.eventDate ? f.day.format(input.eventDate) : null]
            .filter(Boolean)
            .join(', ')}`,
        ]
      : []),
    input.start && input.end
      ? `${nl ? 'Namiddag' : 'Afternoon'}: ${f.day.format(input.start)}, ${f.time.format(input.start)} ${nl ? 'tot' : 'until'} ${f.time.format(input.end)}`
      : nl
        ? 'Namiddag: nog te kiezen'
        : 'Afternoon: still to pick',
  ];
}

const PICK_HINT_NL =
  'Kies op de site een namiddag met "Namiddag kiezen", liefst in de week na het evenement: Logistiek brengt de bekers op maandag naar Theokot en haalt ze de maandag erop terug.';
const PICK_HINT_EN =
  'Pick an afternoon on the website with "Pick afternoon", ideally in the week after the event: Logistics brings the cups to Theokot on Monday and collects them the following Monday.';

/**
 * Iemand buiten de groep (Theokot, Logistiek) noteerde afwas voor haar. Zonder
 * namiddag vraagt de mail er een te kiezen; met namiddag zegt ze wanneer.
 */
export function afwasNotedMail(input: AfwasOpenMailInput & { notedBy: string }): AfwasMail {
  const nl = input.locale !== 'EN';
  const planned = Boolean(input.start && input.end);
  const subject = planned
    ? nl
      ? `Afwas in Theokot voor ${input.groupName}`
      : `Washing up in Theokot for ${input.groupName}`
    : nl
      ? `Kies een namiddag om af te wassen (${input.groupName})`
      : `Pick an afternoon to wash up (${input.groupName})`;
  const intro = planned
    ? nl
      ? `${input.notedBy} zette voor ${input.groupName} een afwas in Theokot op de planning.`
      : `${input.notedBy} scheduled washing up in Theokot for ${input.groupName}.`
    : nl
      ? `${input.notedBy} noteerde dat ${input.groupName} nog moet afwassen in Theokot. Er is nog geen namiddag gekozen.`
      : `${input.notedBy} noted that ${input.groupName} still has washing up to do in Theokot. No afternoon has been picked yet.`;
  const hint = planned
    ? nl
      ? 'Past die namiddag niet, kies dan op de site een andere met "Namiddag wijzigen". Vink de afwas af wanneer alles proper is.'
      : 'If that afternoon does not work, pick another one on the website with "Change afternoon". Tick the washing up off once everything is clean.'
    : nl
      ? PICK_HINT_NL
      : PICK_HINT_EN;

  const text = [
    nl ? `Dag ${input.name},` : `Hi ${input.name},`,
    '',
    intro,
    '',
    ...openText(input, nl),
    '',
    hint,
    '',
    nl ? AFWAS_URL : AFWAS_URL_EN,
    '',
    nl ? 'Groetjes,' : 'Kind regards,',
    'Theokot',
  ].join('\n');

  const html = mailDocument({
    lang: nl ? 'nl' : 'en',
    title: subject,
    rows: `${mailHeaderRow({ kicker: 'VTK Theokot' })}${mailContentRow(
      `${mailHeading(planned ? (nl ? 'Afwas gepland' : 'Washing up scheduled') : nl ? 'Kies een namiddag' : 'Pick an afternoon')}${mailParagraph(
        nl ? `Dag ${input.name},` : `Hi ${input.name},`,
      )}${mailParagraph(intro)}${openCard(input, nl, nl ? 'Afwas' : 'Washing up')}${mailNoticeBox(
        hint,
        nl ? 'Wat nu?' : 'What now?',
      )}<div style="margin-top:22px">${mailButton(
        nl ? AFWAS_URL : AFWAS_URL_EN,
        planned ? (nl ? 'Bekijk de afwasplanning' : 'View the washing-up schedule') : nl ? 'Kies een namiddag' : 'Pick an afternoon',
      )}</div>`,
    )}${mailFooterRow(
      nl
        ? `Je krijgt deze mail omdat je dit werkingsjaar in ${input.groupName} zit.`
        : `You received this email because you are in ${input.groupName} this year.`,
    )}`,
  });

  return { subject, text, html };
}

/** Twee dagen na het noteren staat er nog geen namiddag: één herinnering. */
export function afwasPickReminderMail(input: AfwasOpenMailInput): AfwasMail {
  const nl = input.locale !== 'EN';
  const subject = nl
    ? `Nog geen namiddag gekozen om af te wassen (${input.groupName})`
    : `No afternoon picked yet to wash up (${input.groupName})`;
  const intro = nl
    ? `Voor ${input.groupName} staat er afwas op de lijst in Theokot, maar er is nog geen namiddag gekozen.`
    : `There is washing up on the Theokot list for ${input.groupName}, but no afternoon has been picked yet.`;

  const text = [
    nl ? `Dag ${input.name},` : `Hi ${input.name},`,
    '',
    intro,
    '',
    ...openText(input, nl),
    '',
    nl ? PICK_HINT_NL : PICK_HINT_EN,
    '',
    nl ? AFWAS_URL : AFWAS_URL_EN,
    '',
    nl ? 'Groetjes,' : 'Kind regards,',
    'Theokot',
  ].join('\n');

  const html = mailDocument({
    lang: nl ? 'nl' : 'en',
    title: subject,
    rows: `${mailHeaderRow({ kicker: 'VTK Theokot' })}${mailContentRow(
      `${mailHeading(nl ? 'Nog geen namiddag gekozen' : 'No afternoon picked yet')}${mailParagraph(
        nl ? `Dag ${input.name},` : `Hi ${input.name},`,
      )}${mailParagraph(intro)}${openCard(input, nl, nl ? 'Afwas' : 'Washing up')}${mailNoticeBox(
        nl ? PICK_HINT_NL : PICK_HINT_EN,
        nl ? 'Wat nu?' : 'What now?',
      )}<div style="margin-top:22px">${mailButton(nl ? AFWAS_URL : AFWAS_URL_EN, nl ? 'Kies een namiddag' : 'Pick an afternoon')}</div>`,
    )}${mailFooterRow(
      nl
        ? `Je krijgt deze herinnering omdat je dit werkingsjaar in ${input.groupName} zit. Ze vertrekt één keer per afwas.`
        : `You received this reminder because you are in ${input.groupName} this year. It is sent once per washing-up line.`,
    )}`,
  });

  return { subject, text, html };
}
