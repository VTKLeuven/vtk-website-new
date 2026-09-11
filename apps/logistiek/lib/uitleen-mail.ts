import 'server-only';

import { prisma } from '@vtk/db';
import { sendMail } from '@vtk/mail';
import {
  NOTIFY_KINDS,
  formatDateOnly,
  formatDateTime,
  parseNotifyEmails,
  requesterLabel,
  type NotifyKind,
} from './uitleen';
import { getLogistiekSettings } from './uitleen-server';
import type { LogistiekLocale } from './i18n-shared';
import { logistiekBaseUrl } from './payments';

/**
 * Mails naar de aanvrager wanneer Logistiek iets aan zijn aanvraag doet.
 *
 * Waarom dit bestaat: het beheer kan sinds fase 3 en 5 beslissingen terugdraaien,
 * uren verschuiven en de inhoud van een aanvraag aanpassen. Zonder mail merkt de
 * aanvrager dat pas wanneer hij toevallig opnieuw inlogt, en dat is meestal bij
 * het afhalen. Te laat dus.
 *
 * Drie regels die hier bewust ingebakken zitten:
 *
 * 1. **Versturen mag de actie nooit doen falen.** Een mailserver die er even niet
 *    is, mag geen goedkeuring terugdraaien. Elke functie hier vangt dus zelf en
 *    logt; de aanroeper krijgt geen fout.
 * 2. **Roep ze aan ná de transactie**, niet erin. Anders vertrekt er een mail
 *    over een wijziging die door een rollback nooit gebeurd is.
 * 3. **Niet elke statusstap mailt.** Goedgekeurd, afgewezen, gewijzigd en
 *    teruggedraaid; niet "afgehaald" of "betaald". Wie voor elke klik een mail
 *    krijgt, leest ze geen van alle nog.
 */

export type UitleenMailEvent = 'APPROVED' | 'REJECTED' | 'EDITED' | 'REOPENED';

type Recipient = { to: string; cc: string[] | undefined; name: string; locale: LogistiekLocale };

/**
 * Naar welk adres. Dezelfde regel als de hoofdsite (`preferredEmail`): wie een
 * persoonlijk adres als voorkeur zette, leest zijn universiteitsmail niet.
 */
function recipientOf(
  user: { name: string; email: string; personalEmail: string | null; emailPreference: string; locale: string },
  notifyEmail: string | null
): Recipient {
  const to =
    user.emailPreference === 'PERSONAL' && user.personalEmail ? user.personalEmail : user.email;
  // Het veld kan meerdere adressen dragen, gescheiden door een komma.
  const cc = (parseNotifyEmails(notifyEmail ?? '') ?? []).filter(
    // Een cc naar hetzelfde adres levert de aanvrager twee keer dezelfde mail.
    (address) => address.toLowerCase() !== to.toLowerCase()
  );
  return {
    to,
    cc: cc.length > 0 ? cc : undefined,
    name: user.name,
    locale: user.locale === 'EN' ? 'en' : 'nl',
  };
}

const SUBJECT_PREFIX = 'VTK Logistiek';

/** Waar de mail over gaat; bepaalt of we "je aanvraag" of "je rit" schrijven. */
type MailSubject = 'reservation' | 'trip';

function eventWords(event: UitleenMailEvent, subject: MailSubject, locale: LogistiekLocale) {
  const nl = locale !== 'en';
  const thing = nl
    ? subject === 'trip'
      ? 'je rit'
      : 'je aanvraag'
    : subject === 'trip'
      ? 'your trip'
      : 'your request';
  const Thing = thing.charAt(0).toUpperCase() + thing.slice(1);
  switch (event) {
    case 'APPROVED':
      return nl
        ? { subject: 'goedgekeurd', lead: `${Thing} is goedgekeurd.` }
        : { subject: 'approved', lead: `${Thing} has been approved.` };
    case 'REJECTED':
      return nl
        ? { subject: 'afgewezen', lead: `${Thing} is afgewezen.` }
        : { subject: 'rejected', lead: `${Thing} has been rejected.` };
    case 'EDITED':
      return nl
        ? { subject: 'aangepast', lead: `Logistiek heeft ${thing} aangepast.` }
        : { subject: 'changed', lead: `Logistics changed ${thing}.` };
    case 'REOPENED':
      return nl
        ? {
            subject: 'terug open',
            lead: `Logistiek heeft de beslissing over ${thing} teruggedraaid; ze staat weer open.`,
          }
        : {
            subject: 'reopened',
            lead: `Logistics undid the decision on ${thing}; it is open again.`,
          };
  }
}

