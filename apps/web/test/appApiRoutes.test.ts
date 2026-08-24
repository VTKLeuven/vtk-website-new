import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De vorm die de VTK-app binnenkrijgt.
 *
 * Deze tests bestaan omdat een geïnstalleerde app maanden ouder kan zijn dan de
 * server. Wat hier vastligt is niet de inhoud maar het contract: welke velden er
 * zijn, dat beeld-URL's absoluut zijn, en dat de doelgroepfilter meegaat. Breekt
 * daar iets aan, dan hoort dat een nieuwe versie van het pad te worden en geen
 * stille wijziging.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  requireSession: vi.fn(),
  calendarFindMany: vi.fn(),
  categoryFindMany: vi.fn(),
  viewerAudiences: vi.fn(),
  audienceFilter: vi.fn(),
  loadOrderableSessions: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    calendarEvent: { findMany: mocks.calendarFindMany },
    calendarCategory: { findMany: mocks.categoryFindMany },
  },
}));

vi.mock("@/lib/session", () => ({
  getCurrentSession: mocks.session,
  requireSession: mocks.requireSession,
}));

vi.mock("@/lib/calendar/audience", () => ({
  viewerAudiences: mocks.viewerAudiences,
  audienceFilter: mocks.audienceFilter,
}));

vi.mock("@/lib/calendar/categories", () => ({
  listCalendarCategories: mocks.categoryFindMany,
}));

vi.mock("@/lib/theokot-orders", () => ({
  loadOrderableSessions: mocks.loadOrderableSessions,
  remainingFor: (item: { id: string; quantity: number }, used: Map<string, number>) =>
    Math.max(0, item.quantity - (used.get(item.id) ?? 0)),
}));

import { GET as calendarGet } from "@/app/api/app/v1/kalender/route";
import { GET as theokotGet } from "@/app/api/app/v1/theokot/route";

/**
 * Een aanvraag zoals ze van een toestel komt: achter de reverse proxy, dus met
 * `x-forwarded-host`. Dat is precies het geval waarin `request.url` de interne
 * waarde draagt en de app-API zijn host uit de headers moet halen.
 */
function appRequest(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://intern:3000${path}`, {
    headers: { "x-forwarded-host": "vtk.be", "x-forwarded-proto": "https", ...headers },
  });
}

describe("GET /api/app/v1/kalender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewerAudiences.mockResolvedValue([]);
    mocks.audienceFilter.mockReturnValue({ OR: ["doelgroepfilter"] });
    mocks.categoryFindMany.mockResolvedValue([
      { slug: "cantus", nameNl: "Cantussen", nameEn: "Cantus", colour: "#123456", audience: null },
    ]);
    mocks.calendarFindMany.mockResolvedValue([
      {
        id: "ev-1",
        titleNl: "Galabal",
        titleEn: "Gala",
        start: new Date("2026-10-01T18:00:00.000Z"),
        end: new Date("2026-10-02T02:00:00.000Z"),
        allDay: false,
        location: "Aula",
        imageKey: "events/gala.jpg",
        group: { slug: "feest", nameNl: "Feest", nameEn: "Party" },
        categories: [
          {
            category: {
              slug: "cantus",
              nameNl: "Cantussen",
              nameEn: "Cantus",
              colour: "#123456",
              audience: null,
            },
          },
        ],
      },
    ]);
  });

  it("geeft absolute beeld-URL's op de host van de aanvraag", async () => {
    const response = await calendarGet(appRequest("/api/app/v1/kalender"));
    const body = await response.json();

    // Niet `http://intern:3000`: dat is de host waarop Next draait, niet de host
    // waarmee de telefoon binnenkwam. Een pad zou hier evenmin werken, want een
    // <Image source={{ uri }}> vult geen host aan.
    expect(body.events[0].imageUrl).toBe("https://vtk.be/api/media/events/gala.jpg");
  });

  it("kiest de vertaalde titel", async () => {
    const nl = await (await calendarGet(appRequest("/api/app/v1/kalender"))).json();
    const en = await (await calendarGet(appRequest("/api/app/v1/kalender?locale=en"))).json();

    expect(nl.events[0].title).toBe("Galabal");
    expect(en.events[0].title).toBe("Gala");
  });

  /**
   * De doelgroepfilter is de reden dat een eerstejaarsevent niet bij iedereen op
   * het scherm staat. Hij is een standaard en geen slot, dus `audience=all` zet
   * hem uit; dat de app dat weet, staat in `filteredByAudience`.
   */
  it("past de doelgroepfilter toe, tenzij er expliciet om alles gevraagd wordt", async () => {
    const filtered = await (await calendarGet(appRequest("/api/app/v1/kalender"))).json();
    expect(filtered.filteredByAudience).toBe(true);
    expect(mocks.audienceFilter).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.calendarFindMany.mockResolvedValue([]);
    const all = await (await calendarGet(appRequest("/api/app/v1/kalender?audience=all"))).json();
    expect(all.filteredByAudience).toBe(false);
    expect(mocks.audienceFilter).not.toHaveBeenCalled();
  });

  /**
   * Een evenement dat bezig is, hoort er nog bij te staan. Daarom filtert de
   * route op `end` en niet op `start`; anders verdwijnt een festival op zijn
   * tweede dag uit de app.
   */
  it("houdt een lopend evenement in de lijst", async () => {
    await calendarGet(appRequest("/api/app/v1/kalender"));
    const where = mocks.calendarFindMany.mock.calls[0][0].where;

    expect(where.end).toEqual({ gte: expect.any(Date) });
    expect(where.start).toBeUndefined();
  });

  it("filtert op categorie en laat de doelgroepfilter dan los", async () => {
    await calendarGet(appRequest("/api/app/v1/kalender?categorie=cantus"));
    const where = mocks.calendarFindMany.mock.calls[0][0].where;

    expect(where.categories).toEqual({ some: { category: { slug: { in: ["cantus"] } } } });
    // Wie om één categorie vraagt, krijgt ze ook als het een doelgroepcategorie
    // is: die lijst is dan de eerstejaarskalender.
    expect(mocks.audienceFilter).not.toHaveBeenCalled();
  });
});

