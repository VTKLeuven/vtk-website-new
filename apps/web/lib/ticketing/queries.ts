import "server-only";

import type { Prisma } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { getSession } from "@vtk/auth/server";
import { prisma } from "@vtk/db";
import { createTicketCredential, secureTokenHash, verifyOrderAccessToken } from "./crypto";
import { orderAccessCookieName } from "./access";
import { isAppleWalletAvailable, isGoogleWalletAvailable } from "./wallet";
import { ticketTermsPath } from "./terms";
import {
  isTargetAudience,
  ticketTypeIsHidden,
  ticketTypeMemberPrice,
  ticketTypeNeedsMembership,
  ticketTypeRequiresLogin,
  type TicketTargetAudience,
} from "./audience";
import { ticketViewerProfile } from "./viewerProfile";
import { getTicketEventAccess } from "./authorization";
import {
  isInPresaleNow,
  nonMemberTypeSalesStart,
  viewerSalesStart,
  viewerTypeSalesStart,
  type PresaleViewer,
} from "./presale";
import { presaleViewerFor } from "./presaleViewer";
import { hasPrivateTicketAccess } from "./privateLink";
import { ticketPoster, ticketPosterSelect } from "./poster";
import { userIsMember } from "@/lib/membership";
import { poolRemaining, type PoolRemaining, type SeatKind } from "./seats";

type PublicLocale = "nl" | "en";

const publicEventInclude = {
  ownerGroup: true,
  // Voor de banner: een themabanner of het gekoppelde kalender-event, wanneer
  // het ticketevent geen eigen foto heeft. Zie lib/ticketing/poster.ts.
  imageCategory: ticketPosterSelect.imageCategory,
  calendarEvent: ticketPosterSelect.calendarEvent,
  presaleGroups: { select: { groupId: true } },
  questions: { where: { active: true }, orderBy: { sortOrder: "asc" } },
  ticketTypes: {
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { inventoryPool: true },
  },
} satisfies Prisma.TicketEventInclude;

type PublicEventRecord = Prisma.TicketEventGetPayload<{
  include: typeof publicEventInclude;
}>;

const orderInclude = {
  // Dezelfde banner als in de shop (lib/ticketing/poster.ts). De bestelpagina
  // toont ze bij het event in het bestelpaneel.
  event: {
    include: {
      imageCategory: ticketPosterSelect.imageCategory,
      calendarEvent: ticketPosterSelect.calendarEvent,
    },
  },
  items: { include: { ticket: true } },
} satisfies Prisma.TicketOrderInclude;

type OrderRecord = Prisma.TicketOrderGetPayload<{ include: typeof orderInclude }>;
type OrderItemRecord = OrderRecord["items"][number];
type IssuedOrderItem = OrderItemRecord & { ticket: NonNullable<OrderItemRecord["ticket"]> };

function localized(nl: string, en: string | null | undefined, locale: PublicLocale): string {
  return locale === "en" && en ? en : nl;
}

function isIssued(item: OrderItemRecord): item is IssuedOrderItem {
  return item.ticket !== null;
}

/**
 * De doelgroepen waarvoor dit event een ticket heeft dat een uitgelogde
 * bezoeker niet ziet. Enkel voor wie niet ingelogd is: een ingelogd lid dat er
 * niet bij hoort, hoort er ook na inloggen niet bij. Ereleden staan hier bewust
 * niet tussen; dat ticket bestaat voor de rest van de site niet.
 */
function audienceLoginHint(
  types: { audience: string }[],
  signedIn: boolean,
): TicketTargetAudience[] {
  if (signedIn) return [];
  return [...new Set(types.map((type) => type.audience).filter(isTargetAudience))];
}

function ticketTypeIsOnSale(
  type: { salesStart?: Date | string | null; salesEnd?: Date | string | null },
  now: Date
): boolean {
  return (
    (!type.salesStart || new Date(type.salesStart) <= now) &&
    (!type.salesEnd || new Date(type.salesEnd) > now)
  );
}

/**
 * @param viewer de sessie, om de verkoopstart te tonen zoals **deze** bezoeker
 * ze ervaart: wie in de voorverkoop mag, ziet ze vroeger. De rest van de shop
 * rekent gewoon met `salesStart` en hoeft van de voorverkoop niets te weten.
 */
