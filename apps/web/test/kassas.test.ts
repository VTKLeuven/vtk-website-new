import { describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@vtk/auth";

vi.mock("@vtk/db", () => ({ prisma: {} }));
vi.mock("@/lib/session", () => ({ getCurrentSession: vi.fn(), requireSession: vi.fn() }));

import {
  computeResult,
  countsTotalCents,
  normaliseCounts,
  parseAmountInput,
  parseCashRegisterConfig,
  parseCountInput,
  SETTABLE_STATUSES,
  statusFromSlug,
  STATUS_SLUGS,
  CASH_REGISTER_STATUSES,
  DEFAULT_CASH_REGISTER_CONFIG,
  type Counts,
} from "@/lib/kassas/kassa";
import { accessFor, canEditRequest, canView, visibilityWhere } from "@/lib/kassas/server";
import { cashRegisterAcceptedMail } from "@/lib/kassas/mail";

const noVouchers = { shiftVouchers: null, elixirVouchers: null, shiftVoucherValueCents: 120, elixirVoucherValueCents: 120 };

describe("kassa's: tellen en resultaat", () => {
  // Twee blokken uit het rekenblad van Beheer (Semester 2), met de uitkomst die
  // het blad zelf berekende.
  const onthaaldagenStart: Counts = { "20": 40, "50": 40, "100": 50, "200": 50, "500": 5, "1000": 5 };
  const onthaaldagenEnd: Counts = { "5": 7, "20": 41, "50": 48, "100": 83, "200": 95, "500": 9, "1000": 5, "2000": 2 };

  it("rekent begin- en eindkassa zoals het rekenblad", () => {
    expect(countsTotalCents(onthaaldagenStart)).toBe(25_300);
    expect(countsTotalCents(onthaaldagenEnd)).toBe(44_055);
  });

  it("telt cash, Bancontact en Payconiq op tot het finaal resultaat", () => {
    // Cursusdienst, Onthaaldagen: 165 cash en 554 op het Cudi-bakje = 719.
    const result = computeResult({
      startCounts: { "100": 50, "200": 50, "500": 5, "1000": 5 },
      endCounts: { "100": 50, "200": 50, "500": 8, "1000": 7, "2000": 4, "5000": 1 },
      ...noVouchers,
      payments: [{ method: "BANCONTACT", amountCents: 55_400 }],
      ticketIncomeCents: [],
    });
    expect(result.cashCents).toBe(16_500);
    expect(result.bancontactCents).toBe(55_400);
    expect(result.totalCents).toBe(71_900);
  });

  it("telt bonnen mee aan de vastgeklikte waarde", () => {
    const result = computeResult({
      startCounts: onthaaldagenStart,
      endCounts: onthaaldagenEnd,
      shiftVouchers: 2,
      elixirVouchers: 4,
      shiftVoucherValueCents: 120,
      elixirVoucherValueCents: 100,
      payments: [],
      ticketIncomeCents: [],
    });
    expect(result.cashCents).toBe(18_755);
    expect(result.voucherCents).toBe(2 * 120 + 4 * 100);
    expect(result.totalCents).toBe(18_755 + 640);
  });

  it("rekent een kassa die nog niet geteld is niet als een lege kassa", () => {
    // Studentenwelkom stond in het blad op -1950 cash omdat de lege eindkassa
    // als nul telde; hier is ze nog niet geteld, en telt enkel wat er al is.
    const result = computeResult({
      startCounts: { "100": 1650, "200": 150 },
      endCounts: null,
      ...noVouchers,
      payments: [
        { method: "BANCONTACT", amountCents: 211_400 },
        { method: "BANCONTACT", amountCents: null },
        { method: "PAYCONIQ", amountCents: 25_300 },
      ],
      ticketIncomeCents: [12_000, 3_000],
    });
    expect(result.endCents).toBeNull();
    expect(result.cashCents).toBeNull();
    expect(result.ticketCents).toBe(15_000);
    expect(result.totalCents).toBe(211_400 + 25_300 + 15_000);
  });

  it("onderscheidt een getelde lege kassa van een niet getelde", () => {
    const result = computeResult({
      startCounts: { "100": 10 },
      endCounts: {},
      ...noVouchers,
      payments: [],
      ticketIncomeCents: [],
    });
    expect(result.endCents).toBe(0);
    expect(result.cashCents).toBe(-1_000);
  });

  it("houdt enkel bekende coupures met een geldig aantal over", () => {
    expect(normaliseCounts({ "50": 3, "7": 9, "100": -1, "200": 1.5, "500": "4", "1000": 0 })).toEqual({ "50": 3 });
    expect(normaliseCounts(null)).toEqual({});
  });
});

describe("kassa's: invoer", () => {
  it("leest een bedrag met komma, punt of duizendtal, nul inbegrepen", () => {
    expect(parseAmountInput("12,50")).toBe(1_250);
    expect(parseAmountInput("12.5")).toBe(1_250);
    expect(parseAmountInput("€ 1.234,56")).toBe(123_456);
    expect(parseAmountInput("0")).toBe(0);
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("twaalf")).toBeUndefined();
    expect(parseAmountInput("-5")).toBeUndefined();
  });

  it("leest een aantal als geheel getal", () => {
    expect(parseCountInput("40")).toBe(40);
    expect(parseCountInput(" ")).toBeNull();
    expect(parseCountInput("2,5")).toBeUndefined();
  });

  it("zet elke status om naar een slug en terug", () => {
    for (const status of CASH_REGISTER_STATUSES) expect(statusFromSlug(STATUS_SLUGS[status])).toBe(status);
    expect(statusFromSlug("bestaat-niet")).toBeNull();
    expect(SETTABLE_STATUSES).not.toContain("REQUESTED");
  });
});

