import 'server-only';

import { prisma } from '@vtk/db';
import { sendMail } from '@vtk/mail';
import {
  reservationDecisionMail,
  reservationRequestSummary,
  teamDigestMail,
  tripCancelledDriverMail,
  tripDecisionMail,
  tripHandoverMail,
  tripRequestSummary,
  type TripMailFacts,
  type UitleenDigestEntry,
  type UitleenMailEvent,
} from '@vtk/mail/logistiek';
import {
  NOTIFY_KINDS,
  formatDateOnly,
  formatDateTime,
  parseNotifyEmails,
  requesterLabel,
  tripEventName,
  tripTitle,
  type NotifyKind,
  type TripHandoverOutcome,
} from './uitleen';
import {
  getLogistiekSettings,
  groupLeads,
  groupMailAddress,
  teamEditsForTransport,
} from './uitleen-server';
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
 *
 * De teksten zelf staan in `@vtk/mail/logistiek`, als pure functies: daar roept
 * ook de voorvertoning op /admin/it/flows ze aan. Dit bestand haalt op, zet data
 * om naar tekst en verstuurt.
 */

export type { UitleenMailEvent };

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

export type NotifyOptions = {
  /** Wie de actie uitvoerde. Is dit dezelfde persoon als de aanvrager, dan vertrekt er geen mail. */
  actorId?: string;
};

export function shouldNotifyReservation(
  reservation: { userId: string },
  options?: NotifyOptions
): boolean {
  if (options?.actorId && options.actorId === reservation.userId) return false;
  return true;
}

