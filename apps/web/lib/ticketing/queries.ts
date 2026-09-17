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
  ticketTypeIsHidden,
  ticketTypeNeedsMembership,
  ticketTypeRequiresLogin,
} from "./audience";
import { getTicketEventAccess } from "./authorization";
import {
  isInPresaleNow,
  viewerSalesStart,
  viewerTypeSalesStart,
  type PresaleViewer,
} from "./presale";
import { presaleViewerFor } from "./presaleViewer";
import { userIsMember } from "@/lib/membership";

type PublicLocale = "nl" | "en";

const publicEventInclude = {
  ownerGroup: true,
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
  event: true,
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
 * Is de ingelogde bezoeker erelid? Een DB-lezing, want `SessionPayload` draagt
 * permissies en rollen, geen ledenstatus, en dat uitbreiden zou elke
 * sessielezing op de hele site duurder maken voor iets wat enkel de ticketshop
 * nodig heeft.
 */
async function viewerIsHonorary(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { honoraryMember: true },
  });
  return user?.honoraryMember ?? false;
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
    description: localized(event.descriptionNl ?? "", event.descriptionEn, locale),
    location: event.location,
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
      available: Math.max(
        0,
        type.inventoryPool.capacity -
          type.inventoryPool.reservedCount -
          type.inventoryPool.soldCount
      ),
      active: type.active,
      audience: type.audience,
      minPerOrder: type.minPerOrder,
      maxPerOrder: type.maxPerOrder,
      // Presale-bewust, net als het eventvenster hierboven: een eigen start
      // die samenvalt met de publieke verkoopstart houdt de voorverkoop niet
      // tegen (zie `viewerTypeSalesStart`).
      salesStart: viewerTypeSalesStart(event, type, viewer),
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

export async function listPublishedTicketEvents(locale: PublicLocale) {
  const now = new Date();
  const [events, session] = await Promise.all([
    prisma.ticketEvent.findMany({
      where: {
        status: "PUBLISHED",
        endsAt: { gte: now },
        AND: [
          {
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
  const [isHonorary, isMember, viewer] = await Promise.all([
    viewerIsHonorary(session?.user.id),
    userIsMember(session?.user.id),
    presaleViewerFor(session, events),
  ]);
  return events.flatMap((event) => {
    const dto = publicEventDto(event, locale, viewer);
    if (dto.salesStart && new Date(dto.salesStart) > now) return [];
    const selectableTypes = dto.ticketTypes.filter(
      (type) =>
        ticketTypeIsOnSale(type, now) &&
        type.available >= (type.minPerOrder ?? 1) &&
        !ticketTypeIsHidden(type, isHonorary)
    );
    const ticketTypes = selectableTypes.filter(
      (type) =>
        (Boolean(session) || !ticketTypeRequiresLogin(type)) &&
        !ticketTypeNeedsMembership(type, isMember)
    );
    return [{
      ...dto,
      ticketTypes,
      requiresLogin:
        !session &&
        ticketTypes.length === 0 &&
        selectableTypes.some(ticketTypeRequiresLogin),
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

  const session = await getSession(await headers());
  const [isHonorary, isMember, viewer] = await Promise.all([
    viewerIsHonorary(session?.user.id),
    userIsMember(session?.user.id),
    presaleViewerFor(session, [event]),
  ]);
  const dto = publicEventDto(event, locale, viewer);
  const visibleTypes = dto.ticketTypes.filter((type) => !ticketTypeIsHidden(type, isHonorary));
  const ticketTypes = visibleTypes.filter(
    (type) =>
      (Boolean(session) || !ticketTypeRequiresLogin(type)) &&
      !ticketTypeNeedsMembership(type, isMember)
  );
  return {
    ...dto,
    ticketTypes,
    requiresLogin:
      !session &&
      ticketTypes.length === 0 &&
      visibleTypes.some(ticketTypeRequiresLogin),
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
      confirmationMessage: order.locale === "EN"
        ? order.event.confirmationMessageEn || order.event.confirmationMessageNl
        : order.event.confirmationMessageNl,
    },
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