function publicEventDto(
  event: PublicEventRecord,
  locale: PublicLocale,
  viewer?: PresaleViewer
) {
  return {
    id: event.id,
    slug: event.slug,
    title: localized(event.titleNl, event.titleEn, locale),
    // Staat deze verkoop op de eventpagina, dan toont /tickets/<slug> die
    // pagina; zie lib/ticketing/eventPage.ts.
    calendarEventId: event.calendarEventId,
    onEventPage: event.onEventPage,
    // Enkel de vlag, nooit het token: alles in deze dto kan in de HTML belanden.
    isPrivate: event.isPrivate,
    label: localized(event.labelNl ?? "", event.labelEn, locale) || null,
    ownTimes: event.ownTimes,
    description: localized(event.descriptionNl ?? "", event.descriptionEn, locale),
    location: event.location,
    locationAddress: event.locationAddress,
    poster: ticketPoster(event),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    currentTime: new Date().toISOString(),
    salesStart: viewerSalesStart(event, viewer),
    salesEnd: event.salesEndAt,
    // Enkel om het te kunnen zeggen tegen wie nu vroeger mag kopen; voor de rest
    // staat er niets over de voorverkoop op de pagina.
    presale: isInPresaleNow(event, viewer)
      ? { publicStart: event.salesStartAt as Date }
      : null,
    status: event.status,
    maxTicketsPerOrder: event.maxTicketsPerOrder,
    currency: event.currency,
    contactEmail: event.contactEmail,
    termsUrl: ticketTermsPath(locale),
    ownerGroupName: localized(event.ownerGroup.nameNl, event.ownerGroup.nameEn, locale),
    ticketTypes: event.ticketTypes.map((type) => ({
      id: type.id,
      inventoryPoolId: type.inventoryPoolId,
      name: localized(type.nameNl, type.nameEn, locale),
      description: localized(type.descriptionNl ?? "", type.descriptionEn, locale),
      priceCents: type.unitPriceCents,
      // Ongefilterd: wie geen lid is, verliest deze prijs in `forViewer`.
      memberPriceCents: ticketTypeMemberPrice(type),
      // Idem: enkel een erelid dat het zijne nog niet gebruikte, houdt dit.
      honoraryPriceCents: type.honoraryPriceCents,
      // Wat de gewone prijs nog kan nemen, gerekend als niet-ledenplaats;
      // `forViewer` stelt dat bij voor een lid. Een uitgeschakelde pot verkoopt
      // niets meer, ook al staan er nog plaatsen open.
      ...seatAvailability(type.inventoryPool),
      active: type.active,
      audience: type.audience,
      minPerOrder: type.minPerOrder,
      maxPerOrder: type.maxPerOrder,
      // Presale-bewust, net als het eventvenster hierboven: een eigen start
      // die samenvalt met de publieke verkoopstart houdt de voorverkoop niet
      // tegen (zie `viewerTypeSalesStart`).
      salesStart: viewerTypeSalesStart(event, type, viewer),
      // De niet-ledenplaatsen, eventueel later dan de leden. Ook presale-bewust:
      // wie in de voorverkoop zit, wacht niet (zie `nonMemberTypeSalesStart`).
      nonMemberSalesStart: nonMemberTypeSalesStart(event, type, viewer),
      salesEnd: type.salesEndAt,
      questions: event.questions
        .filter((question) => question.ticketTypeId == null || question.ticketTypeId === type.id)
        .map((question) => ({
          id: question.id,
          code: question.code,
          label: localized(question.labelNl, question.labelEn, locale),
          description: localized(question.descriptionNl ?? "", question.descriptionEn, locale),
          type: question.type,
          required: question.required,
          options: Array.isArray(question.options)
            ? question.options.filter((option): option is string => typeof option === "string")
            : [],
        })),
    })),
  };
}

/**
 * Wat er in een pot nog vrij is, zoals de shop het nodig heeft: per regel en
 * voor de pot als geheel (zie `lib/ticketing/seats.ts`). Standaard gerekend
 * voor een niet-lid; `forViewer` zet het om voor een lid.
 */