export function shouldNotifyTransport(
  booking: { plannedByTeam: boolean; userId: string },
  options?: NotifyOptions
): boolean {
  if (booking.plannedByTeam) return false;
  if (options?.actorId && options.actorId === booking.userId) return false;
  return true;
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
  note?: string | null,
  options?: NotifyOptions
): Promise<void> {
  try {
    const reservation = await prisma.uitleenReservation.findUnique({
      where: { id: reservationId },
      select: {
        userId: true,
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
    if (!shouldNotifyReservation(reservation, options)) return;

    const recipient = recipientOf(reservation.user, reservation.notifyEmail);
    // Bij een afwijzing is de nota van het team de reden; die hoort in de mail,
    // anders is "afgewezen" alles wat de aanvrager weet.
    const reason = event === 'REJECTED' ? note ?? reservation.adminNote : note;
    const mail = reservationDecisionMail({
      locale: recipient.locale,
      recipientName: recipient.name,
      event,
      requestName: reservation.eventName,
      pickupDate: formatDateOnly(reservation.pickupDate, recipient.locale),
      returnDate: formatDateOnly(reservation.returnDate, recipient.locale),
      lines: reservation.lines.map((line) => ({
        quantity: line.quantity,
        name: line.itemName,
        note: line.note,
        adminNote: line.adminNote,
        refused: line.lineStatus === 'REJECTED',
      })),
      flesserkeLines: reservation.flesserkeLines.map((line) => ({
        quantity: line.quantity,
        name: line.itemName,
      })),
      detail: reason,
      baseUrl: logistiekBaseUrl(),
    });
    await deliver(recipient, mail.subject, mail.text);
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
  note?: string | null,
  options?: NotifyOptions
): Promise<void> {
  try {
    if (bookingIds.length === 0) return;
    const bookings = await prisma.uitleenTransportBooking.findMany({
      where: { id: { in: bookingIds } },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        userId: true,
        plannedByTeam: true,
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
    if (!shouldNotifyTransport(first, options)) return;

    const recipient = recipientOf(first.user, first.notifyEmail);
    const reason = event === 'REJECTED' ? note ?? first.adminNote : note;

    // Heen en terug (of twee voertuigen) zijn één aanvraag: de regels van alle
    // ritten samen, zonder dubbels.
    const teamChanges =
      event === 'APPROVED'
        ? [...new Set([...(await teamEditsForTransport(bookings)).values()].flat())]
        : [];

    const mail = tripDecisionMail({
      locale: recipient.locale,
      recipientName: recipient.name,
      event,
      purpose: first.purpose,
      legs: bookings.map((booking) => ({
        leg: booking.tripLeg === 'HEEN' || booking.tripLeg === 'TERUG' ? booking.tripLeg : null,
        start: formatDateTime(booking.startAt, recipient.locale),
        end: formatDateTime(booking.endAt, recipient.locale),
        vehicle: recipient.locale === 'en' ? booking.vehicle.nameEn : booking.vehicle.nameNl,
      })),
      teamChanges,
      detail: reason,
      baseUrl: logistiekBaseUrl(),
    });
    await deliver(recipient, mail.subject, mail.text);
  } catch (err) {
    console.error('[uitleen-mail] ritmail mislukt:', err);
  }
}

/**
 * Wat een chauffeur of een post over een rit leest, in de taal van de mail.
 *
 * De dag in het onderwerp staat in die taal; tot november 2026 was hij altijd
 * Nederlands, ook in een Engelse mail.
 */
function tripFacts(
  booking: {
    purpose: string;
    eventName: string | null;
    startAt: Date;
    endAt: Date;
    pickupAddress: string | null;
    destination: string | null;
    cargoNote: string | null;
    vehicle: { nameNl: string };
  },
  locale: LogistiekLocale
): TripMailFacts {
  return {
    title: tripTitle(booking),
    eventName: tripEventName(booking),
    start: formatDateTime(booking.startAt, locale),
    end: formatDateTime(booking.endAt, locale),
    startDate: formatDateOnly(booking.startAt, locale),
    vehicle: booking.vehicle.nameNl,
    pickupAddress: booking.pickupAddress,
    destination: booking.destination,
    cargoNote: booking.cargoNote,
  };
}

/**
 * "Jullie post mag deze autorit zelf invullen."
 *
 * Vertrekt zodra Logistiek een rit aan een post of werkgroep doorgeeft. Zonder
 * deze mail is de toewijzing een vinkje in een beheerscherm dat niemand aan de
 * andere kant ziet: de post weet niet dat er een rit op hen wacht, en de rit
 * vertrekt zonder chauffeur.
 *
 * **Standaard vertrekt er niets** (F4.8b). Wie er verwittigd wordt, is een
 * instelling in /beheer/instellingen: niemand, de verantwoordelijken van die
 * post, het postadres, of een vast adres. Tot september 2026 gingen er altijd
 * mails naar de verantwoordelijken, en sinds de doorgegeven ritten op /ritten
 * staan, was dat een tweede bericht over iets wat daar al stond; op een
 * planningsdag met tien ritten leest niemand die nog.
 *
 * Naar de verantwoordelijken (`LEAD`) en niet naar de hele post wanneer die
 * keuze gemaakt is: het is een taak die iemand moet verdelen, en veertien mensen
 * mailen om er één te laten antwoorden, is precies hoe een mailbox onleesbaar
 * wordt.
 *
 * Dezelfde regels als de rest van dit bestand: aanroepen ná de transactie, en
 * falen mag de toewijzing niet ongedaan maken.
 *
 * Geeft terug wat er **echt** gebeurd is, en niet enkel een aantal: de oproeper
 * schrijft er de melding mee, en "0 verstuurd" kan drie dingen betekenen die elk
 * iets anders van het team vragen. Een post zonder verantwoordelijke of zonder
 * postadres moet je zelf verwittigen; een mail die niet vertrok, betekent meestal
 * dat de mailserver niet meewilde; en bij `NIEMAND` is er niets misgegaan.
 */
export async function notifyGroupAssignedForTrip(
  bookingId: string
): Promise<TripHandoverOutcome> {
  try {
    const settings = await getLogistiekSettings();
    const handover = settings.tripHandover;
    if (handover.mode === 'NIEMAND') return { mode: 'NIEMAND' };

    const booking = await prisma.uitleenTransportBooking.findUnique({
      where: { id: bookingId },
      select: {
        purpose: true,
        eventName: true,
        startAt: true,
        endAt: true,
        pickupAddress: true,
        destination: true,
        cargoNote: true,
        adminNote: true,
        vehicle: { select: { nameNl: true } },
        assignedGroup: { select: { id: true, nameNl: true } },
      },
    });
    // Geen rit meer, of geen post erop: allebei onmogelijk vanaf de twee plekken
    // die dit aanroepen (die hebben de post er net op gezet). Gebeurt het toch,
    // dan is "er vertrok bewust niets" het verkeerde antwoord.
    if (!booking?.assignedGroup) return { mode: 'MISLUKT' };

    const group = booking.assignedGroup;

    /** De mail zelf, in de taal van wie ze krijgt. */
    const mailFor = (name: string, locale: LogistiekLocale) =>
      tripHandoverMail({
        locale,
        recipientName: name,
        groupName: group.nameNl,
        trip: tripFacts(booking, locale),
        adminNote: booking.adminNote,
        baseUrl: logistiekBaseUrl(),
      });

    if (handover.mode === 'LEADS') {
      const leads = await groupLeads(group.id);
      if (leads.length === 0) return { mode: 'LEADS', leads: 0, sent: 0 };
      let sent = 0;
      for (const lead of leads) {
        const recipient = recipientOf(lead, null);
        const mail = mailFor(recipient.name, recipient.locale);
        if (await deliver(recipient, mail.subject, mail.text)) sent += 1;
      }
      return { mode: 'LEADS', leads: leads.length, sent };
    }

    // Eén mailbox: de postmailinglijst of een vast adres. Geen aanhef met een
    // naam, want er zit niet één persoon achter; de mail is verder dezelfde. In
    // het Nederlands, want een mailbox heeft geen taalvoorkeur.
    const address =
      handover.mode === 'POSTADRES' ? await groupMailAddress(group.id) : handover.email.trim();
    if (!address) {
      // Bij POSTADRES is dit een post zonder eigen adres, en dat moet het team
      // weten. Bij ADRES kan het niet: het instellingenscherm weigert een lege
      // waarde, dus dan is de instelling van buitenaf stukgemaakt.
      return handover.mode === 'POSTADRES'
        ? { mode: 'POSTADRES', address: null, sent: 0 }
        : { mode: 'MISLUKT' };
    }
    const mail = mailFor('', 'nl');
    const sent = (await deliver({ to: address, cc: undefined, name: '', locale: 'nl' }, mail.subject, mail.text))
      ? 1
      : 0;
    return handover.mode === 'POSTADRES'
      ? { mode: 'POSTADRES', address, sent }
      : { mode: 'ADRES', address, sent };
  } catch (err) {
    console.error('[uitleen-mail] mail over de doorgegeven rit mislukt:', err);
    return { mode: 'MISLUKT' };
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
 * 3. **Enkel bij het indienen, en wanneer de aanvrager annuleert.** Elke
 *    wijziging melden zou dezelfde mailbox vullen tot niemand ze nog leest. Een
 *    annulatie wel: misschien ligt het materiaal al klaar of rekent een chauffeur
 *    op de rit. De annulatie zet `teamNotifiedAt` terug op `null` (zie
 *    `cancelReservationAction`), en de bundel herkent ze aan de status en aan
 *    de historiekregel die het annuleren schrijft. Een aanvraag die het team nog
 *    nooit te zien kreeg, wordt bij het annuleren meteen gestempeld: daar valt
 *    niets te melden.
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

/** Een aanvraag in de wachtrij van de teammelding. */
type PendingEntry = {
  id: string;
  startsAt: Date;
  /** Geannuleerd door de aanvrager, en niet nieuw binnengekomen. */
  cancelled: boolean;
};

/**
 * Een annulatie door de aanvrager, te herkennen aan de historiekregel die
 * `cancelReservationAction` en `cancelVanBookingAction` schrijven. Zonder die
 * voorwaarde kwam elke oude geannuleerde aanvraag met een lege `teamNotifiedAt`
 * (van voor er annulaties gemeld werden) in de eerstvolgende bundel terecht.
 */
const CANCELLED_BY_REQUESTER = {
  status: 'CANCELLED',
  auditLogs: { some: { kind: 'STATUS_CHANGED', toStatus: 'CANCELLED' } },
} as const;

/** De aanvragen van deze soort die nog gemeld moeten worden, oudste eerst. */
async function pendingFor(kind: NotifyKind): Promise<PendingEntry[]> {
  if (kind === 'transport') {
    const rows = await prisma.uitleenTransportBooking.findMany({
      where: {
        teamNotifiedAt: null,
        OR: [{ plannedByTeam: false, status: 'REQUESTED' }, CANCELLED_BY_REQUESTER],
      },
      orderBy: { createdAt: 'asc' },
      // Een bovengrens tegen een bundel van honderd aanvragen na een storing:
      // de rest volgt bij de volgende tick.
      take: 25,
      select: { id: true, startAt: true, tripGroupId: true, status: true },
    });
    // Heen en terug zijn twee boekingen maar één aanvraag, en de samenvatting
    // toont ze allebei; ze apart opnemen zou ze dubbel in de mail zetten.
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (row.tripGroupId) {
        if (seen.has(row.tripGroupId)) return [];
        seen.add(row.tripGroupId);
      }
      return [{ id: row.id, startsAt: row.startAt, cancelled: row.status === 'CANCELLED' }];
    });
  }

  const rows = await prisma.uitleenReservation.findMany({
    where: {
      teamNotifiedAt: null,
      OR: [{ status: 'REQUESTED' }, CANCELLED_BY_REQUESTER],
      // Materiaal en flesserke zijn twee soorten melding op dezelfde tabel; welke
      // het is, volgt uit de lijnen die eraan hangen. Een aanvraag met allebei
      // hoort in allebei de bundels, want er kijken twee mensen naar.
      ...(kind === 'flesserke'
        ? { flesserkeLines: { some: {} } }
        : { lines: { some: {} } }),
    },
    orderBy: { createdAt: 'asc' },
    take: 25,
    select: { id: true, pickupDate: true, status: true },
  });
  return rows.map((row) => ({ id: row.id, startsAt: row.pickupDate, cancelled: row.status === 'CANCELLED' }));
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

async function summaryFor(kind: NotifyKind, entry: PendingEntry): Promise<UitleenDigestEntry | null> {
  return kind === 'transport'
    ? transportSummary(entry.id, entry.cancelled)
    : reservationSummary(entry.id, entry.cancelled);
}

/** De samenvattingen van deze wachtrij, nieuw en geannuleerd apart. */
async function digestBodies(kind: NotifyKind, entries: PendingEntry[]) {
  const bodies = await Promise.all(
    entries.map(async (entry) => ({ entry, body: await summaryFor(kind, entry) }))
  );
  const present = bodies.filter(
    (row): row is { entry: PendingEntry; body: UitleenDigestEntry } => row.body !== null
  );
  return {
    requests: present.filter((row) => !row.entry.cancelled).map((row) => row.body),
    cancellations: present.filter((row) => row.entry.cancelled).map((row) => row.body),
  };
}

async function deliverDigest(
  kind: NotifyKind,
  to: string[],
  bodies: { requests: UitleenDigestEntry[]; cancellations: UitleenDigestEntry[] }
): Promise<boolean> {
  const mail = teamDigestMail({ kind, baseUrl: logistiekBaseUrl(), ...bodies });
  // Naar één adres met de rest in kopie: drie losse mails naar dezelfde mailbox
  // lezen als drie aanvragen.
  return deliver({ to: to[0], cc: to.slice(1), name: '', locale: 'nl' }, mail.subject, mail.text);
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

      const bodies = await digestBodies(kind, pending);
      const count = bodies.requests.length + bodies.cancellations.length;
      if (count === 0) continue;

      // Enkel afvinken wanneer het bericht écht vertrokken is. Mislukt het, dan
      // blijft de wachtrij staan en probeert de volgende tick het opnieuw; stil
      // stempelen zou de melding laten verdwijnen, en dat is erger dan een uur
      // later.
      if (!(await deliverDigest(kind, to, bodies))) continue;
      await markNotified(kind, pending.map((entry) => entry.id), now);
      next[kind] = now.toISOString();
      changed = true;
      sent[kind] = count;
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
    const bodies = await digestBodies(kind, [entry]);
    if (bodies.requests.length + bodies.cancellations.length === 0) return;

    // Geen adres ingesteld is een geldige keuze; dan is er niets te versturen en
    // wordt de rij toch afgevinkt, zodat ze niet in de bundel blijft hangen.
    if (to.length > 0 && !(await deliverDigest(kind, to, bodies))) return;
    await markNotified(kind, [id], new Date());
  } catch (err) {
    console.error('[uitleen-mail] dringende teammelding mislukt:', err);
  }
}

/** De samenvatting van een materiaal- of flesserke-aanvraag voor de teammelding. */
async function reservationSummary(id: string, cancelled: boolean): Promise<UitleenDigestEntry | null> {
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
      ...(cancelled ? cancelledFromSelect : {}),
    },
  });
  if (!reservation) return null;

  return reservationRequestSummary({
    id,
    requestName: reservation.eventName,
    requester: requesterLabel(reservation),
    userName: reservation.user.name,
    pickupDate: formatDateOnly(reservation.pickupDate),
    returnDate: formatDateOnly(reservation.returnDate),
    lines: [...reservation.lines, ...reservation.flesserkeLines].map((line) => ({
      quantity: line.quantity,
      name: line.itemName,
    })),
    delivery: reservation.delivery,
    memberNote: reservation.memberNote,
    baseUrl: logistiekBaseUrl(),
    cancelled: cancelled ? { wasApproved: wasApproved(reservation) } : undefined,
  });
}

/** Idem voor een rit; bij een heen-en-terugaanvraag staan beide ritten erin. */
async function transportSummary(id: string, cancelled: boolean): Promise<UitleenDigestEntry | null> {
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
      driver: { select: { name: true } },
      assignedGroup: { select: { nameNl: true } },
      helpers: { orderBy: { createdAt: 'asc' }, select: { name: true, phone: true } },
      ...(cancelled ? cancelledFromSelect : {}),
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

  return tripRequestSummary({
    id,
    title: tripTitle(booking),
    purpose: booking.purpose,
    eventName: tripEventName(booking),
    requester: requesterLabel(booking),
    userName: booking.user.name,
    legs: legs.map((leg) => ({
      start: formatDateTime(leg.startAt),
      end: formatDateTime(leg.endAt),
      vehicle: leg.vehicle.nameNl,
    })),
    cargoNote: booking.cargoNote,
    helpers: booking.helpers,
    pickupAddress: booking.pickupAddress,
    destination: booking.destination,
    memberNote: booking.memberNote,
    baseUrl: logistiekBaseUrl(),
    cancelled: cancelled
      ? {
          wasApproved: wasApproved(booking),
          driverName: booking.driver?.name ?? null,
          assignedGroupName: booking.assignedGroup?.nameNl ?? null,
        }
      : undefined,
  });
}

/** De laatste annulatie in de historiek: van welke status kwam ze? */
const cancelledFromSelect = {
  auditLogs: {
    where: { kind: 'STATUS_CHANGED' as const, toStatus: 'CANCELLED' },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { fromStatus: true },
  },
};

function wasApproved(row: { auditLogs?: Array<{ fromStatus: string | null }> }): boolean {
  return row.auditLogs?.[0]?.fromStatus === 'APPROVED';
}

// ---------------------------------------------------------------------------
// Annuleren door de aanvrager
// ---------------------------------------------------------------------------

/**
 * Verwittigt de chauffeurs van ritten die de aanvrager net annuleerde.
 *
 * Meteen en niet in de bundel: een chauffeur leest de teammelding niet, en hij
 * is degene die anders voor niets aan het logikot staat. Niet naar wie zelf
 * annuleerde (een chauffeur die zijn eigen aanvraag schrapt, weet het al).
 *
 * Aan te roepen ná de transactie; falen mag de annulatie niet ongedaan maken.
 */
export async function notifyDriversOfCancellation(bookingIds: string[], actorId: string): Promise<void> {
  try {
    if (bookingIds.length === 0) return;
    const bookings = await prisma.uitleenTransportBooking.findMany({
      where: { id: { in: bookingIds }, driverId: { not: null } },
      orderBy: { startAt: 'asc' },
      select: {
        driverId: true,
        purpose: true,
        eventName: true,
        startAt: true,
        endAt: true,
        pickupAddress: true,
        destination: true,
        cargoNote: true,
        vehicle: { select: { nameNl: true } },
        driver: {
          select: { name: true, email: true, personalEmail: true, emailPreference: true, locale: true },
        },
      },
    });
    for (const booking of bookings) {
      if (!booking.driver || booking.driverId === actorId) continue;
      const recipient = recipientOf(booking.driver, null);
      const mail = tripCancelledDriverMail({
        locale: recipient.locale,
        recipientName: recipient.name,
        trip: tripFacts(booking, recipient.locale),
        baseUrl: logistiekBaseUrl(),
      });
      await deliver(recipient, mail.subject, mail.text);
    }
  } catch (err) {
    console.error('[uitleen-mail] chauffeur verwittigen van een annulatie mislukt:', err);
  }
}
