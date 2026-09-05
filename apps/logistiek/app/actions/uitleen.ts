'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { canManage, externalRequestsBlocked, requireSession } from '@/lib/session';
import { getLocale } from '@/lib/i18n';
import { isEmailish, isOnQuarterHour, MAX_HELPERS, parseDateOnly, todayDateOnly } from '@/lib/uitleen';
import {
  availabilityForRange,
  getLogistiekSettings,
  isDriver,
  vanBookingForMember,
} from '@/lib/uitleen-server';
import {
  buildReservationData,
  parseBrusselsDateTime,
  MAX_NOTE_LENGTH,
  type ReservationFormInput,
} from '@/lib/reservation-form';
import { buildTransportBookings, type TransportFormInput } from '@/lib/transport-form';
import { expireOpenPayments, logistiekBaseUrl, paymentGateway } from '@/lib/payments';
import { runSerializable } from '@/lib/tx';
import {
  clipOutsideDay,
  hoursToRanges,
  isAvailabilityKind,
  mergeRanges,
  subtractRange,
  type AvailabilityKind,
} from '@/lib/availability-day';
import { startOfBrusselsDay } from '@/lib/week-lanes';
import { writeAudit } from '@/lib/audit';
import { notifyReservation, notifyTeamNewRequest, notifyTransport } from '@/lib/uitleen-mail';

/**
 * `code` is optioneel en enkel voor een fout waar de client iets méér mee doet
 * dan ze tonen: bij `OVERLAP` biedt het formulier een tweede knop aan om de
 * botsing toch door te duwen. De zin in `error` blijft de melding.
 */
export type ActionResult =
  | {
      ok: true;
      message?: string;
      /**
       * Gelukt, maar met een gevolg dat je niet mag missen (het voertuig staat nu
       * dubbel geboekt). De client laat zo'n melding staan tot ze weggeklikt
       * wordt, zoals een fout.
       */
      warning?: boolean;
    }
  | { ok: false; error: string; code?: string };
// `ReservationFormInput` NIET her-exporteren vanuit dit `'use server'`-bestand:
// Turbopack behandelt elke export van een use-server-module als een server action,
// en een her-geëxporteerde type-binding laat de build falen ("export doesn't exist
// in target module"). Consumers importeren het type rechtstreeks uit
// `@/lib/reservation-form`.

function revalidateMember() {
  revalidatePath('/reservaties');
  revalidatePath('/materiaal');
  revalidatePath('/vervoer');
}

type SessionLike = { user: { id: string; name: string }; groups: Array<{ id: string }> };

/**
 * De poort voor externen (S1): zolang `externalRequestsOpen` uitstaat, kan wie
 * bij geen enkele groep hoort niets indienen of wijzigen.
 *
 * Server-side en niet enkel in het formulier: de knop verbergen houdt niemand
 * tegen die de actie rechtstreeks aanroept, en het is precies deze poort die
 * bepaalt of Logistiek een aanvraag mist.
 *
 * Geeft de fout terug in plaats van te gooien: dit is een verwachte toestand,
 * geen serverfout, en de formulieren tonen `error` letterlijk aan het lid.
 * `createFlesserkeReservationAction` heeft dit niet nodig: die weigert een lid
 * zonder groep sowieso al.
 */
async function externalGate(session: SessionLike): Promise<ActionResult | null> {
  const settings = await getLogistiekSettings();
  if (!externalRequestsBlocked(session, settings)) return null;
  const en = (await getLocale()) === 'en';
  return {
    ok: false,
    error: en
      ? 'Requests from outside VTK are not open yet. Mail logistiek@vtk.be and Logistics will help you.'
      : 'Aanvragen van buiten VTK staan nog niet open. Mail logistiek@vtk.be, dan helpt Logistiek je verder.',
  };
}

/**
 * Leidt het aanvragertype automatisch af uit de gekozen groep in de login. Een
 * praesidiumpost wordt INTERN; een werkgroep behoudt het aparte WERKGROEP-type;
 * wie geen groep heeft vraagt EXTERN aan met de eigen naam.
 *
 * `requestsAsExternal` in lib/session.ts volgt dezelfde regel, maar dan vooraf:
 * wie extern aanvraagt, krijgt de evenementen en sjablonen niet te zien.
 */
async function deriveMemberRequester(
  session: SessionLike,
  chosenGroupId?: string
): Promise<{
  requesterType: 'INTERN' | 'WERKGROEP' | 'EXTERN';
  groupId: string | null;
  requesterName?: string;
}> {
  if (session.groups.length > 0) {
    const groupId = session.groups.some((g) => g.id === chosenGroupId)
      ? chosenGroupId!
      : session.groups[0].id;
    const group = await prisma.group.findFirst({
      where: { id: groupId },
      select: { type: true, nameNl: true },
    });
    if (!group) return { requesterType: 'EXTERN', groupId: null, requesterName: session.user.name };
    if (group.type === 'WERKGROEP') {
      return { requesterType: 'WERKGROEP', groupId: null, requesterName: group.nameNl };
    }
    return { requesterType: 'INTERN', groupId, requesterName: undefined };
  }
  return { requesterType: 'EXTERN', groupId: null, requesterName: session.user.name };
}

/**
 * Het evenement waaraan deze aanvraag hangt, of null.
 *
 * `eventId` is wat het lid koos; `createEvent` betekent "maak er een van met de
 * gegevens die ik net invulde", zodat de volgende aanvraag (het vervoer) eraan
 * kan hangen zonder op het team te wachten. Een onbekend id negeren we stil: dan
 * is het evenement intussen verwijderd, en de aanvraag zelf is belangrijker.
 */