function seatAvailability(pool: PublicEventRecord["ticketTypes"][number]["inventoryPool"]) {
  const remaining: PoolRemaining = pool.active
    ? poolRemaining(pool)
    : { total: 0, member: 0, nonMember: 0 };
  return {
    available: remaining.nonMember,
    memberAvailable: remaining.member as number | null,
    poolAvailable: remaining.total,
    seat: "NON_MEMBER" as SeatKind,
  };
}

type PublicTicketTypeDto = ReturnType<typeof publicEventDto>["ticketTypes"][number];

/**
 * De tickets zoals deze bezoeker ze ziet.
 *
 * De ledenprijs bestaat enkel voor een lid. Een niet-lid krijgt het ticket aan
 * de gewone prijs, en hoort de lagere prijs ook niet in de paginabron terug te
 * vinden.
 *
 * En wat er nog over is, hangt af van wie koopt: een lid dat een ticket zonder
 * ledenprijs koopt, neemt een ledenplaats (`isMemberSeat`), dus voor hem telt
 * het ledenplafond en niet dat van de niet-leden.
 */
function forViewer(
  types: PublicTicketTypeDto[],
  isMember: boolean,
  /** Een erelid dat zijn erelidticket voor dit event nog niet gebruikte. */
  honorary: boolean,
): PublicTicketTypeDto[] {
  const viewerTypes = isMember
    ? types.map((type) =>
        type.memberPriceCents === null
          ? { ...type, available: regularAvailable(type, true), seat: "MEMBER" as SeatKind }
          : type
      )
    : types.map((type) => ({ ...type, memberPriceCents: null }));
  return viewerTypes.map((type) => {
    const honoraryPriceCents = honorary ? type.honoraryPriceCents : null;
    return {
      ...type,
      honoraryPriceCents,
      // De ledenplaatsen blijven nodig voor het erelidticket, ook bij een
      // niet-lid: dat neemt een ledenplaats.
      memberAvailable: isMember || honoraryPriceCents !== null ? type.memberAvailable : null,
    };
  });
}

/**
 * Heeft dit erelid zijn erelidticket voor dit event al? Dezelfde telling als
 * de checkout (`createTicketCheckout`): een vervallen of terugbetaald ticket telt
 * niet meer.
 */
async function honoraryPriceUsed(eventId: string, userId: string): Promise<boolean> {
  const used = await prisma.ticketOrderItem.count({
    where: {
      eventId,
      honoraryPrice: true,
      order: { buyerUserId: userId, status: { in: ["PENDING_PAYMENT", "PAID", "PARTIALLY_REFUNDED"] } },
      OR: [{ ticket: null }, { ticket: { status: { not: "REFUNDED" } } }],
    },
  });
  return used > 0;
}

/**
 * Kan deze bezoeker van dit type nu iets kopen? De start voor niet-leden geldt
 * voor wie enkel een niet-ledenplaats kan nemen; een lid of een erelid met een
 * ereledenprijs heeft een regel die met de leden opengaat.
 */
function onSaleForViewer(
  type: PublicTicketTypeDto,
  now: Date,
  takesMemberSeat: boolean,
): boolean {
  return ticketTypeIsOnSale(
    { salesStart: takesMemberSeat ? type.salesStart : type.nonMemberSalesStart, salesEnd: type.salesEnd },
    now,
  );
}

/** Wat de gewone prijs van een type nog kan nemen voor deze bezoeker. */
function regularAvailable(type: PublicTicketTypeDto, isMember: boolean): number {
  return isMember && type.memberPriceCents === null
    ? (type.memberAvailable ?? type.available)
    : type.available;
}

/**
 * Wat een bezoeker die de ledenprijs niet ziet, moet doen om ze wel te zien:
 * inloggen (misschien is hij al lid) of lid worden. Null wanneer er niets te
 * winnen valt.
 */
function memberPriceHint(
  types: PublicTicketTypeDto[],
  signedIn: boolean,
  isMember: boolean,
): "login" | "join" | null {
  if (isMember || !types.some((type) => type.memberPriceCents !== null)) return null;
  return signedIn ? "join" : "login";
}