/** Ondertekening plus de link naar het overzicht van het lid zelf. */
function footer(subject: MailSubject, locale: LogistiekLocale): string {
  const nl = locale !== 'en';
  const url = `${logistiekBaseUrl()}${subject === 'trip' ? '/ritten' : '/reservaties'}`;
  if (nl) {
    const what = subject === 'trip' ? 'Je rit bekijken' : 'Je aanvraag bekijken';
    return `${what}: ${url}\n\nGroeten,\nLogistiek VTK`;
  }
  const what = subject === 'trip' ? 'View your trip' : 'View your request';
  return `${what}: ${url}\n\nRegards,\nLogistics VTK`;
}

/**
 * Blokken aan elkaar met een lege regel ertussen. Een blok dat er niet is, valt
 * weg zonder een dubbele witregel achter te laten; daarom `null` en niet `''`
 * als "geen blok" (een lege string is hier een bewuste lege regel).
 */
function joinBlocks(blocks: Array<string | null>): string {
  return blocks.filter((block): block is string => block !== null).join('\n\n');
}

/**
 * De toelichting van het team, indien er een is. Bij een wijziging is dit de
 * historiekregel uit A6 ("Tafel: 5 → 3", "Uren verschoven naar 14:30"): zeggen
 * wát er veranderd is, niet enkel dát er iets veranderd is. Bij een afwijzing is
 * het de reden, en bij de rest een gewone zin die geen kopje nodig heeft.
 */
function detailBlock(
  note: string | null | undefined,
  event: UitleenMailEvent,
  locale: LogistiekLocale
): string | null {
  const text = note?.trim();
  if (!text) return null;
  const nl = locale !== 'en';
  if (event === 'EDITED') return `${nl ? 'Wat er veranderde:' : 'What changed:'}\n${text}`;
  if (event === 'REJECTED') return `${nl ? 'Reden:' : 'Reason:'} ${text}`;
  return text;
}

/**
 * Versturen, en zeggen of het gelukt is.
 *
 * De meeste aanroepers doen met dat antwoord niets: hun mail is een gevolg van
 * een beslissing die al genomen is, en die opnieuw proberen zou de aanvrager een
 * tweede keer hetzelfde vertellen. De gebundelde teammelding wél: daar is de
 * aanvraag zelf de wachtrij, en ze mag pas afgevinkt worden wanneer het bericht
 * echt vertrokken is (zie `sendTeamDigests`).
 *
 * `sendMail` geeft `false` bij een mislukking en gooit niet; een server zonder
 * SMTP logt het bericht en telt als geslaagd, want daar valt niets te herhalen.
 */
async function deliver(recipient: Recipient, subject: string, text: string): Promise<boolean> {
  try {
    return await sendMail({
      to: recipient.to,
      cc: recipient.cc,
      subject,
      text,
      from: process.env.LOGISTIEK_MAIL_FROM || 'Logistiek VTK <logistiek@vtk.be>',
    });
  } catch (err) {
    // sendMail vangt zelf al; dit is de vangnetlaag voor alles ervoor.
    console.error('[uitleen-mail] versturen mislukt:', err);
    return false;
  }
}

/**
 * Mail over een materiaal- of flesserke-aanvraag.
 *
 * `note` is de toelichting die ook in de historiek staat. Faalt het ophalen of
 * versturen, dan blijft het bij een logregel.
 */
