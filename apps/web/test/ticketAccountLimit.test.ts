import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  ticketEventFindUnique: vi.fn(),
  ticketOrderCount: vi.fn(),
  ticketOrderCreate: vi.fn(),
  ticketOrderItemCount: vi.fn(),
  ticketAuditLogCreate: vi.fn(),
  userIsMember: vi.fn(),
  viewerProfile: vi.fn(),
  presaleViewerFor: vi.fn(),
  hasPrivateTicketAccess: vi.fn(),
  reserveInventory: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    ticketEvent: { findUnique: mocks.ticketEventFindUnique },
    ticketOrder: { count: mocks.ticketOrderCount, create: mocks.ticketOrderCreate },
    ticketOrderItem: { count: mocks.ticketOrderItemCount },
    ticketAuditLog: { create: mocks.ticketAuditLogCreate },
    ticketPayment: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@vtk/auth/server", () => ({
  getSession: mocks.getSession,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("@/lib/membership", () => ({
  userIsMember: mocks.userIsMember,
}));

vi.mock("@/lib/ticketing/viewerProfile", () => ({
  ticketViewerProfile: mocks.viewerProfile,
}));

vi.mock("@/lib/ticketing/presaleViewer", () => ({
  presaleViewerFor: mocks.presaleViewerFor,
}));

vi.mock("@/lib/ticketing/privateLink", () => ({
  hasPrivateTicketAccess: mocks.hasPrivateTicketAccess,
}));

vi.mock("@/lib/ticketing/terms", () => ({
  getTicketTerms: async () => ({ version: "2026-01", url: "/tickets/voorwaarden" }),
  ticketTermsPath: () => "/tickets/voorwaarden",
}));

vi.mock("@/lib/ticketing/config", () => ({
  enabledPaymentMethods: () => ["mock"],
  reservationMinutes: () => 30,
  ticketingBaseUrl: () => "https://vtk.be",
  ticketTokenSecret: () => "test-secret",
}));

vi.mock("@/lib/ticketing/transactions", () => ({
  isTransientDatabaseError: () => false,
  withOrderLock: vi.fn(),
  withReservationTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
      ticketOrder: {
        count: mocks.ticketOrderCount,
        create: mocks.ticketOrderCreate,
      },
      ticketOrderItem: {
        count: mocks.ticketOrderItemCount,
      },
      ticketAuditLog: {
        create: mocks.ticketAuditLogCreate,
      },
    }),
}));

vi.mock("@/lib/ticketing/inventory", () => ({
  TicketInventoryError: class extends Error {},
  commitReservedInventory: vi.fn(),
  quantitiesByPool: () => new Map([["pool-1", { total: 1, member: 0 }]]),
  releaseReservedInventory: vi.fn(),
  reserveInventory: mocks.reserveInventory,
}));

vi.mock("@/lib/ticketing/payments", () => ({
  paymentGatewayFor: () => ({
    createCheckout: vi.fn().mockResolvedValue({
      providerCheckoutId: "chk-1",
      checkoutUrl: "https://pay.example/chk-1",
      expiresAt: new Date(Date.now() + 30 * 60_000),
      status: "PENDING",
    }),
    isDefinitiveCheckoutError: () => false,
  }),
}));

vi.mock("@/lib/ticketing/design", () => ({
  publishedTicketDesign: vi.fn(),
}));

import { createTicketCheckout } from "@/lib/ticketing/orders";
import { accountOrderMax } from "@/lib/ticketing/accountLimit";
import { getPublishedTicketEventBySlug } from "@/lib/ticketing/queries";

const USER_SESSION = {
  user: {
    id: "user-1",
    name: "Driek Rediers",
    email: "driek.rediers@student.kuleuven.be",
    isSuperAdmin: false,
  },
  groups: [{ id: "group-act", type: "PRAESIDIUM" }],
};