/**
 * Het vroegste moment dat nog moet komen, of null wanneer er één al voorbij is
 * of ontbreekt: dan kan er nu al iets gekocht worden.
 */
function earliestFuture(moments: (Date | string | null | undefined)[], now: Date): Date | null {
  let earliest: Date | null = null;
  for (const moment of moments) {
    if (!moment) return null;
    const date = new Date(moment);
    if (date <= now) return null;
    if (!earliest || date < earliest) earliest = date;
  }
  return earliest;
}

/**
 * De events die nu te koop staan, zoals de app ze toont: enkel wat je nu kan
 * kiezen. Het overzicht op de website gebruikt `overview: true` (zie daar).
 */
export async function listPublishedTicketEvents(
  locale: PublicLocale,
  options: {
    /**
     * Voor /tickets: ook events waarvan de verkoop nog moet openen (met
     * `salesOpensAt`), en per event alle tickettypes die nog verkocht worden,
     * ook uitverkochte en die met een latere eigen start, zodat de kaart de
     * prijzen kan tonen. Niet voor de app: die lijst belooft dat je nu kan kopen.
     */
    overview?: boolean;
  } = {},
) {
  const now = new Date();
  const overview = options.overview ?? false;
  const [events, session] = await Promise.all([
    prisma.ticketEvent.findMany({
      where: {
        status: "PUBLISHED",
        // Een privéverkoop staat in geen enkele lijst, ook niet voor wie de
        // link al volgde: dit overzicht is wat de hele kring ziet.
        isPrivate: false,
        endsAt: { gte: now },
        AND: [
          overview
            ? {}
            : {
                OR: [
                  { salesStartAt: null },
                  { salesStartAt: { lte: now } },
                  // Een event met voorverkoop kan al open staan voor wie erin mag,
                  // en hoe vroeg valt hier niet te vergelijken: `salesStartAt` min
                  // een duur is geen kolom. Daarom hier ruim ophalen en verderop
                  // per bezoeker filteren op `salesStart` uit de dto.
                  { presaleLeadMinutes: { not: null } },
                ],
              },
          { OR: [{ salesEndAt: null }, { salesEndAt: { gt: now } }] },
        ],
      },
      include: publicEventInclude,
      orderBy: { startsAt: "asc" },
    }),
    getSession(await headers()),
  ]);
  const [profile, isMember, viewer] = await Promise.all([
    ticketViewerProfile(session?.user.id),
    userIsMember(session?.user.id),
    presaleViewerFor(session, events),
  ]);
  return events.flatMap((event) => {
    const dto = publicEventDto(event, locale, viewer);
    const opensLater = Boolean(dto.salesStart && new Date(dto.salesStart) > now);
    if (opensLater && !overview) return [];
    const takesMemberSeat = (type: PublicTicketTypeDto) =>
      isMember || (profile.honorary && type.honoraryPriceCents !== null);
    const windowTypes = dto.ticketTypes.filter((type) =>
      overview
        ? !type.salesEnd || new Date(type.salesEnd) > now
        : onSaleForViewer(type, now, takesMemberSeat(type)) &&
          regularAvailable(type, isMember) >= (type.minPerOrder ?? 1)
    );
    const selectableTypes = windowTypes.filter((type) => !ticketTypeIsHidden(type, profile));
    const loginHint = audienceLoginHint(
      windowTypes.filter((type) => ticketTypeIsHidden(type, profile)),
      Boolean(session),
    );
    const ticketTypes = selectableTypes.filter(
      (type) =>
        (Boolean(session) || !ticketTypeRequiresLogin(type)) &&
        !ticketTypeNeedsMembership(type, isMember)
    );
    // De verkoop van het event kan al lopen terwijl er voor deze bezoeker nog
    // niets te koop is: een niet-lid wiens plaatsen op de leden wachten
    // (`nonMemberDelayMinutes`), of tickets die elk later starten. Dan zegt de
    // kaart wanneer het voor hem opent, en niet "Te koop".
    const typesOpenAt =
      !opensLater && ticketTypes.length > 0
        ? earliestFuture(
            ticketTypes.map((type) =>
              takesMemberSeat(type) ? type.salesStart : type.nonMemberSalesStart
            ),
            now,
          )
        : null;
    return [{
      ...dto,
      ticketTypes: forViewer(ticketTypes, isMember, profile.honorary),
      salesOpensAt: opensLater ? dto.salesStart : typesOpenAt,
      memberPriceHint: memberPriceHint(ticketTypes, Boolean(session), isMember),
      requiresLogin:
        !session &&
        ticketTypes.length === 0 &&
        (selectableTypes.some(ticketTypeRequiresLogin) || loginHint.length > 0),
      audienceLoginHint: loginHint,
      requiresMembership:
        Boolean(session) &&
        ticketTypes.length === 0 &&
        selectableTypes.some((type) => ticketTypeNeedsMembership(type, isMember)),
    }];
  });
}