export async function notifyReservation(
  reservationId: string,
  event: UitleenMailEvent,
  note?: string | null
): Promise<void> {
  try {
    const reservation = await prisma.uitleenReservation.findUnique({
      where: { id: reservationId },
      select: {
        eventName: true,
        pickupDate: true,
        returnDate: true,
        adminNote: true,
        notifyEmail: true,
        user: {
          select: {
            name: true,
            email: true,
            personalEmail: true,
            emailPreference: true,
            locale: true,
          },
        },
        lines: {
          select: {
            itemName: true,
            quantity: true,
            note: true,
            adminNote: true,
            lineStatus: true,
          },
        },
        flesserkeLines: { select: { itemName: true, quantity: true } },
      },
    });
    if (!reservation) return;

    const recipient = recipientOf(reservation.user, reservation.notifyEmail);
    const nl = recipient.locale !== 'en';
    const words = eventWords(event, 'reservation', recipient.locale);

    // De opmerkingen per item horen in de mail (E6): de aanvrager leest die mail
    // en niet het scherm, en "zie vorig event" of "graag de zwarte" is precies
    // de afspraak die daarna misloopt als ze er niet in staat.
    const lineText = (line: {
      itemName: string;
      quantity: number;
      note?: string | null;
      adminNote?: string | null;
    }) => {
      const notes = [line.note, line.adminNote].filter(Boolean).join(' | ');
      return `- ${line.quantity} x ${line.itemName}${notes ? ` (${notes})` : ''}`;
    };

    const granted = reservation.lines.filter((line) => line.lineStatus !== 'REJECTED');
    const refused = reservation.lines.filter((line) => line.lineStatus === 'REJECTED');
    const items = [...granted.map(lineText), ...reservation.flesserkeLines.map(lineText)].join('\n');
    // Niet toegekende items staan apart onderaan, niet tussen de rest: tussen de
    // goedgekeurde lijst gelezen worden ze meegenomen naar het evenement (E6).
    const refusedBlock =
      refused.length > 0
        ? `\n\n${nl ? 'Niet toegekend:' : 'Not granted:'}\n${refused
            .map(
              (line) =>
                `- ${line.quantity} x ${line.itemName}${line.adminNote ? ` (${line.adminNote})` : ''}`
            )
            .join('\n')}`
        : '';
    const period = `${formatDateOnly(reservation.pickupDate, recipient.locale)} - ${formatDateOnly(
      reservation.returnDate,
      recipient.locale
    )}`;

    // Bij een afwijzing is de nota van het team de reden; die hoort in de mail,
    // anders is "afgewezen" alles wat de aanvrager weet.
    const reason = event === 'REJECTED' ? note ?? reservation.adminNote : note;

    const text = joinBlocks([
      nl ? `Dag ${recipient.name},` : `Hi ${recipient.name},`,
      words.lead,
      `${nl ? 'Aanvraag' : 'Request'}: ${reservation.eventName}\n${nl ? 'Periode' : 'Period'}: ${period}`,
      items ? `${nl ? 'Materiaal' : 'Items'}:\n${items}${refusedBlock}` : refusedBlock.trim() || null,
      detailBlock(reason, event, recipient.locale),
      footer('reservation', recipient.locale),
    ]);

    await deliver(
      recipient,
      `${SUBJECT_PREFIX}: ${reservation.eventName} ${words.subject}`,
      text
    );
  } catch (err) {
    console.error('[uitleen-mail] reservatiemail mislukt:', err);
  }
}

/**
 * Mail over een rit. Neemt een lijst id's omdat een heen- en terugrit samen
 * beslist worden (V12): dat is één mail met beide ritten, geen twee mails vlak
 * na elkaar over dezelfde aanvraag.
 */