async function resolveEventId(
  session: SessionLike,
  input: {
    eventId?: string | null;
    createEvent?: boolean;
    eventName?: string;
    eventLocation?: string;
    eventStart?: string;
  },
  groupId: string | null
): Promise<string | null> {
  const chosen = (input.eventId ?? '').trim();
  if (chosen) {
    const found = await prisma.uitleenEvent.findUnique({
      where: { id: chosen },
      select: { id: true },
    });
    return found?.id ?? null;
  }
  if (!input.createEvent) return null;

  const name = (input.eventName ?? '').trim();
  if (!name) return null;
  const created = await prisma.uitleenEvent.create({
    data: {
      name: name.slice(0, 200),
      location: (input.eventLocation ?? '').trim().slice(0, 300) || null,
      startAt: input.eventStart ? parseBrusselsDateTime(input.eventStart) : null,
      groupId,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  return created.id;
}

export async function createReservationAction(input: ReservationFormInput): Promise<ActionResult> {
  const session = await requireSession();
  const blocked = await externalGate(session);
  if (blocked) return blocked;
  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, flesserkeLines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  const eventId = await resolveEventId(session, input, built.scalars.groupId);
  const created = await prisma.uitleenReservation.create({
    data: {
      userId: session.user.id,
      ...built.scalars,
      eventId,
      lines: { create: built.lineCreates },
    },
    select: { id: true },
  });

  // Ná de write en zonder de aanvraag te kunnen doen falen (M1); wie een fout
  // ziet omdat de mailserver plat ligt, dient opnieuw in en dan staan er twee.
  await notifyTeamNewRequest('materiaal', created.id);

  revalidateMember();
  return { ok: true, message: 'Aanvraag ingediend. Je vindt de status bij Mijn aanvragen.' };
}

/** Een lid mag zijn eigen materiaalaanvraag bewerken zolang ze nog niet beslist is. */
export async function editReservationAction(
  reservationId: string,
  input: ReservationFormInput
): Promise<ActionResult> {
  const session = await requireSession();
  const blocked = await externalGate(session);
  if (blocked) return blocked;

  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, flesserkeLines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  // Statusguard en writes horen bij elkaar: een gelijktijdige goedkeuring mag
  // nooit gevolgd worden door een ongecontroleerde ledenedit.
  const outcome = await runSerializable(async (tx) => {
    const existing = await tx.uitleenReservation.findFirst({
      where: { id: reservationId, userId: session.user.id },
      select: { status: true },
    });
    if (!existing) return 'NOT_FOUND' as const;
    // Bewerken mag ook na goedkeuring (M2), maar dan valt de goedkeuring weg:
    // wie er een tafel bij zet, verandert wat het team beloofd heeft, en dat
    // moet opnieuw langs de voorraadcheck. Vanaf het afhalen is het te laat; dan
    // staat het materiaal al buiten.
    if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
      return 'LOCKED' as const;
    }
    const wasApproved = existing.status === 'APPROVED';
    await tx.uitleenReservationLine.deleteMany({ where: { reservationId } });
    await tx.uitleenReservation.update({
      where: { id: reservationId },
      data: {
        ...built.scalars,
        lines: { create: built.lineCreates },
        ...(wasApproved
          ? {
              status: 'REQUESTED' as const,
              // `decidedAt` blijft bewust staan: samen met de status REQUESTED is
              // dat het teken dat deze aanvraag al eens beslist was en nu opnieuw
              // in de wachtrij staat. Zo hoeft de aanvragenlijst daarvoor geen
              // historiek te bevragen. Bij de volgende goedkeuring wordt hij
              // gewoon overschreven.
              // De betaalwijze hoorde wel bij de vorige beslissing; het team
              // kiest ze opnieuw. Een al betaalde aanvraag komt hier niet: die is
              // niet bewerkbaar (zie `editable` op de detailpagina).
              paymentMode: null,
            }
          : {}),
      },
    });
    if (wasApproved) {
      await writeAudit(tx, { reservationId }, {
        kind: 'STATUS_CHANGED',
        fromStatus: 'APPROVED',
        toStatus: 'REQUESTED',
        note: 'Aangepast door de aanvrager; opnieuw te beslissen',
        actorId: session.user.id,
      });
    }
    return wasApproved ? ('REOPENED' as const) : ('OK' as const);
  });
  if (outcome === 'NOT_FOUND') return { ok: false, error: 'Reservatie niet gevonden.' };
  if (outcome === 'LOCKED') {
    return { ok: false, error: 'Deze aanvraag is al afgehaald; bewerken kan niet meer. Neem contact op met Logistiek.' };
  }

  revalidateMember();
  if (outcome === 'REOPENED') {
    // Buiten de transactie: een mail over een wijziging die door een rollback
    // niet doorging, is erger dan geen mail.
    await notifyReservation(
      reservationId,
      'EDITED',
      'De aanvraag is aangepast na de goedkeuring en moet opnieuw beslist worden.'
    );
    return {
      ok: true,
      message: 'Aanvraag bijgewerkt. Logistiek moet ze opnieuw goedkeuren.',
    };
  }
  return { ok: true, message: 'Aanvraag bijgewerkt.' };
}

function revalidateFlesserke() {
  revalidatePath('/reservaties');
  revalidatePath('/flesserke');
}

/**
 * Flesserke-aanvraag: aparte reservatie met enkel flesserke-lijnen. Voor de
 * interne werking, dus elk lid van een post, werkgroep of jaarwerking
 * (`FLESSERKE_REQUESTER_TYPES`); externen kunnen dit niet aanvragen.
 */
export async function createFlesserkeReservationAction(input: ReservationFormInput): Promise<ActionResult> {
  const session = await requireSession();
  if (session.groups.length === 0) {
    return { ok: false, error: 'Flesserke is enkel voor de interne werking van VTK.' };
  }
  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, lines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  const eventId = await resolveEventId(session, input, built.scalars.groupId);
  const created = await prisma.uitleenReservation.create({
    data: {
      userId: session.user.id,
      ...built.scalars,
      eventId,
      flesserkeLines: { create: built.flesserkeLineCreates },
    },
    select: { id: true },
  });

  await notifyTeamNewRequest('flesserke', created.id);

  revalidateFlesserke();
  return { ok: true, message: 'Flesserke-aanvraag ingediend. Je krijgt bericht zodra Logistiek beslist.' };
}

export async function editFlesserkeReservationAction(
  reservationId: string,
  input: ReservationFormInput
): Promise<ActionResult> {
  const session = await requireSession();
  if (session.groups.length === 0) {
    return { ok: false, error: 'Flesserke is enkel voor de interne werking van VTK.' };
  }

  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const built = await buildReservationData(
    { ...input, ...requester, lines: [] },
    session.groups.map((g) => g.id)
  );
  if (!built.ok) return built;

  const outcome = await runSerializable(async (tx) => {
    const existing = await tx.uitleenReservation.findFirst({
      where: { id: reservationId, userId: session.user.id },
      select: { status: true },
    });
    if (!existing) return 'NOT_FOUND' as const;
    if (existing.status !== 'REQUESTED') return 'LOCKED' as const;
    await tx.uitleenFlesserkeLine.deleteMany({ where: { reservationId } });
    await tx.uitleenReservation.update({
      where: { id: reservationId },
      data: { ...built.scalars, flesserkeLines: { create: built.flesserkeLineCreates } },
    });
    return 'OK' as const;
  });
  if (outcome === 'NOT_FOUND') return { ok: false, error: 'Aanvraag niet gevonden.' };
  if (outcome === 'LOCKED') {
    return { ok: false, error: 'Deze aanvraag is al beslist; bewerken kan niet meer.' };
  }

  revalidateFlesserke();
  return { ok: true, message: 'Flesserke-aanvraag bijgewerkt.' };
}

/**
 * Een sjabloon maken van wat er nu in het aanvraagformulier staat (M5).
 *
 * Elk lid mag dit, niet enkel Logistiek: de posten vroegen er zelf om, en het
 * oude argument (na één jaar dertig varianten van "cantus") gaat over de
 * keuzelijst en niet over wie mag aanmaken. De rem zit dan ook in de UI en niet
 * in de rechten: "Nieuw sjabloon" staat onderaan de keuzelijst met de bestaande
 * sjablonen, zodat je er eerst langs moet.
 *
 * De post is een label, geen filter: iedereen ziet elk sjabloon (zie
 * `requestTemplates`). Hij komt uit de groep waarnamens je aanvraagt, en enkel
 * als je daar echt bij hoort.
 */
export async function createTemplateFromSelectionAction(input: {
  name: string;
  description?: string;
  groupId?: string | null;
  lines: Array<{ itemId: string; quantity: number }>;
}): Promise<ActionResult> {
  const session = await requireSession();

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Geef het sjabloon een naam.' };

  // Twee keer hetzelfde item in één sjabloon botst op de unieke index; optellen
  // geeft een nette lijst in plaats van een databasefout.
  const totals = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) continue;
    totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + line.quantity);
  }
  if (totals.size === 0) {
    return { ok: false, error: 'Kies eerst materiaal; een leeg sjabloon heeft geen nut.' };
  }

  // Enkel bestaand, actief materiaal: een sjabloon dat naar een verwijderd item
  // wijst, zou bij elk gebruik stilzwijgend een lijn overslaan.
  const items = await prisma.uitleenItem.findMany({
    where: { id: { in: [...totals.keys()] }, active: true },
    select: { id: true },
  });
  const known = new Set(items.map((item) => item.id));
  const lines = [...totals.entries()].filter(([itemId]) => known.has(itemId));
  if (lines.length === 0) {
    return { ok: false, error: 'Geen van de gekozen items staat nog in de catalogus.' };
  }

  const groupId =
    input.groupId && session.groups.some((group) => group.id === input.groupId)
      ? input.groupId
      : null;

  const existing = await prisma.uitleenRequestTemplate.findFirst({
    where: { name, active: true },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: `Er bestaat al een sjabloon met de naam "${name}". Kies een andere naam, of gebruik het bestaande.`,
    };
  }

  await prisma.uitleenRequestTemplate.create({
    data: {
      name: name.slice(0, 120),
      description: (input.description ?? '').trim().slice(0, 300) || null,
      groupId,
      createdById: session.user.id,
      lines: { create: lines.map(([itemId, quantity]) => ({ itemId, quantity })) },
    },
  });

  revalidatePath('/materiaal');
  revalidatePath('/beheer/sjablonen');
  return { ok: true, message: `Sjabloon "${name}" bewaard. Iedereen kan het nu kiezen.` };
}