export async function getPublishedTicketEventBySlug(slug: string, locale: PublicLocale = "nl") {
  const event = await prisma.ticketEvent.findUnique({
    where: { slug },
    include: publicEventInclude,
  });
  if (!event || event.status !== "PUBLISHED") return null;
  // Een privé-event zonder de link is voor deze bezoeker onbestaand: dezelfde
  // 404 als een verkeerde slug, zodat de pagina niet verraadt dat het bestaat.
  if (!(await hasPrivateTicketAccess(event))) return null;

  const session = await getSession(await headers());
  const [profile, isMember, viewer] = await Promise.all([
    ticketViewerProfile(session?.user.id),
    userIsMember(session?.user.id),
    presaleViewerFor(session, [event]),
  ]);
  const dto = publicEventDto(event, locale, viewer);
  const visibleTypes = dto.ticketTypes.filter((type) => !ticketTypeIsHidden(type, profile));
  const loginHint = audienceLoginHint(
    dto.ticketTypes.filter((type) => ticketTypeIsHidden(type, profile)),
    Boolean(session),
  );
  const ticketTypes = visibleTypes.filter(
    (type) =>
      (Boolean(session) || !ticketTypeRequiresLogin(type)) &&
      !ticketTypeNeedsMembership(type, isMember)
  );
  const honoraryUsed =
    session && profile.honorary && ticketTypes.some((type) => type.honoraryPriceCents !== null)
      ? await honoraryPriceUsed(event.id, session.user.id)
      : false;
  return {
    ...dto,
    ticketTypes: forViewer(ticketTypes, isMember, profile.honorary && !honoraryUsed),
    // Enkel om het te kunnen zeggen; voor wie geen erelid is, altijd false.
    honoraryPriceUsed: honoraryUsed,
    memberPriceHint: memberPriceHint(ticketTypes, Boolean(session), isMember),
    requiresLogin:
      !session &&
      ticketTypes.length === 0 &&
      (visibleTypes.some(ticketTypeRequiresLogin) || loginHint.length > 0),
    audienceLoginHint: loginHint,
    requiresMembership:
      Boolean(session) &&
      ticketTypes.length === 0 &&
      visibleTypes.some((type) => ticketTypeNeedsMembership(type, isMember)),
    viewer: session
      ? { id: session.user.id, name: session.user.name, email: session.user.email }
      : null,
  };
}

/**
 * Hetzelfde event als de publieke pagina, maar voor wie het beheert.
 *
 * Bestaat om een concept te kunnen nakijken voor je publiceert: de shop zelf
 * kan niets verkopen zolang het event niet PUBLISHED is (`lib/ticketing/orders`
 * bewaakt dat serverside), dus dit opent geen verkoopweg.
 *
 * Er wordt hier bewust niets weggefilterd: een tickettype dat enkel voor leden
 * of ereleden zichtbaar is, hoort in een voorbeeld net wél te tonen, anders kan
 * de organisator precies dat type niet nakijken. De voorbeeldbalk op de pagina
 * zegt dat erbij.
 */