export async function notifyTransport(
  bookingIds: string[],
  event: UitleenMailEvent,
  note?: string | null
): Promise<void> {
  try {
    if (bookingIds.length === 0) return;
    const bookings = await prisma.uitleenTransportBooking.findMany({
      where: { id: { in: bookingIds } },
      orderBy: { startAt: 'asc' },
      select: {
        purpose: true,
        startAt: true,
        endAt: true,
        tripLeg: true,
        adminNote: true,
        notifyEmail: true,
        vehicle: { select: { nameNl: true, nameEn: true } },
        user: {
          select: {
            name: true,
            email: true,
            personalEmail: true,
            emailPreference: true,
            locale: true,
          },
        },
      },
    });
    if (bookings.length === 0) return;

    const first = bookings[0];
    const recipient = recipientOf(first.user, first.notifyEmail);
    const nl = recipient.locale !== 'en';
    const words = eventWords(event, 'trip', recipient.locale);

    const legLabel = (leg: string | null) => {
      if (leg === 'HEEN') return nl ? 'Heenrit' : 'Outbound';
      if (leg === 'TERUG') return nl ? 'Terugrit' : 'Return';
      return nl ? 'Rit' : 'Trip';
    };
    const trips = bookings
      .map(
        (booking) =>
          `- ${legLabel(booking.tripLeg)}: ${formatDateTime(booking.startAt, recipient.locale)} - ${formatDateTime(
            booking.endAt,
            recipient.locale
          )} (${nl ? booking.vehicle.nameNl : booking.vehicle.nameEn})`
      )
      .join('\n');

    const reason = event === 'REJECTED' ? note ?? first.adminNote : note;

    const text = joinBlocks([
      nl ? `Dag ${recipient.name},` : `Hi ${recipient.name},`,
      words.lead,
      `${nl ? 'Rit' : 'Trip'}: ${first.purpose}`,
      trips,
      detailBlock(reason, event, recipient.locale),
      footer('trip', recipient.locale),
    ]);

    await deliver(recipient, `${SUBJECT_PREFIX}: ${first.purpose} ${words.subject}`, text);
  } catch (err) {
    console.error('[uitleen-mail] ritmail mislukt:', err);
  }
}

/**
 * Melding naar het team dat er nieuwe aanvragen binnengekomen zijn (M1, R4).
 *
 * De andere mails in dit bestand gaan naar de **aanvrager** en enkel bij een
 * beslissing. Deze gaat de andere kant op, en is de reden dat het team niet meer
 * elke dag zelf hoeft te gaan kijken of er iets binnengekomen is.
 *
 * **Gebundeld en niet per aanvraag.** Ze vertrok eerst meteen bij het indienen,
 * en wie vijf ritten na elkaar aanvroeg, stuurde vijf mails naar dezelfde
 * mailbox; vijf mails lezen als vijf aanvragen, en dat is precies de ruis waar
 * deze melding tegen bedoeld was. Nu gaat er hoogstens één mail per uur per
 * soort, met alles erin. De wachtrij is de kolom `teamNotifiedAt` op de aanvraag
 * zelf: `null` = nog te melden.
 *
 * De regels van hierboven gelden onverkort, plus één die er specifiek bij hoort:
 *
 * 1. **Aanroepen ná de write**, nooit erin. Dat is nu vanzelfsprekend: de bundel
 *    vertrekt later, vanuit de onderhoudsroute.
 * 2. **Falen mag de aanvraag niet doen falen**, en mag ze ook niet doen
 *    verdwijnen: een mislukte verzending stempelt **niet**, zodat de melding bij
 *    de volgende tick opnieuw geprobeerd wordt in plaats van stil weg te zijn.
 * 3. **Enkel bij het indienen.** Elke wijziging melden zou dezelfde mailbox
 *    vullen tot niemand ze nog leest.
 *
 * Naar welk adres staat per soort op /beheer/instellingen. Is dat leeg, dan
 * vertrekt er niets (dat scherm zegt dat), maar wordt er wél gestempeld: anders
 * groeit een wachtrij aan die nooit ergens heen gaat.
 */

/** Hoogstens één bundel per uur per soort. */
const DIGEST_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Binnen hoeveel uur een aanvraag te dringend is om te wachten.
 *
 * Een rit die vanavond vertrekt, een uur laten liggen is geen verbetering maar
 * precies het probleem dat de teammelding kwam oplossen. Bewust 24 uur en niet
 * de "last minute"-instelling (standaard zeven dagen): met zeven dagen zou bijna
 * elke aanvraag de bundel omzeilen en verandert er niets.
 */
const URGENT_HOURS = 24;

/** Waar staat wanneer er voor het laatst een bundel vertrok, per soort. */
const DIGEST_SETTINGS_KEY = 'logistiek.teamDigest';

type DigestState = Partial<Record<NotifyKind, string>>;

async function readDigestState(): Promise<DigestState> {
  const row = await prisma.setting.findUnique({ where: { key: DIGEST_SETTINGS_KEY } });
  const value = (row?.value ?? null) as Record<string, unknown> | null;
  if (!value) return {};
  return Object.fromEntries(
    NOTIFY_KINDS.flatMap((kind) =>
      typeof value[kind] === 'string' ? [[kind, value[kind] as string]] : []
    )
  );
}

