import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  cookieValue: vi.fn<(name: string) => string | undefined>(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    ticketEvent: {
      findUnique: mocks.findUnique,
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookieValue(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

import { GET } from "@/app/[locale]/tickets/[slug]/prive/[token]/route";
import {
  hasPrivateTicketAccess,
  privateCookieExpiry,
  privateCookieName,
} from "@/lib/ticketing/privateLink";
import { presaleCookieName } from "@/lib/ticketing/presaleLink";
import { adminShopLink } from "@/lib/ticketing/shopPath";

const TOKEN = "0123456789abcdef0123456789abcdef";

function context(locale = "nl", slug = "weekend", token = TOKEN) {
  return { params: Promise.resolve({ locale, slug, token }) };
}

function privateEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-weekend",
    privateToken: TOKEN,
    salesEndAt: new Date(Date.now() + 7 * 24 * 3600_000),
    endsAt: new Date(Date.now() + 10 * 24 * 3600_000),
    ...overrides,
  };
}

describe("GET /[locale]/tickets/[slug]/prive/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zet een cookie voor dit event en stuurt relatief door naar de ticketpagina", async () => {
    mocks.findUnique.mockResolvedValue(privateEvent());

    const response = await GET(
      new Request(`https://localhost:3000/tickets/weekend/prive/${TOKEN}`),
      context(),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/tickets/weekend");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(privateCookieName("ev-weekend"));
    expect(cookie).toContain(TOKEN);
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("geeft de herkomst uit een deelbare link door, en niets anders", async () => {
    mocks.findUnique.mockResolvedValue(privateEvent());

    const response = await GET(
      new Request(
        `https://localhost:3000/en/tickets/weekend/prive/${TOKEN}?via=whatsapp&c=groep&token=x`,
      ),
      context("en"),
    );

    expect(response.headers.get("location")).toBe("/en/tickets/weekend?via=whatsapp&c=groep");
  });

  it("zet geen cookie bij een verkeerde of vernieuwde link", async () => {
    mocks.findUnique.mockResolvedValue(privateEvent({ privateToken: "f".repeat(32) }));

    const response = await GET(
      new Request(`https://localhost:3000/tickets/weekend/prive/${TOKEN}`),
      context(),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/tickets/weekend");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("zet geen cookie voor een onbestaand event", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await GET(
      new Request(`https://localhost:3000/tickets/onbekend/prive/${TOKEN}`),
      context("nl", "onbekend"),
    );

    expect(response.headers.get("location")).toBe("/tickets/onbekend");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("geeft een 404 voor een onbekende taal", async () => {
    const response = await GET(
      new Request(`https://localhost:3000/de/tickets/weekend/prive/${TOKEN}`),
      context("de"),
    );
    expect(response.status).toBe(404);
  });
});

describe("hasPrivateTicketAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("laat een openbaar event altijd door, zonder naar cookies te kijken", async () => {
    await expect(
      hasPrivateTicketAccess({ id: "ev", isPrivate: false, privateToken: null }),
    ).resolves.toBe(true);
    expect(mocks.cookieValue).not.toHaveBeenCalled();
  });

  it("laat een privé-event enkel door met een cookie die bij het huidige token hoort", async () => {
    const event = { id: "ev-weekend", isPrivate: true, privateToken: TOKEN };

    mocks.cookieValue.mockReturnValue(undefined);
    await expect(hasPrivateTicketAccess(event)).resolves.toBe(false);

    mocks.cookieValue.mockImplementation((name) =>
      name === privateCookieName("ev-weekend") ? TOKEN : undefined,
    );
    await expect(hasPrivateTicketAccess(event)).resolves.toBe(true);

    // Vernieuwd: de cookie van de oude link telt niet meer.
    await expect(
      hasPrivateTicketAccess({ ...event, privateToken: "f".repeat(32) }),
    ).resolves.toBe(false);
  });

  it("laat de voorverkoopcookie niet als privétoegang gelden", async () => {
    mocks.cookieValue.mockImplementation((name) =>
      name === presaleCookieName("ev-weekend") ? TOKEN : undefined,
    );
    await expect(
      hasPrivateTicketAccess({ id: "ev-weekend", isPrivate: true, privateToken: TOKEN }),
    ).resolves.toBe(false);
  });

  it("laat niemand binnen op een privé-event zonder token", async () => {
    mocks.cookieValue.mockReturnValue("");
    await expect(
      hasPrivateTicketAccess({ id: "ev", isPrivate: true, privateToken: null }),
    ).resolves.toBe(false);
  });
});

describe("privateCookieExpiry", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("leeft tot de verkoop sluit, en anders tot het event voorbij is", () => {
    const salesEndAt = new Date("2026-10-10T22:00:00Z");
    const endsAt = new Date("2026-10-12T02:00:00Z");
    expect(privateCookieExpiry({ salesEndAt, endsAt }, now)).toEqual(salesEndAt);
    expect(privateCookieExpiry({ salesEndAt: null, endsAt }, now)).toEqual(endsAt);
  });

  it("valt terug op een dag wanneer dat moment al voorbij is", () => {
    expect(
      privateCookieExpiry({ salesEndAt: null, endsAt: new Date("2026-09-01T00:00:00Z") }, now),
    ).toEqual(new Date("2026-10-02T12:00:00Z"));
  });
});

describe("adminShopLink", () => {
  const base = { slug: "weekend", status: "PUBLISHED", isPrivate: false, privateToken: null };

  it("opent een openbaar, gepubliceerd event gewoon", () => {
    expect(adminShopLink(base, false)).toEqual({ path: "/tickets/weekend", live: true });
  });

  it("opent een concept als voorbeeld", () => {
    expect(adminShopLink({ ...base, status: "DRAFT" }, true)).toEqual({
      path: "/tickets/weekend?preview=1",
      live: false,
    });
  });

  it("opent een privé-event via de privélink, enkel voor wie het beheert", () => {
    const event = { ...base, isPrivate: true, privateToken: TOKEN };
    expect(adminShopLink(event, true)).toEqual({
      path: `/tickets/weekend/prive/${TOKEN}`,
      live: true,
    });
    expect(adminShopLink(event, false)).toEqual({
      path: "/tickets/weekend?preview=1",
      live: false,
    });
  });
});