export async function getTicketEventPreviewBySlug(slug: string, locale: PublicLocale = "nl") {
  const event = await prisma.ticketEvent.findUnique({
    where: { slug },
    include: publicEventInclude,
  });
  if (!event) return null;

  const access = await getTicketEventAccess(event.id);
  if (!access?.capabilities.includes("VIEW_EVENT")) return null;
  const { session } = access;

  return {
    ...publicEventDto(event, locale, session),
    requiresLogin: false,
    audienceLoginHint: [] as TicketTargetAudience[],
    viewer: { id: session.user.id, name: session.user.name, email: session.user.email },
  };
}

export async function getOrderForViewer(orderId: string) {
  const [session, cookieStore] = await Promise.all([getSession(await headers()), cookies()]);
  const order = await prisma.ticketOrder.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!order) return null;

  const access = cookieStore.get(orderAccessCookieName(order.id))?.value;
  const validAccess = Boolean(
    access &&
      order.accessExpiresAt > new Date() &&
      secureTokenHash(access) === order.accessTokenHash &&
      verifyOrderAccessToken(access, order.id)
  );
  const ownsOrder = session?.user.id === order.buyerUserId;
  if (!validAccess && !ownsOrder && !session?.user.isSuperAdmin) return null;

  return orderDto(order, session?.user.id === order.buyerUserId);
}

/**
 * De bestelregels: per tickettype en prijs één regel met een aantal erbij.
 *
 * Bewust uit `items` en niet uit de uitgegeven tickets: een bestelling die nog
 * op betaling wacht, heeft nog geen tickets maar wel al regels, en juist daar
 * wil de koper zien wat hij besteld heeft. Eén item is één ticket, dus het
 * aantal is gewoon het aantal items van dezelfde soort aan dezelfde prijs (de
 * ledenprijs en de gewone prijs van hetzelfde type blijven zo uit elkaar).
 */
function orderLines(items: OrderItemRecord[]) {
  const lines = new Map<
    string,
    { key: string; name: string; quantity: number; unitPriceCents: number; totalCents: number }
  >();
  for (const item of items) {
    const key = `${item.ticketTypeId}:${item.unitPriceCents}`;
    const line = lines.get(key);
    if (line) {
      line.quantity += 1;
      line.totalCents += item.totalCents;
    } else {
      lines.set(key, {
        key,
        name: item.ticketTypeName,
        quantity: 1,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
      });
    }
  }
  return [...lines.values()];
}

function orderDto(order: OrderRecord, authenticatedOwner: boolean) {
  return {
    id: order.id,
    orderNumber: order.reference,
    status: order.status,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    totalCents: order.totalCents,
    refundedCents: order.refundedCents,
    currency: order.currency,
    reservationExpiresAt: order.reservationExpiresAt,
    authenticatedOwner,
    event: {
      id: order.event.id,
      slug: order.event.slug,
      title: order.locale === "EN" && order.event.titleEn ? order.event.titleEn : order.event.titleNl,
      startsAt: order.event.startsAt,
      location: order.event.location,
      poster: ticketPoster(order.event),
      confirmationMessage: order.locale === "EN"
        ? order.event.confirmationMessageEn || order.event.confirmationMessageNl
        : order.event.confirmationMessageNl,
    },
    lines: orderLines(order.items),
    tickets: order.items.filter(isIssued).map((item) => ({
      id: item.ticket.id,
      publicId: item.ticket.publicCode,
      status: item.ticket.status,
      attendeeName: item.attendeeName,
      attendeeEmail: item.attendeeEmail,
      typeName: item.ticketTypeName,
      unitPriceCents: item.unitPriceCents,
      checkedInAt: item.ticket.checkedInAt,
      credential: createTicketCredential(item.ticket.publicCode, item.ticket.credentialVersion),
      pdfUrl: `/api/tickets/${item.ticket.id}/pdf`,
      walletAppleUrl: isAppleWalletAvailable() ? `/api/tickets/${item.ticket.id}/wallet/apple` : null,
      walletGoogleUrl: isGoogleWalletAvailable() ? `/api/tickets/${item.ticket.id}/wallet/google` : null,
    })),
  };
}

export async function listTicketsForCurrentUser() {
  const session = await getSession(await headers());
  if (!session) return [];
  const orders = await prisma.ticketOrder.findMany({
    where: {
      buyerUserId: session.user.id,
      status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] },
    },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
  });
  return orders.map((order) => orderDto(order, true));
}