async function writeDigestState(state: DigestState): Promise<void> {
  await prisma.setting.upsert({
    where: { key: DIGEST_SETTINGS_KEY },
    create: { key: DIGEST_SETTINGS_KEY, value: state },
    update: { value: state },
  });
}

/** De aanvragen van deze soort die nog gemeld moeten worden, oudste eerst. */
async function pendingFor(kind: NotifyKind): Promise<Array<{ id: string; startsAt: Date }>> {
  if (kind === 'transport') {
    const rows = await prisma.uitleenTransportBooking.findMany({
      where: { teamNotifiedAt: null },
      orderBy: { createdAt: 'asc' },
      // Een bovengrens tegen een bundel van honderd aanvragen na een storing:
      // de rest volgt bij de volgende tick.
      take: 25,
      select: { id: true, startAt: true, tripGroupId: true },
    });
    // Heen en terug zijn twee boekingen maar één aanvraag, en de samenvatting
    // toont ze allebei; ze apart opnemen zou ze dubbel in de mail zetten.
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (row.tripGroupId) {
        if (seen.has(row.tripGroupId)) return [];
        seen.add(row.tripGroupId);
      }
      return [{ id: row.id, startsAt: row.startAt }];
    });
  }

  const rows = await prisma.uitleenReservation.findMany({
    where: {
      teamNotifiedAt: null,
      // Materiaal en flesserke zijn twee soorten melding op dezelfde tabel; welke
      // het is, volgt uit de lijnen die eraan hangen. Een aanvraag met allebei
      // hoort in allebei de bundels, want er kijken twee mensen naar.
      ...(kind === 'flesserke'
        ? { flesserkeLines: { some: {} } }
        : { lines: { some: {} } }),
    },
    orderBy: { createdAt: 'asc' },
    take: 25,
    select: { id: true, pickupDate: true },
  });
  return rows.map((row) => ({ id: row.id, startsAt: row.pickupDate }));
}

/** Zet `teamNotifiedAt`; welke tabel hangt af van de soort. */
async function markNotified(kind: NotifyKind, ids: string[], at: Date): Promise<void> {
  if (ids.length === 0) return;
  if (kind === 'transport') {
    // Ook de andere helft van een heen-en-terugaanvraag: die staat in dezelfde
    // mail en hoort dus niet als "nog te melden" te blijven staan.
    const groups = await prisma.uitleenTransportBooking.findMany({
      where: { id: { in: ids } },
      select: { tripGroupId: true },
    });
    const tripGroupIds = groups
      .map((row) => row.tripGroupId)
      .filter((value): value is string => value !== null);
    await prisma.uitleenTransportBooking.updateMany({
      where: { OR: [{ id: { in: ids } }, { tripGroupId: { in: tripGroupIds } }] },
      data: { teamNotifiedAt: at },
    });
    return;
  }
  await prisma.uitleenReservation.updateMany({
    where: { id: { in: ids } },
    data: { teamNotifiedAt: at },
  });
}

async function summaryFor(
  kind: NotifyKind,
  id: string
): Promise<{ title: string; text: string } | null> {
  return kind === 'transport' ? transportSummary(id) : reservationSummary(id);
}

/** Eén bundel versturen naar de adressen van deze soort. */
async function deliverDigest(
  kind: NotifyKind,
  to: string[],
  bodies: Array<{ title: string; text: string }>
): Promise<boolean> {
  const noun = kind === 'transport' ? 'ritaanvraag' : `${kind}aanvraag`;
  const subject =
    bodies.length === 1
      ? `${SUBJECT_PREFIX}: nieuwe ${noun}, ${bodies[0].title}`
      : `${SUBJECT_PREFIX}: ${bodies.length} nieuwe ${noun.replace(/aanvraag$/, 'aanvragen')}`;

  // Elke aanvraag houdt haar eigen blok met haar eigen beslis-link: dat is
  // waarvoor de mail bestaat. De aanhef staat er één keer boven en niet per
  // blok; drie keer "er is een nieuwe aanvraag binnengekomen" in dezelfde mail
  // leest als drie mails die per ongeluk aan elkaar geplakt zijn.
  const text = joinBlocks([
    bodies.length === 1
      ? `Er is een nieuwe ${noun} binnengekomen op ${logistiekBaseUrl()}.`
      : `Er staan ${bodies.length} nieuwe aanvragen klaar op ${logistiekBaseUrl()}.`,
    ...bodies.map((body, index) =>
      bodies.length === 1 ? body.text : `${index + 1}. ${body.title}\n\n${body.text}`
    ),
  ]);

  // Naar één adres met de rest in kopie: drie losse mails naar dezelfde mailbox
  // lezen als drie aanvragen.
  return deliver({ to: to[0], cc: to.slice(1), name: '', locale: 'nl' }, subject, text);
}