describe("GET /api/app/v1/theokot", () => {
  const sessionAt = (close: string) => ({
    id: "sess-1",
    date: new Date("2026-09-15T00:00:00.000Z"),
    pickupStart: new Date("2026-09-15T10:00:00.000Z"),
    pickupEnd: new Date("2026-09-15T14:00:00.000Z"),
    // Ruim in het verleden, zodat de test niet afhangt van wanneer hij draait.
    orderOpenAt: new Date("2000-01-01T00:00:00.000Z"),
    orderCloseAt: new Date(close),
    isOpen: true,
    items: [
      {
        id: "item-1",
        nameNl: "Smos kaas",
        nameEn: "Cheese",
        priceCents: 260,
        quantity: 10,
        isWeeklySpecial: false,
        imageKey: "theokot/kaas.jpg",
        ingredientsNl: "  ",
        ingredientsEn: null,
      },
    ],
    orders: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.loadOrderableSessions.mockResolvedValue({
      config: { maxItemsPerOrder: 5, maxWeeklySpecialPerOrder: 1 },
      ban: null,
      sessions: [sessionAt("2100-01-01T00:00:00.000Z")],
      used: new Map([["item-1", 3]]),
      message: { bodyNl: " Vandaag geen soep ", bodyEn: "" },
    });
  });

  it("trekt de gereserveerde stukken van de voorraad af", async () => {
    const body = await (await theokotGet(appRequest("/api/app/v1/theokot"))).json();
    expect(body.sessions[0].items[0].remaining).toBe(7);
  });

  it("laat ingrediënten weg wanneer beide talen leeg zijn", async () => {
    const body = await (await theokotGet(appRequest("/api/app/v1/theokot"))).json();
    // Een veld met enkel spaties is geen ingrediëntenlijst; de app hoort daar
    // geen lege regel voor te tekenen.
    expect(body.sessions[0].items[0].ingredients).toBeNull();
  });

  it("zegt of het bestelvenster open, nog dicht of voorbij is", async () => {
    const open = await (await theokotGet(appRequest("/api/app/v1/theokot"))).json();
    expect(open.sessions[0].window).toBe("OPEN");
    expect(open.sessions[0].canOrder).toBe(true);

    mocks.loadOrderableSessions.mockResolvedValue({
      config: { maxItemsPerOrder: 5, maxWeeklySpecialPerOrder: 1 },
      ban: null,
      sessions: [sessionAt("2000-01-01T00:00:00.000Z")],
      used: new Map(),
      message: undefined,
    });

    const closed = await (await theokotGet(appRequest("/api/app/v1/theokot"))).json();
    expect(closed.sessions[0].window).toBe("CLOSED");
    expect(closed.sessions[0].canOrder).toBe(false);
  });

  it("geeft de ban door als ISO-tijdstip", async () => {
    const until = new Date("2026-09-30T00:00:00.000Z");
    mocks.loadOrderableSessions.mockResolvedValue({
      config: { maxItemsPerOrder: 5, maxWeeklySpecialPerOrder: 1 },
      ban: { endsAt: until },
      sessions: [],
      used: new Map(),
      message: undefined,
    });

    const body = await (await theokotGet(appRequest("/api/app/v1/theokot"))).json();
    expect(body.ban).toEqual({ until: until.toISOString() });
  });

  it("vraagt een login", async () => {
    mocks.requireSession.mockRejectedValue(new Error("UNAUTHENTICATED"));

    const response = await theokotGet(appRequest("/api/app/v1/theokot"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("UNAUTHENTICATED");
  });
});