/**
 * De basisgegevens van je eigen evenement bijwerken (E1).
 *
 * Wat de aanvrager mag wijzigen, is wat hij zelf het best weet: waar het
 * doorgaat, wanneer het begint en eindigt, en hoeveel volk er komt. De nota
 * blijft van het team ("materiaal blijft staan tot maandag") en de naam blijft
 * staan, want daar hangen de aanvragen met hun eigen momentopname aan.
 *
 * Enkel voor een evenement van je eigen post of werkgroep, of een dat je zelf
 * aanmaakte; dezelfde grens als `memberEvents`.
 */
export async function saveMemberEventAction(input: {
  eventId: string;
  location: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  expectedAttendance: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const groupIds = session.groups.map((group) => group.id);

  const event = await prisma.uitleenEvent.findFirst({
    where: {
      id: input.eventId,
      OR: [
        ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
        { createdById: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (!event) return { ok: false, error: 'Dit evenement is niet van jou.' };

  const startAt = input.startDate
    ? parseBrusselsDateTime(`${input.startDate}T${input.startTime || '00:00'}`)
    : null;
  if (input.startDate && !startAt) return { ok: false, error: 'De startdag is ongeldig.' };
  const endAt = input.endDate
    ? parseBrusselsDateTime(`${input.endDate}T${input.endTime || '23:59'}`)
    : null;
  if (input.endDate && !endAt) return { ok: false, error: 'De einddag is ongeldig.' };
  if (startAt && endAt && endAt < startAt) {
    return { ok: false, error: 'Het einde ligt voor het begin.' };
  }

  const attendanceRaw = input.expectedAttendance.trim();
  const attendance = attendanceRaw ? Number(attendanceRaw) : null;
  if (attendance !== null && (!Number.isInteger(attendance) || attendance < 0)) {
    return { ok: false, error: 'De verwachte opkomst moet een getal zijn.' };
  }

  await prisma.uitleenEvent.update({
    where: { id: event.id },
    data: {
      location: input.location.trim().slice(0, 300) || null,
      startAt,
      startTimeKnown: Boolean(input.startDate && input.startTime),
      endAt,
      expectedAttendance: attendance,
    },
  });

  revalidatePath('/evenementen');
  revalidatePath(`/evenementen/${event.id}`);
  revalidatePath('/beheer/evenementen');
  return { ok: true, message: 'Evenement bijgewerkt.' };
}

/**
 * Materiaal noteren dat niet van Logistiek komt (E5): het theokot, de
 * vicepraeses, iemands eigen boxen.
 *
 * Puur informatief, zonder voorraad. Het staat er zodat de materiaallijst die de
 * dag zelf meegaat compleet is; stond de helft in een spreadsheet, dan gaat er
 * mis met precies dat deel dat niemand kon nalezen.
 */
export async function addEventExtraItemAction(input: {
  eventId: string;
  source: string;
  itemName: string;
  quantity: string;
  note?: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const groupIds = session.groups.map((group) => group.id);

  const event = await prisma.uitleenEvent.findFirst({
    where: {
      id: input.eventId,
      OR: [
        ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
        { createdById: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (!event) return { ok: false, error: 'Dit evenement is niet van jou.' };

  const itemName = input.itemName.trim();
  const source = input.source.trim();
  if (!itemName) return { ok: false, error: 'Geef aan over welk materiaal het gaat.' };
  if (!source) return { ok: false, error: 'Geef aan waar het vandaan komt.' };
  const quantity = Number(input.quantity.trim() || '1');
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'Het aantal moet een getal groter dan nul zijn.' };
  }

  await prisma.uitleenEventExtraItem.create({
    data: {
      eventId: event.id,
      source: source.slice(0, 120),
      itemName: itemName.slice(0, 200),
      quantity,
      note: (input.note ?? '').trim().slice(0, 300) || null,
      createdById: session.user.id,
    },
  });

  revalidatePath(`/evenementen/${event.id}`);
  revalidatePath('/beheer/evenementen');
  return { ok: true, message: 'Toegevoegd aan de materiaallijst.' };
}

/** Zo'n genoteerd stuk materiaal weer weghalen (E5). */
export async function removeEventExtraItemAction(itemId: string): Promise<ActionResult> {
  const session = await requireSession();
  const groupIds = session.groups.map((group) => group.id);

  const item = await prisma.uitleenEventExtraItem.findFirst({
    where: {
      id: itemId,
      event: {
        OR: [
          ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
          { createdById: session.user.id },
        ],
      },
    },
    select: { id: true, eventId: true },
  });
  if (!item) return { ok: false, error: 'Dit item is niet van jou.' };

  await prisma.uitleenEventExtraItem.delete({ where: { id: item.id } });
  revalidatePath(`/evenementen/${item.eventId}`);
  revalidatePath('/beheer/evenementen');
  return { ok: true, message: 'Van de lijst gehaald.' };
}

/**
 * Onthouden dat de aanvrager deze aanvraag gezien heeft (R5).
 *
 * Loopt vanuit de detailpagina, niet vanuit een server component: een
 * paginabezoek mag niets wegschrijven, en een GET die een kolom aanpast is
 * precies wat een prefetch of een crawler ongewild kan doen.
 *
 * Alleen de aanvrager zelf: een collega uit dezelfde post die meekijkt, mag het
 * merkteken niet voor hem wegnemen.
 */
export async function markReservationSeenAction(reservationId: string): Promise<void> {
  const session = await requireSession();
  await prisma.uitleenReservation.updateMany({
    where: { id: reservationId, userId: session.user.id },
    data: { requesterSeenAt: new Date() },
  });
  revalidatePath('/reservaties');
}

/** Zie {@link markReservationSeenAction}, maar dan voor een rit. */
export async function markVanBookingSeenAction(bookingId: string): Promise<void> {
  const session = await requireSession();
  await prisma.uitleenTransportBooking.updateMany({
    where: { id: bookingId, userId: session.user.id },
    data: { requesterSeenAt: new Date() },
  });
  revalidatePath('/reservaties');
}

export async function cancelReservationAction(reservationId: string): Promise<ActionResult> {
  const session = await requireSession();

  const reservation = await prisma.uitleenReservation.findFirst({
    where: { id: reservationId, userId: session.user.id },
    include: { payments: true },
  });
  if (!reservation) return { ok: false, error: 'Reservatie niet gevonden.' };
  if (reservation.status !== 'REQUESTED' && reservation.status !== 'APPROVED') {
    return { ok: false, error: 'Deze reservatie kan je niet meer annuleren.' };
  }
  if (reservation.payments.length > 0) {
    if (!reservation.payments.some((payment) => payment.status === 'SUCCEEDED')) {
      const expired = await expireOpenPayments(reservation.payments);
      if (!expired.ok) return { ok: false, error: expired.error };
    }
  }
  if (reservation.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return {
      ok: false,
      error: 'Deze reservatie is al betaald; mail logistiek@vtk.be om ze te annuleren.',
    };
  }

  const cancelled = await prisma.uitleenReservation.updateMany({
    where: {
      id: reservation.id,
      userId: session.user.id,
      status: { in: ['REQUESTED', 'APPROVED'] },
      payments: { none: { status: 'SUCCEEDED' } },
    },
    data: { status: 'CANCELLED' },
  });
  if (cancelled.count === 0) {
    return { ok: false, error: 'Deze reservatie kan niet meer veilig geannuleerd worden.' };
  }

  revalidateMember();
  return { ok: true, message: 'Reservatie geannuleerd.' };
}

/** Live beschikbaarheid voor de gekozen periode (zachte indicatie in de catalogus). */
export async function checkAvailabilityAction(input: {
  pickupDate: string;
  returnDate: string;
}): Promise<{ ok: true; availability: Array<{ itemId: string; available: number }> } | { ok: false }> {
  await requireSession();
  const pickupDate = parseDateOnly(input.pickupDate);
  const returnDate = parseDateOnly(input.returnDate);
  if (!pickupDate || !returnDate || returnDate < pickupDate) return { ok: false };
  return { ok: true, availability: await availabilityForRange(pickupDate, returnDate) };
}

export async function createVanBookingAction(input: TransportFormInput & {
  /** Koepel-evenement (A8), of `createEvent` om er een te maken van `eventName`. */
  eventId?: string | null;
  createEvent?: boolean;
  /** Post of werkgroep waarvoor de rit dient; leeg = de eerste van het lid. */
  groupId?: string | null;
}): Promise<ActionResult> {
  const session = await requireSession();
  const blocked = await externalGate(session);
  if (blocked) return blocked;

  // Zoals bij een materiaalaanvraag: de rit hangt aan de post waarvoor ze dient.
  // Dat stond hier niet, waardoor elke rit van een lid als "Interne post" zonder
  // naam in het beheer stond en de post ze onderling niet kon zien.
  const requester = await deriveMemberRequester(session, input.groupId ?? undefined);
  const eventId = await resolveEventId(session, { ...input, eventStart: undefined }, requester.groupId);
  const built = await buildTransportBookings(input, {
    userId: session.user.id,
    eventId,
    requesterType: requester.requesterType,
    groupId: requester.groupId,
    requesterName: requester.requesterName ?? null,
  });
  if (!built.ok) return { ok: false, error: built.error };

  const created = await prisma.uitleenTransportBooking.createManyAndReturn({
    data: built.bookings,
    select: { id: true },
  });

  // Bijrijders per boeking (V2). `createMany` kan geen geneste rijen schrijven,
  // en heen en terug krijgen dezelfde rijen: daarna leiden ze hun eigen leven,
  // want op de terugrit kan iemand anders meerijden.
  if (built.helpers.length > 0) {
    await prisma.uitleenTransportHelper.createMany({
      data: created.flatMap((booking) =>
        built.helpers.map((helper) => ({
          transportBookingId: booking.id,
          name: helper.name,
          phone: helper.phone,
          addedById: session.user.id,
        }))
      ),
    });
  }

  // Eén melding per aanvraag en niet per boeking: heen en terug (of twee
  // voertuigen) zijn samen één vraag, en de mail toont ze allebei.
  if (created[0]) await notifyTeamNewRequest('transport', created[0].id);

  revalidateMember();
  const what =
    built.vehicleCount > 1
      ? `${built.vehicleCount} voertuigen aangevraagd`
      : built.roundTrip
        ? 'Heen- en terugrit aangevraagd'
        : 'Rit aangevraagd';
  return { ok: true, message: `${what}. Je vindt de status bij Mijn aanvragen.` };
}

/**
 * Je eigen rit aanpassen, ook nadat ze goedgekeurd is (T5, T13).
 *
 * Wat je mag wijzigen, is wat je zelf het best weet: de uren, waarvoor de rit
 * dient en waar ze heen gaat. Het voertuig en de chauffeur blijven van het team;
 * die hangen aan de planning van de hele week.
 *
 * Was ze goedgekeurd, dan valt die goedkeuring weg. De botsingscontrole gebeurt
 * bij het goedkeuren, dus verschoven uren zonder nieuwe beslissing zouden twee
 * ritten op hetzelfde moment kunnen zetten. Vanaf het afronden kan er niets meer
 * aan: die rit is gereden.
 */
export async function editVanBookingAction(
  bookingId: string,
  input: {
    startAt: string;
    endAt: string;
    purpose: string;
    destination: string;
    pickupAddress: string;
  }
): Promise<ActionResult> {
  const session = await requireSession();
  const blocked = await externalGate(session);
  if (blocked) return blocked;

  const purpose = input.purpose.trim();
  if (!purpose) return { ok: false, error: 'Beschrijf waarvoor je het voertuig nodig hebt.' };

  const startAt = parseBrusselsDateTime(input.startAt);
  const endAt = parseBrusselsDateTime(input.endAt);
  if (!startAt || !endAt) return { ok: false, error: 'Vul een geldig begin- en einduur in.' };
  if (endAt <= startAt) return { ok: false, error: 'Het einduur ligt voor het beginuur.' };
  if (!isOnQuarterHour(startAt) || !isOnQuarterHour(endAt)) {
    return { ok: false, error: 'Kies uren op het kwartier (bv. 14:00, 14:15).' };
  }

  const outcome = await runSerializable(async (tx) => {
    const existing = await tx.uitleenTransportBooking.findFirst({
      where: { id: bookingId, userId: session.user.id },
      select: { status: true },
    });
    if (!existing) return 'NOT_FOUND' as const;
    if (existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
      return 'LOCKED' as const;
    }
    const wasApproved = existing.status === 'APPROVED';
    await tx.uitleenTransportBooking.update({
      where: { id: bookingId },
      data: {
        startAt,
        endAt,
        purpose: purpose.slice(0, 300),
        destination: input.destination.trim().slice(0, 300) || null,
        pickupAddress: input.pickupAddress.trim().slice(0, 300) || null,
        ...(wasApproved
          ? {
              // Zie `editReservationAction`: `decidedAt` blijft staan als teken
              // dat deze rit al eens beslist was.
              status: 'REQUESTED' as const,
              paymentMode: null,
            }
          : {}),
      },
    });
    await writeAudit(tx, { transportBookingId: bookingId }, {
      kind: wasApproved ? 'STATUS_CHANGED' : 'EDITED',
      fromStatus: wasApproved ? 'APPROVED' : null,
      toStatus: wasApproved ? 'REQUESTED' : null,
      note: wasApproved
        ? 'Aangepast door de aanvrager; opnieuw te beslissen'
        : 'Aangepast door de aanvrager',
      actorId: session.user.id,
    });
    return wasApproved ? ('REOPENED' as const) : ('OK' as const);
  });

  if (outcome === 'NOT_FOUND') return { ok: false, error: 'Rit niet gevonden.' };
  if (outcome === 'LOCKED') {
    return { ok: false, error: 'Deze rit is afgerond of geannuleerd; aanpassen kan niet meer.' };
  }

  revalidateMember();
  revalidatePath('/beheer/vervoer');
  revalidatePath('/beheer/vervoer/week');
  if (outcome === 'REOPENED') {
    await notifyTransport(
      [bookingId],
      'EDITED',
      'De rit is aangepast na de goedkeuring en moet opnieuw beslist worden.'
    );
    return { ok: true, message: 'Rit bijgewerkt. Logistiek moet ze opnieuw goedkeuren.' };
  }
  return { ok: true, message: 'Rit bijgewerkt.' };
}

export async function cancelVanBookingAction(bookingId: string): Promise<ActionResult> {
  const session = await requireSession();

  const booking = await prisma.uitleenTransportBooking.findFirst({
    where: { id: bookingId, userId: session.user.id },
    include: { payments: true },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  if (booking.status !== 'REQUESTED' && booking.status !== 'APPROVED') {
    return { ok: false, error: 'Deze rit kan je niet meer annuleren.' };
  }
  if (booking.payments.length > 0 && !booking.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    const expired = await expireOpenPayments(booking.payments);
    if (!expired.ok) return { ok: false, error: expired.error };
  }
  if (booking.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return { ok: false, error: 'Deze rit is al betaald; mail logistiek@vtk.be om ze te annuleren.' };
  }

  // Een heen-en-terugaanvraag annuleer je in haar geheel: enkel de heenrit
  // annuleren laat een terugrit staan die niemand meer gaat rijden.
  const cancelled = await prisma.uitleenTransportBooking.updateMany({
    where: {
      ...(booking.tripGroupId ? { tripGroupId: booking.tripGroupId } : { id: booking.id }),
      userId: session.user.id,
      status: { in: ['REQUESTED', 'APPROVED'] },
      payments: { none: { status: 'SUCCEEDED' } },
    },
    data: { status: 'CANCELLED' },
  });
  if (cancelled.count === 0) {
    return { ok: false, error: 'Deze rit kan niet meer veilig geannuleerd worden.' };
  }

  revalidateMember();
  return {
    ok: true,
    message: cancelled.count > 1 ? 'Heen- en terugrit geannuleerd.' : 'Rit geannuleerd.',
  };
}

// ---------------------------------------------------------------------------
// Online betalen
// ---------------------------------------------------------------------------

export type StartPaymentResult = { ok: true; url: string } | { ok: false; error: string };

const CHECKOUT_MINUTES = 30;

/**
 * Start een online betaling voor een goedgekeurde reservatie of rit en geeft de
 * checkout-URL van de provider terug; de client stuurt de browser erheen.
 * Enkel de huurprijs wordt online betaald; de waarborg blijft cash bij afhaling.
 */
export async function startPaymentAction(
  target: 'reservation' | 'van',
  id: string
): Promise<StartPaymentResult> {
  const session = await requireSession();

  const record =
    target === 'reservation'
      ? await prisma.uitleenReservation.findFirst({
          where: { id, userId: session.user.id },
          include: { payments: true },
        })
      : await prisma.uitleenTransportBooking.findFirst({
          where: { id, userId: session.user.id },
          include: { payments: true },
        });

  if (!record) return { ok: false, error: 'Niet gevonden.' };
  const payableStatus =
    record.status === 'APPROVED' ||
    (target === 'van' && record.status === 'COMPLETED');
  if (!payableStatus) {
    return { ok: false, error: 'Betalen kan pas nadat de aanvraag goedgekeurd is.' };
  }
  if (record.paymentMode !== 'ONLINE') {
    return { ok: false, error: 'Deze reservatie betaal je ter plaatse, niet online.' };
  }
  if (record.paidOfflineAt || record.payments.some((payment) => payment.status === 'SUCCEEDED')) {
    return { ok: false, error: 'Al betaald.' };
  }
  const amountCents =
    target === 'reservation'
      ? (record as { totalPriceCents: number }).totalPriceCents
      : (record as { priceCents: number }).priceCents;
  if (amountCents <= 0) return { ok: false, error: 'Er valt niets online te betalen.' };

  // Een nog lopende checkout hergebruiken we in plaats van er een tweede te starten.
  const pending = record.payments.find(
    (payment) =>
      (payment.status === 'CREATED' || payment.status === 'PENDING') &&
      (!payment.expiresAt || payment.expiresAt > new Date())
  );
  if (pending?.checkoutUrl) return { ok: true, url: pending.checkoutUrl };
  if (pending) {
    return { ok: false, error: 'Je betaling wordt klaargezet. Probeer over enkele seconden opnieuw.' };
  }

  const gateway = paymentGateway();
  const attempt = record.payments.length + 1;
  const idempotencyKey = `${target === 'reservation' ? 'res' : 'van'}:${record.id}:${attempt}`;
  const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60 * 1000);
  const base = logistiekBaseUrl();
  const detailPath = target === 'reservation' ? `/reservaties/${record.id}` : `/vervoer/${record.id}`;

  let payment;
  try {
    payment = await prisma.uitleenPayment.create({
      data: {
        reservationId: target === 'reservation' ? record.id : null,
        transportBookingId: target === 'van' ? record.id : null,
        provider: gateway.name,
        idempotencyKey,
        amountCents,
        expiresAt,
      },
    });
  } catch (error) {
    // Twee gelijktijdige klikken gebruiken dezelfde attempt/idempotency key. De
    // winnaar maakt de checkout; de andere request maakt nooit een tweede aan.
    const concurrent = await prisma.uitleenPayment.findUnique({
      where: { provider_idempotencyKey: { provider: gateway.name, idempotencyKey } },
    });
    if (concurrent?.checkoutUrl) return { ok: true, url: concurrent.checkoutUrl };
    if (concurrent) {
      return { ok: false, error: 'Je betaling wordt klaargezet. Probeer over enkele seconden opnieuw.' };
    }
    throw error;
  }

  try {
    const checkout = await gateway.createCheckout({
      orderId: record.id,
      orderNumber: record.id.slice(-8).toUpperCase(),
      buyerEmail: session.user.email,
      eventName: target === 'reservation' ? 'VTK uitleendienst' : 'VTK transport',
      currency: 'EUR',
      lines: [
        {
          name: target === 'reservation' ? 'Huur materiaal' : 'Transport',
          quantity: 1,
          unitAmountCents: amountCents,
        },
      ],
      expiresAt,
      successUrl: `${base}${detailPath}?betaling=1`,
      cancelUrl: `${base}${detailPath}`,
      attempt,
    });

    await prisma.uitleenPayment.update({
      where: { id: payment.id },
      data: {
        providerCheckoutId: checkout.checkoutId,
        providerPaymentId: checkout.paymentId ?? null,
        checkoutUrl: checkout.url,
        status: checkout.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING',
        succeededAt: checkout.status === 'SUCCEEDED' ? new Date() : null,
      },
    });

    return { ok: true, url: checkout.url };
  } catch {
    await prisma.uitleenPayment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failedAt: new Date() },
    });
    return { ok: false, error: 'De betaalprovider is niet bereikbaar. Probeer straks opnieuw.' };
  }
}

// ---------------------------------------------------------------------------
// Beschikbaarheid van chauffeurs (V1)
// ---------------------------------------------------------------------------

/**
 * Een venster waarin je kan rijden toevoegen.
 *
 * Hier en niet in `app/actions/beheer.ts`: een chauffeur heeft geen
 * `logistiek.manage` (zie `UitleenDriver` in de schema-comment), en zijn eigen
 * beschikbaarheid ingeven is precies wat hij zonder beheerrechten moet kunnen.
 * Dezelfde `isDriver()`-hercheck als `approveTransportAction` gebruikt.
 *
 * Overlappende vensters worden samengevoegd: twee keer "zaterdagvoormiddag"
 * intekenen hoort geen twee banden op te leveren die je apart moet weghalen.
 */
export async function addAvailabilityAction(input: {
  startAt: string;
  endAt: string;
  note?: string;
  /** Beschikbaar, liever niet of enkel in noodgeval; standaard beschikbaar. */
  kind?: AvailabilityKind;
}): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await isDriver(session.user.id))) {
    return { ok: false, error: 'Je staat niet in de chauffeurslijst.' };
  }

  const startAt = parseBrusselsDateTime(input.startAt);
  const endAt = parseBrusselsDateTime(input.endAt);
  if (!startAt || !endAt) return { ok: false, error: 'Kies een begin- en eindmoment.' };
  if (endAt <= startAt) return { ok: false, error: 'Het einde ligt voor het begin.' };
  if (!isOnQuarterHour(startAt) || !isOnQuarterHour(endAt)) {
    return { ok: false, error: 'Kies uren op het kwartier (bv. 14:00, 14:15).' };
  }
  const kind: AvailabilityKind = isAvailabilityKind(input.kind) ? input.kind : 'JA';

  const note = (input.note ?? '').trim().slice(0, 300) || null;

  await runSerializable(async (tx) => {
    // Alles wat dit venster raakt. `lte`/`gte` en niet `lt`/`gt`: twee vensters
    // die op elkaar aansluiten (12:00-14:00 en 14:00-18:00) zijn één blok van 12
    // tot 18, en als twee banden naast elkaar zien ze eruit als een gaatje dat
    // er niet is.
    const touching = await tx.uitleenDriverAvailability.findMany({
      where: { userId: session.user.id, startAt: { lte: endAt }, endAt: { gte: startAt } },
      select: { id: true, startAt: true, endAt: true, note: true, kind: true },
    });
    // Dezelfde soort gaat erin op; een andere soort maakt plaats. Zonder dat
    // tweede zou hetzelfde uur tegelijk "beschikbaar" en "enkel in noodgeval"
    // zeggen, en dan is er geen antwoord meer.
    const same = touching.filter((row) => row.kind === kind);
    const others = touching.filter((row) => row.kind !== kind);

    const from = same.reduce((earliest, row) => (row.startAt < earliest ? row.startAt : earliest), startAt);
    const to = same.reduce((latest, row) => (row.endAt > latest ? row.endAt : latest), endAt);
    // De nota van het nieuwe venster wint; die van de oude blijft staan wanneer
    // het nieuwe er geen heeft, zodat "enkel met de auto" niet stil verdwijnt.
    const keptNote = note ?? same.find((row) => row.note)?.note ?? null;

    if (touching.length > 0) {
      await tx.uitleenDriverAvailability.deleteMany({
        where: { id: { in: touching.map((row) => row.id) } },
      });
    }
    await tx.uitleenDriverAvailability.create({
      data: { userId: session.user.id, startAt: from, endAt: to, kind, note: keptNote },
    });
    // Wat er van de andere soorten buiten dit venster lag, komt terug.
    const remainder = others.flatMap((row) =>
      subtractRange({ startAt: row.startAt, endAt: row.endAt, kind: row.kind }, from, to)
    );
    if (remainder.length > 0) {
      await tx.uitleenDriverAvailability.createMany({
        data: remainder.map((range) => ({
          userId: session.user.id,
          startAt: range.startAt,
          endAt: range.endAt,
          kind: range.kind,
        })),
      });
    }
  });

  revalidatePath('/ritten/beschikbaarheid');
  revalidatePath('/beheer/vervoer/week');
  return { ok: true, message: 'Beschikbaarheid opgeslagen.' };
}

/**
 * De beschikbaarheid van één dag in één keer herschrijven (V1, mobiel).
 *
 * Het intekenrooster op een telefoon werkt per uurvakje: je veegt over de uren
 * dat je kan, en veegt er nog eens over om ze weg te halen. Dat is geen "voeg
 * toe" en geen "haal weg" maar "zo ziet die dag er nu uit", en daar hoort één
 * actie bij. Met alleen `add` en `remove` erbovenop zou een halve dag wissen
 * neerkomen op een venster weghalen en er twee terugzetten, met drie
 * roundtrips en een half opgeslagen dag als er eentje faalt.
 *
 * De dagranden zijn Belgisch, en vensters die over middernacht lopen worden
 * gesplitst: één dag herschrijven mag de dagen ernaast niet stil wegvegen. Zie
 * `lib/availability-day.ts`, waar dat rekenwerk puur en getest staat.
 */
export async function setAvailabilityDayAction(input: {
  /** De dag, als `YYYY-MM-DD` in Belgische tijd. */
  day: string;
  /** De uren die aan staan (0 tot en met 23), met hun soort. */
  hours: Array<{ hour: number; kind: AvailabilityKind }>;
}): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await isDriver(session.user.id))) {
    return { ok: false, error: 'Je staat niet in de chauffeurslijst.' };
  }

  const day = parseDateOnly(input.day);
  if (!day) return { ok: false, error: 'Die dag begrijp ik niet.' };
  const dayStart = new Date(startOfBrusselsDay(day));
  const dayEnd = new Date(startOfBrusselsDay(new Date(day.getTime() + 24 * 60 * 60 * 1000)));

  // Rommel eruit filteren en niet weigeren: dit komt van een raster waarop je
  // veegt, niet van een formulier waarin je typt.
  const hours = Array.isArray(input.hours)
    ? input.hours.filter((cell) => Number.isInteger(cell?.hour) && isAvailabilityKind(cell?.kind))
    : [];

  await runSerializable(async (tx) => {
    const touching = await tx.uitleenDriverAvailability.findMany({
      where: { userId: session.user.id, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
      select: { id: true, startAt: true, endAt: true, kind: true },
    });

    if (touching.length > 0) {
      await tx.uitleenDriverAvailability.deleteMany({
        where: { id: { in: touching.map((row) => row.id) } },
      });
    }

    // Wat er buiten deze dag lag, komt terug; wat erbinnen lag, wordt vervangen
    // door wat er nu aangeduid staat.
    const keep = touching.flatMap((row) => clipOutsideDay(row, dayStart, dayEnd));
    const ranges = mergeRanges([...keep, ...hoursToRanges(hours, dayStart)]);

    if (ranges.length > 0) {
      await tx.uitleenDriverAvailability.createMany({
        data: ranges.map((range) => ({
          userId: session.user.id,
          startAt: range.startAt,
          endAt: range.endAt,
          kind: range.kind,
        })),
      });
    }
  });

  revalidatePath('/ritten/beschikbaarheid');
  revalidatePath('/beheer/vervoer/week');
  return { ok: true, message: 'Beschikbaarheid opgeslagen.' };
}

/** Een venster weghalen. Enkel je eigen; het team beheert dit niet voor je. */
export async function removeAvailabilityAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const deleted = await prisma.uitleenDriverAvailability.deleteMany({
    where: { id, userId: session.user.id },
  });
  if (deleted.count === 0) return { ok: false, error: 'Dit venster bestaat niet (meer).' };

  revalidatePath('/ritten/beschikbaarheid');
  revalidatePath('/beheer/vervoer/week');
  return { ok: true, message: 'Venster weggehaald.' };
}

// ---------------------------------------------------------------------------
// Bijrijders (V2)
// ---------------------------------------------------------------------------

/**
 * Wie er mag rommelen aan de bijrijders van een rit.
 *
 * De aanvrager, én een collega van dezelfde post of werkgroep. Dat tweede is de
 * hele reden dat dit bestaat: iemand van Sport vraagt de rit aan, en de twee die
 * effectief meerijden zijn pas de dag voordien bekend, vaak bij iemand anders.
 * `vanBookingForMember` bepaalt al wie de rit mag zíén; dit is dezelfde regel,
 * maar dan om te schrijven.
 *
 * Het team kan het ook, via `logistiek.manage`: de chauffeur belt hen wanneer er
 * onderweg iets verandert.
 */
async function canEditHelpers(
  session: SessionLike & { user: { id: string } },
  bookingId: string,
  isTeam: boolean
): Promise<boolean> {
  if (isTeam) return true;
  const booking = await vanBookingForMember(
    bookingId,
    session.user.id,
    session.groups.map((group) => group.id)
  );
  return booking !== null;
}

export async function addTripHelperAction(
  bookingId: string,
  input: { name: string; phone?: string }
): Promise<ActionResult> {
  const session = await requireSession();

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Vul de naam van de bijrijder in.' };

  if (!(await canEditHelpers(session, bookingId, canManage(session)))) {
    return { ok: false, error: 'Je kan deze rit niet aanpassen.' };
  }

  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id: bookingId },
    select: { status: true, _count: { select: { helpers: true } } },
  });
  if (!booking) return { ok: false, error: 'Rit niet gevonden.' };
  // Een gereden of afgewezen rit is geschiedenis; wie er toen meereed, verandert
  // achteraf niet meer.
  if (booking.status !== 'REQUESTED' && booking.status !== 'APPROVED') {
    return { ok: false, error: 'Deze rit is afgerond of geannuleerd.' };
  }
  if (booking._count.helpers >= MAX_HELPERS) {
    return { ok: false, error: `Er passen er maximaal ${MAX_HELPERS} op een rit.` };
  }

  await prisma.uitleenTransportHelper.create({
    data: {
      transportBookingId: bookingId,
      name: name.slice(0, 120),
      phone: input.phone?.trim().slice(0, 60) || null,
      addedById: session.user.id,
    },
  });

  revalidateMember();
  revalidatePath('/ritten');
  revalidatePath('/beheer/vervoer');
  revalidatePath('/beheer/vervoer/week');
  return { ok: true, message: 'Bijrijder toegevoegd.' };
}

export async function removeTripHelperAction(helperId: string): Promise<ActionResult> {
  const session = await requireSession();

  const helper = await prisma.uitleenTransportHelper.findUnique({
    where: { id: helperId },
    select: { transportBookingId: true },
  });
  if (!helper) return { ok: false, error: 'Deze bijrijder staat er niet (meer).' };
  if (!(await canEditHelpers(session, helper.transportBookingId, canManage(session)))) {
    return { ok: false, error: 'Je kan deze rit niet aanpassen.' };
  }

  await prisma.uitleenTransportHelper.delete({ where: { id: helperId } });

  revalidateMember();
  revalidatePath('/ritten');
  revalidatePath('/beheer/vervoer');
  revalidatePath('/beheer/vervoer/week');
  return { ok: true, message: 'Bijrijder weggehaald.' };
}