/**
 * De gebundelde teammelding versturen, als er iets klaarstaat en het uur om is.
 *
 * Wordt periodiek aangeroepen door de logistiek-worker (`/api/uitleen/maintenance`).
 * Geeft per soort terug hoeveel aanvragen er meegingen, zodat de route iets te
 * loggen heeft.
 */
export async function sendTeamDigests(
  now = new Date()
): Promise<Partial<Record<NotifyKind, number>>> {
  const sent: Partial<Record<NotifyKind, number>> = {};
  try {
    const [settings, state] = await Promise.all([getLogistiekSettings(), readDigestState()]);
    const next: DigestState = { ...state };
    let changed = false;

    for (const kind of NOTIFY_KINDS) {
      const pending = await pendingFor(kind);
      if (pending.length === 0) continue;

      const last = state[kind] ? Date.parse(state[kind]!) : 0;
      const due = !Number.isFinite(last) || now.getTime() - last >= DIGEST_INTERVAL_MS;
      if (!due) continue;

      const to = settings.notifyEmails[kind] ?? [];
      if (to.length === 0) {
        // Geen adres ingesteld is een geldige keuze, maar de wachtrij mag er niet
        // eeuwig door blijven groeien.
        await markNotified(kind, pending.map((entry) => entry.id), now);
        continue;
      }

      const bodies = (
        await Promise.all(pending.map((entry) => summaryFor(kind, entry.id)))
      ).filter((body): body is { title: string; text: string } => body !== null);
      if (bodies.length === 0) continue;

      // Enkel afvinken wanneer het bericht écht vertrokken is. Mislukt het, dan
      // blijft de wachtrij staan en probeert de volgende tick het opnieuw; stil
      // stempelen zou de melding laten verdwijnen, en dat is erger dan een uur
      // later.
      if (!(await deliverDigest(kind, to, bodies))) continue;
      await markNotified(kind, pending.map((entry) => entry.id), now);
      next[kind] = now.toISOString();
      changed = true;
      sent[kind] = bodies.length;
    }

    if (changed) await writeDigestState(next);
  } catch (err) {
    console.error('[uitleen-mail] teambundel mislukt:', err);
  }
  return sent;
}

/**
 * Een aanvraag die niet kan wachten, meteen melden.
 *
 * Aan te roepen ná het indienen. Begint het pas over meer dan {@link URGENT_HOURS}
 * uur, dan gebeurt er niets en pikt de bundel het op; is het dringend, dan
 * vertrekt de mail nu en wordt de rij gestempeld zodat ze niet nog eens in de
 * bundel komt.
 *
 * Faalt de verzending, dan blijft de rij staan en probeert de bundel het straks
 * opnieuw. Falen mag de aanvraag nooit doen falen: het lid dat "er ging iets mis"
 * te zien krijgt, dient opnieuw in en dan staan er twee.
 */
export async function notifyTeamIfUrgent(kind: NotifyKind, id: string): Promise<void> {
  try {
    const pending = await pendingFor(kind);
    const entry = pending.find((row) => row.id === id);
    if (!entry) return;
    if (entry.startsAt.getTime() - Date.now() > URGENT_HOURS * 60 * 60 * 1000) return;

    const settings = await getLogistiekSettings();
    const to = settings.notifyEmails[kind] ?? [];
    const body = await summaryFor(kind, id);
    if (!body) return;

    // Geen adres ingesteld is een geldige keuze; dan is er niets te versturen en
    // wordt de rij toch afgevinkt, zodat ze niet in de bundel blijft hangen.
    if (to.length > 0 && !(await deliverDigest(kind, to, [body]))) return;
    await markNotified(kind, [id], new Date());
  } catch (err) {
    console.error('[uitleen-mail] dringende teammelding mislukt:', err);
  }
}

