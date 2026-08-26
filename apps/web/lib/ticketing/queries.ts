import "server-only";

import type { Prisma } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { getSession } from "@vtk/auth/server";
import { prisma } from "@vtk/db";
import { createTicketCredential, secureTokenHash, verifyOrderAccessToken } from "./crypto";
import { orderAccessCookieName } from "./access";
import { isAppleWalletAvailable, isGoogleWalletAvailable } from "./wallet";
import { ticketTermsPath } from "./terms";

type PublicLocale = "nl" | "en";

const publicEventInclude = {
  ownerGroup: true,
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

function ticketTypeRequiresLogin(type: { audience: string; priceCents: number }): boolean {
  return type.audience === "MEMBERS" || type.priceCents === 0;
}

/**
 * Een ticketsoort voor ereleden bestaat voor iedereen anders niet.
 *
 * Bewust wegfilteren en niet uitgrijzen: wat de kring aan haar ereleden geeft
 * (gratis naar een cantus, bijvoorbeeld) hoort geen zichtbare uitzondering te
 * zijn waar de rest van de site zich vragen bij stelt. Wie geen erelid is, ziet
 * gewoon het gewone aanbod, en `createOrder` weigert zo'n type ook serverside.
 */
function ticketTypeIsHidden(type: { audience: string }, isHonorary: boolean): boolean {
  return type.audience === "HONORARY" && !isHonorary;
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

function publicEventDto(event: PublicEventRecord, locale: PublicLocale) {
  return {
    id: event.id,
    slug: event.slug,
    title: localized(event.titleNl, event.titleEn, locale),
    description: localized(event.descriptionNl ?? "", event.descriptionEn, locale),
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    currentTime: new Date().toISOString(),
    salesStart: event.salesStartAt,
    salesEnd: event.salesEndAt,
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
      salesStart: type.salesStartAt,
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
          { OR: [{ salesStartAt: null }, { salesStartAt: { lte: now } }] },
          { OR: [{ salesEndAt: null }, { salesEndAt: { gt: now } }] },
        ],
      },
      include: publicEventInclude,
      orderBy: { startsAt: "asc" },
    }),
    getSession(await headers()),
  ]);
  const isHonorary = await viewerIsHonorary(session?.user.id);
  return events.map((event) => {
    const dto = publicEventDto(event, locale);
    const selectableTypes = dto.ticketTypes.filter(
      (type) =>
        ticketTypeIsOnSale(type, now) &&
        type.available >= (type.minPerOrder ?? 1) &&
        !ticketTypeIsHidden(type, isHonorary)
    );
    const ticketTypes = selectableTypes.filter(
      (type) => Boolean(session) || !ticketTypeRequiresLogin(type)
    );
    return {
      ...dto,
      ticketTypes,
      requiresLogin:
        !session &&
        ticketTypes.length === 0 &&
        selectableTypes.some(ticketTypeRequiresLogin),
    };
  });
}

export async function getPublishedTicketEventBySlug(slug: string, locale: PublicLocale = "nl") {
  const event = await prisma.ticketEvent.findUnique({
    where: { slug },
    include: publicEventInclude,
  });
  if (!event || event.status !== "PUBLISHED") return null;

  const session = await getSession(await headers());
  const isHonorary = await viewerIsHonorary(session?.user.id);
  const dto = publicEventDto(event, locale);
  const visibleTypes = dto.ticketTypes.filter((type) => !ticketTypeIsHidden(type, isHonorary));
  const ticketTypes = visibleTypes.filter(
    (type) => Boolean(session) || !ticketTypeRequiresLogin(type)
  );
  return {
    ...dto,
    ticketTypes,
    requiresLogin:
      !session &&
      ticketTypes.length === 0 &&
      visibleTypes.some(ticketTypeRequiresLogin),
    viewer: session
      ? { id: session.user.id, name: session.user.name, email: session.user.email }
      : null,
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