function makeEvent(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: "ev-1",
    slug: "wijvenschijvencantus3",
    titleNl: "Wijvenschijvencantus",
    titleEn: null,
    labelNl: null,
    labelEn: null,
    descriptionNl: null,
    descriptionEn: null,
    location: "Waaiberg",
    locationAddress: null,
    imageKey: null,
    imageFocusX: null,
    imageFocusY: null,
    imageFocusMobileX: null,
    imageFocusMobileY: null,
    imageZoom: null,
    imageZoomMobile: null,
    imageCategoryId: null,
    imageCategory: null,
    calendarEventId: null,
    calendarEvent: null,
    onEventPage: false,
    ownTimes: false,
    isPrivate: false,
    privateToken: null,
    presaleToken: null,
    startsAt: new Date(now + 7 * 24 * 3600_000),
    endsAt: new Date(now + 8 * 24 * 3600_000),
    salesStartAt: new Date(now - 3600_000),
    salesEndAt: new Date(now + 6 * 24 * 3600_000),
    presaleLeadMinutes: 2580,
    presalePraesidium: true,
    presaleHelpers: true,
    presaleHonorary: true,
    presaleGroups: [],
    status: "PUBLISHED",
    currency: "EUR",
    maxTicketsPerOrder: 1,
    honoraryOneTicket: false,
    cardCheckIn: false,
    contactEmail: null,
    ownerGroupId: "group-act",
    ownerGroup: { id: "group-act", nameNl: "Activiteiten", nameEn: "Activities" },
    accountingCode: null,
    questions: [],
    ticketTypes: [
      {
        id: "type-1",
        code: "BEER",
        nameNl: "Bierticket",
        nameEn: null,
        descriptionNl: null,
        descriptionEn: null,
        unitPriceCents: 1700,
        memberPriceCents: 1400,
        honoraryPriceCents: null,
        audience: "PUBLIC",
        active: true,
        minPerOrder: 1,
        maxPerOrder: 1,
        salesStartAt: null,
        salesEndAt: null,
        nonMemberDelayMinutes: null,
        inventoryPoolId: "pool-1",
        inventoryPool: {
          id: "pool-1",
          active: true,
          capacity: 80,
          reservedCount: 0,
          soldCount: 0,
          memberCapacity: null,
          memberReservedCount: 0,
          memberSoldCount: 0,
          nonMemberCapacity: null,
        },
      },
    ],
    ...overrides,
  };
}

/**
 * De volledige stroom (voorverkoop, tweede bestelling, publieke verkoop, max 1)
 * staat in `test/integration/ticketing-db.integration.ts`, tegen een echte
 * database en met het echte slot. Hier enkel wat daar niet in past: de pure
 * regel, randgevallen van de naamcontrole, en wie erbuiten valt.
 */

const futurePublicStart = () => new Date(Date.now() + 24 * 3600_000);

function presaleEvent(maxTicketsPerOrder = 8) {
  return makeEvent({
    salesStartAt: futurePublicStart(),
    presaleLeadMinutes: 48 * 60,
    maxTicketsPerOrder,
    ticketTypes: [{ ...makeEvent().ticketTypes[0], maxPerOrder: maxTicketsPerOrder }],
  });
}

function checkout(
  buyer: { name: string; email: string },
  attendees: Array<{ name: string; email?: string }>,
) {
  return createTicketCheckout(
    {
      eventId: "ev-1",
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      locale: "nl",
      termsAccepted: true,
      paymentProvider: "mock",
      items: attendees.map((attendee) => ({
        ticketTypeId: "type-1",
        attendeeName: attendee.name,
        attendeeEmail: attendee.email,
      })),
    },
    null,
  );
}

describe("accountOrderMax", () => {
  it("gives the event maximum when no account limit applies", () => {
    expect(accountOrderMax({ maxTicketsPerOrder: 8 })).toBe(8);
  });

  it("caps at one during presale and for an honorary member with one ticket", () => {
    expect(accountOrderMax({ maxTicketsPerOrder: 8, presaleSelfOnly: true })).toBe(1);
    expect(accountOrderMax({ maxTicketsPerOrder: 8, honoraryOneTicket: { used: false } })).toBe(1);
  });

  it("drops to zero once the account holds its one ticket", () => {
    expect(accountOrderMax({ maxTicketsPerOrder: 1, oneTicketPerAccount: { used: true } })).toBe(0);
    expect(accountOrderMax({ maxTicketsPerOrder: 8, honoraryOneTicket: { used: true } })).toBe(0);
    expect(
      accountOrderMax({ maxTicketsPerOrder: 8, presaleSelfOnly: true, oneTicketPerAccount: { used: true } }),
    ).toBe(0);
  });

  it("never raises an event maximum of zero", () => {
    expect(accountOrderMax({ maxTicketsPerOrder: 0, presaleSelfOnly: true })).toBe(0);
  });
});