/** De samenvatting van een materiaal- of flesserke-aanvraag voor de teammelding. */
async function reservationSummary(id: string): Promise<{ title: string; text: string } | null> {
  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id },
    select: {
      eventName: true,
      pickupDate: true,
      returnDate: true,
      memberNote: true,
      delivery: true,
      requesterType: true,
      requesterName: true,
      user: { select: { name: true } },
      group: { select: { nameNl: true } },
      lines: { select: { itemName: true, quantity: true } },
      flesserkeLines: { select: { itemName: true, quantity: true } },
    },
  });
  if (!reservation) return null;

  const items = [...reservation.lines, ...reservation.flesserkeLines]
    .map((line) => `- ${line.quantity} x ${line.itemName}`)
    .join('\n');

  return {
    title: reservation.eventName,
    text: joinBlocks([
      `Aanvraag: ${reservation.eventName}\nVan: ${requesterLabel(reservation)} (${reservation.user.name})\nPeriode: ${formatDateOnly(reservation.pickupDate)} - ${formatDateOnly(reservation.returnDate)}`,
      items ? `Gevraagd:\n${items}` : null,
      reservation.delivery ? 'Er is levering gevraagd.' : null,
      reservation.memberNote ? `Nota van het lid:\n${reservation.memberNote}` : null,
      `Beslissen: ${logistiekBaseUrl()}/beheer/aanvragen/${id}`,
    ]),
  };
}

/** Idem voor een rit; bij een heen-en-terugaanvraag staan beide ritten erin. */
async function transportSummary(id: string): Promise<{ title: string; text: string } | null> {
  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id },
    select: {
      purpose: true,
      cargoNote: true,
      eventName: true,
      startAt: true,
      endAt: true,
      tripGroupId: true,
      pickupAddress: true,
      destination: true,
      memberNote: true,
      requesterType: true,
      requesterName: true,
      user: { select: { name: true } },
      group: { select: { nameNl: true } },
      vehicle: { select: { nameNl: true } },
      helpers: { orderBy: { createdAt: 'asc' }, select: { name: true, phone: true } },
    },
  });
  if (!booking) return null;

  // Heen en terug zijn twee boekingen maar één aanvraag; het team beslist er in
  // één keer over, dus staan ze in één mail.
  const legs = booking.tripGroupId
    ? await prisma.uitleenTransportBooking.findMany({
        where: { tripGroupId: booking.tripGroupId },
        orderBy: { startAt: 'asc' },
        select: { startAt: true, endAt: true, vehicle: { select: { nameNl: true } } },
      })
    : [{ startAt: booking.startAt, endAt: booking.endAt, vehicle: booking.vehicle }];

  return {
    title: booking.eventName?.trim() || booking.purpose,
    text: joinBlocks([
      `Waarvoor: ${booking.purpose}\nVan: ${requesterLabel(booking)} (${booking.user.name})`,
      legs
        .map(
          (leg) =>
            `- ${formatDateTime(leg.startAt)} tot ${formatDateTime(leg.endAt)} (${leg.vehicle.nameNl})`
        )
        .join('\n'),
      booking.cargoNote ? `Lading: ${booking.cargoNote}` : null,
      booking.helpers.length > 0
        ? `Bijrijders: ${booking.helpers
            .map((helper) => `${helper.name}${helper.phone ? ` (${helper.phone})` : ''}`)
            .join(', ')}`
        : null,
      [booking.pickupAddress, booking.destination].some(Boolean)
        ? `Van: ${booking.pickupAddress ?? 'niet ingevuld'}\nNaar: ${booking.destination ?? 'niet ingevuld'}`
        : null,
      booking.memberNote ? `Nota van het lid:\n${booking.memberNote}` : null,
      `Beslissen: ${logistiekBaseUrl()}/beheer/vervoer?rit=${id}`,
    ]),
  };
}