describe("kassa's: instellingen", () => {
  it("valt terug op de standaard zonder instelling", () => {
    expect(parseCashRegisterConfig(undefined)).toEqual(DEFAULT_CASH_REGISTER_CONFIG);
  });

  it("laat een bewust lege lijst leeg en kuist namen op", () => {
    const config = parseCashRegisterConfig({
      bancontactTerminals: [],
      payconiqAccounts: ["  Theo ", "theo", "", "Evenementen  1"],
      shiftVoucherValueCents: 0,
    });
    expect(config.bancontactTerminals).toEqual([]);
    expect(config.payconiqAccounts).toEqual(["Theo", "Evenementen 1"]);
    expect(config.shiftVoucherValueCents).toBe(0);
    expect(config.elixirVoucherValueCents).toBe(DEFAULT_CASH_REGISTER_CONFIG.elixirVoucherValueCents);
  });
});

function session(opts: { permissions?: string[]; groups?: string[]; isSuperAdmin?: boolean }): SessionPayload {
  return {
    user: { id: "me", isSuperAdmin: opts.isSuperAdmin ?? false },
    permissions: opts.permissions ?? [],
    groups: (opts.groups ?? []).map((id) => ({ id })),
  } as unknown as SessionPayload;
}

describe("kassa's: toegang", () => {
  const requester = accessFor(session({ permissions: ["cashRegisters.request"], groups: ["onthaal"] }));
  const manager = accessFor(session({ permissions: ["cashRegisters.manage"] }));
  const pending = { requestedById: "someone-else", groupId: "onthaal", status: "REQUESTED" };

  it("laat een post de aanvragen van de eigen post zien, niet die van een andere", () => {
    expect(canView(requester, pending)).toBe(true);
    expect(canView(requester, { ...pending, groupId: "cultuur" })).toBe(false);
    expect(canView(requester, { ...pending, groupId: "cultuur", requestedById: "me" })).toBe(true);
    expect(visibilityWhere(manager)).toBeUndefined();
  });

  it("laat de post aanpassen tot Beheer aanvaardt, Beheer altijd", () => {
    expect(canEditRequest(requester, pending)).toBe(true);
    expect(canEditRequest(requester, { ...pending, status: "TO_MAKE" })).toBe(false);
    expect(canEditRequest(manager, { ...pending, status: "BOOKED" })).toBe(true);
  });

  it("geeft wie beheert ook het recht om aan te vragen", () => {
    expect(manager.canRequest).toBe(true);
    expect(accessFor(session({})).canRequest).toBe(false);
  });
});

describe("kassa's: mail bij aanvaarden", () => {
  const mail = cashRegisterAcceptedMail({
    locale: "nl",
    name: "Wannes",
    activity: "Cantus <b>&</b> co",
    date: new Date("2026-10-08T00:00:00.000Z"),
    postLabel: "Onthaal",
    responsibleName: "Wannes Voorbeeld",
    startCounts: { "50": 20, "200": 25 },
    wantsBancontact: true,
    wantsPayconiq: false,
    contactEmail: "beheer@vtk.be",
    url: "https://vtk.be/admin/kassas/voorbeeld",
  });

  it("zegt dat de aanvrager zelf een ophaalmoment afspreekt, met het adres van Beheer", () => {
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("financieel beheerders persoonlijk");
      expect(body).toContain("beheer@vtk.be");
    }
    expect(mail.text).toContain("€ 60,00");
    expect(mail.text).toContain("25 × € 2");
    expect(mail.text).toContain("donderdag 8 oktober 2026");
  });

  it("ontsnapt wat de post intikte in de html", () => {
    expect(mail.html).not.toContain("<b>&</b>");
    expect(mail.html).toContain("Cantus &lt;b&gt;&amp;&lt;/b&gt; co");
  });
});