describe("presale self-only and per-account checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(USER_SESSION);
    mocks.userIsMember.mockResolvedValue(true);
    mocks.viewerProfile.mockResolvedValue({ honorary: false, audiences: [] });
    mocks.presaleViewerFor.mockResolvedValue({ groups: USER_SESSION.groups });
    mocks.hasPrivateTicketAccess.mockResolvedValue(true);
    mocks.ticketOrderCount.mockResolvedValue(0);
    mocks.ticketOrderItemCount.mockResolvedValue(0);
    mocks.ticketOrderCreate.mockResolvedValue({ id: "ord-1" });
    mocks.ticketAuditLogCreate.mockResolvedValue({});
    mocks.reserveInventory.mockResolvedValue(undefined);
  });

  it("accepts the account's own name and address in other casing, spacing, or with a blank attendee email", async () => {
    mocks.getSession.mockResolvedValue({
      ...USER_SESSION,
      user: { ...USER_SESSION.user, email: "Driek.Rediers@student.kuleuven.be" },
    });
    mocks.ticketEventFindUnique.mockResolvedValue(presaleEvent());

    await expect(
      checkout(
        { name: "driek  REDIERS ", email: "DRIEK.rediers@student.kuleuven.be" },
        [{ name: "Driek Rediers", email: "Driek.Rediers@Student.KULeuven.be" }],
      ),
    ).resolves.toMatchObject({ orderId: expect.any(String) });

    await expect(
      checkout({ name: "Driek Rediers", email: "driek.rediers@student.kuleuven.be" }, [
        { name: "Driek Rediers", email: "" },
      ]),
    ).resolves.toMatchObject({ orderId: expect.any(String) });
  });

  it("holds a logged-in buyer to self-only even when they followed the presale link", async () => {
    mocks.presaleViewerFor.mockResolvedValue({ groups: [], hasPresaleLink: true });
    mocks.ticketEventFindUnique.mockResolvedValue(presaleEvent());

    await expect(
      checkout({ name: "Driek Rediers", email: "driek.rediers@student.kuleuven.be" }, [
        { name: "Bandlid 1", email: "band1@example.com" },
      ]),
    ).rejects.toMatchObject({ code: "PRESALE_SELF_ONLY" });
  });

  it("lets a logged-out presale-link buyer order several tickets for others", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.userIsMember.mockResolvedValue(false);
    mocks.presaleViewerFor.mockResolvedValue({ groups: [], hasPresaleLink: true });
    mocks.ticketEventFindUnique.mockResolvedValue(presaleEvent(4));

    await expect(
      checkout({ name: "Band Manager", email: "band@example.com" }, [
        { name: "Bandlid 1", email: "band1@example.com" },
        { name: "Bandlid 2", email: "band2@example.com" },
      ]),
    ).resolves.toMatchObject({ orderId: expect.any(String) });
    expect(mocks.ticketOrderItemCount).not.toHaveBeenCalled();
  });

  it("does not count anything for a logged-out buyer on a max-1 event", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.userIsMember.mockResolvedValue(false);
    mocks.presaleViewerFor.mockResolvedValue(null);
    mocks.ticketEventFindUnique.mockResolvedValue(makeEvent({ maxTicketsPerOrder: 1 }));

    await expect(
      checkout({ name: "LBK Gast", email: "gast@example.com" }, [
        { name: "LBK Gast", email: "gast@example.com" },
      ]),
    ).resolves.toMatchObject({ orderId: expect.any(String) });
    expect(mocks.ticketOrderItemCount).not.toHaveBeenCalled();
  });
});

describe("what the shop learns about the account limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(USER_SESSION);
    mocks.userIsMember.mockResolvedValue(true);
    mocks.viewerProfile.mockResolvedValue({ honorary: false, audiences: [] });
    mocks.presaleViewerFor.mockResolvedValue({ groups: USER_SESSION.groups });
    mocks.hasPrivateTicketAccess.mockResolvedValue(true);
    mocks.ticketOrderItemCount.mockResolvedValue(0);
  });

  it("marks a max-1 event as one per account, and says whether it is used", async () => {
    mocks.ticketEventFindUnique.mockResolvedValue(makeEvent({ maxTicketsPerOrder: 1 }));
    mocks.ticketOrderItemCount.mockResolvedValue(1);
    const dto = await getPublishedTicketEventBySlug("wijvenschijvencantus3", "nl");
    expect(dto).toMatchObject({ oneTicketPerAccount: { used: true }, presaleSelfOnly: false });
  });

  it("has no account limit at public sale with a higher maximum", async () => {
    mocks.ticketEventFindUnique.mockResolvedValue(makeEvent({ maxTicketsPerOrder: 8 }));
    const dto = await getPublishedTicketEventBySlug("wijvenschijvencantus3", "nl");
    expect(dto).toMatchObject({ oneTicketPerAccount: null, presaleSelfOnly: false });
    expect(mocks.ticketOrderItemCount).not.toHaveBeenCalled();
  });

  it("marks a logged-in presale buyer as self-only with one per account", async () => {
    mocks.ticketEventFindUnique.mockResolvedValue(presaleEvent());
    const dto = await getPublishedTicketEventBySlug("wijvenschijvencantus3", "nl");
    expect(dto).toMatchObject({ oneTicketPerAccount: { used: false }, presaleSelfOnly: true });
  });

  it("leaves a logged-out presale-link visitor without the limit", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.userIsMember.mockResolvedValue(false);
    mocks.presaleViewerFor.mockResolvedValue({ groups: [], hasPresaleLink: true });
    mocks.ticketEventFindUnique.mockResolvedValue(presaleEvent());
    const dto = await getPublishedTicketEventBySlug("wijvenschijvencantus3", "nl");
    expect(dto).toMatchObject({ oneTicketPerAccount: null, presaleSelfOnly: false });
  });
});
