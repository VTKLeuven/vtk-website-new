import { describe, expect, it } from "vitest";
import {
  evaluateStatus,
  isStale,
  parseStoredStatus,
  type BarStatusState,
} from "@/lib/elixir/barStatus";
import type { ElixirThresholds } from "@/lib/elixir/config";
import { absorbSetCookies, cookieHeader, createCookieJar } from "@/lib/elixir/cookieJar";
import { parseLoginForm } from "@/lib/elixir/loginForm";
import {
  pickCurrentEvent,
  pickMeasurementPoint,
  readDecibels,
  toRows,
} from "@/lib/elixir/munisenseParse";
import type { SoundEvent } from "@/lib/elixir/munisenseParse";
import {
  openingWindowPhase,
  withinOpeningWindow,
  type OpeningWindowPhase,
} from "@/lib/elixir/openingWindow";

const THRESHOLDS: ElixirThresholds = {
  openDb: 65,
  closeDb: 60,
  quietCyclesToClose: 2,
  sampleMaxAgeMs: 15 * 60_000,
};

/** Woensdag 5 augustus 2026, 21:00 UTC: binnen het venster van event 486097. */
const NOW = new Date("2026-08-05T21:00:00.000Z");

/**
 * Echte antwoorden van leuven-geluid.munisense.net, ingekort. De vorm is het
 * hele punt van deze fixtures: een map met het event-id als sleutel plus een
 * link_next, unix-tijdstempels in seconden, en `object_id` in plaats van `id`.
 */
const SOUNDEVENTS = {
  "485965": {
    object_id: 485965,
    description: "04-08-2026 - 't ElixIr",
    start_timestamp: 1785830400,
    end_timestamp: 1785906000,
    minutes_over_threshold: 0,
    generated_by_limits: false,
    _uri: "/soundevents/485965",
  },
  "486097": {
    object_id: 486097,
    description: "05-08-2026 - 't ElixIr",
    start_timestamp: 1785916800,
    end_timestamp: 1785992400,
    minutes_over_threshold: null,
    generated_by_limits: false,
    _uri: "/soundevents/486097",
  },
  link_next: "/groups/81/soundevents?order_field=start_timestamp&order_dir=desc&offset=100",
};

const MEASUREMENT_POINTS = [
  {
    object_id: "3413",
    description: "'t ElixIr",
    has_sound_event: true,
    is_active: true,
    laeq_last_period: 47.7,
    laeq_limit_period: 95,
    laeq_longterm: 47.67,
    lceq_last_period: 55.8314,
    lceq_limit_period: null,
    lceq_longterm: 55.88,
    lceq_limit_longterm: null,
  },
];

const REALTIME_SOUND = { laeq: 48.5 };

function activeEvent(overrides: Partial<SoundEvent> = {}): SoundEvent {
  return {
    id: "486097",
    active: true,
    startsAt: new Date("2026-08-05T08:00:00.000Z"),
    endsAt: new Date("2026-08-06T05:00:00.000Z"),
    name: "05-08-2026 - 't ElixIr",
    ...overrides,
  };
}

describe("parseLoginForm", () => {
  const html = `
    <html><body>
      <form action="/search" method="get">
        <input type="text" name="q" />
        <input type="hidden" name="scope" value="site" />
      </form>
      <form action="/login" method="post" enctype="multipart/form-data">
        <input type="hidden" name="csrf_token" value="abc123" />
        <input type="hidden" name="return_to" value="/dashboard?a=1&amp;b=2" />
        <input type="email" name="user_email" placeholder="E-mail" />
        <input type="password" name="user_password" />
        <input type="checkbox" name="remember" value="1" />
        <button type="submit">Log in</button>
      </form>
    </body></html>`;

  it("neemt enkel de hidden velden van het formulier met het wachtwoordveld", () => {
    const form = parseLoginForm(html);
    expect(form.hidden).toEqual({ csrf_token: "abc123", return_to: "/dashboard?a=1&b=2" });
    expect(form.hidden).not.toHaveProperty("scope");
  });

  it("leest de veldnamen uit het formulier in plaats van ze te gokken", () => {
    const form = parseLoginForm(html);
    expect(form.userField).toBe("user_email");
    expect(form.passField).toBe("user_password");
    expect(form.action).toBe("/login");
  });

  it("valt terug op username/password wanneer het formulier onherkenbaar is", () => {
    const form = parseLoginForm("<html><body>geen formulier</body></html>");
    expect(form).toEqual({ hidden: {}, userField: "username", passField: "password", action: null });
  });

  it("verdraagt enkele aanhalingstekens en een andere attribuutvolgorde", () => {
    const form = parseLoginForm(
      `<form action='/login'><input name='token' type='hidden' value='x1'><input type='password' name='pw'></form>`
    );
    expect(form.hidden).toEqual({ token: "x1" });
    expect(form.passField).toBe("pw");
  });
});

describe("cookieJar", () => {
  it("verzamelt meerdere cookies en serialiseert ze als één header", () => {
    const jar = createCookieJar();
    absorbSetCookies(jar, [
      "__Secure-PHPSESSID=abc; Path=/; Secure; HttpOnly; SameSite=Lax",
      "MuniToken=tok123; Path=/; Domain=.munisense.net; Expires=Wed, 09 Jun 2027 10:18:14 GMT",
    ]);
    expect(cookieHeader(jar)).toBe("__Secure-PHPSESSID=abc; MuniToken=tok123");
  });

  it("vervangt een cookie bij een tweede login in plaats van te dupliceren", () => {
    const jar = createCookieJar();
    absorbSetCookies(jar, ["__Secure-PHPSESSID=oud; Path=/"]);
    absorbSetCookies(jar, ["__Secure-PHPSESSID=nieuw; Path=/"]);
    expect(cookieHeader(jar)).toBe("__Secure-PHPSESSID=nieuw");
  });

  it("verwijdert een cookie bij een lege waarde of Max-Age=0", () => {
    const jar = createCookieJar();
    absorbSetCookies(jar, ["MuniToken=tok; Path=/", "Extra=x; Path=/"]);
    absorbSetCookies(jar, ["MuniToken=; Path=/", "Extra=x; Max-Age=0"]);
    expect(cookieHeader(jar)).toBe("");
  });

  it("negeert onzinnige regels zonder de rest te verliezen", () => {
    const jar = createCookieJar();
    absorbSetCookies(jar, ["", "=leeg", "MuniToken=tok"]);
    expect(cookieHeader(jar)).toBe("MuniToken=tok");
  });
});

describe("toRows", () => {
  it("leest de map met event-ids als sleutel en laat link_next liggen", () => {
    const rows = toRows(SOUNDEVENTS);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.object_id)).toEqual([485965, 486097]);
  });

  it("accepteert een kale array en de gangbare omhulsels", () => {
    expect(toRows(MEASUREMENT_POINTS)).toHaveLength(1);
    expect(toRows({ data: [{ id: 1 }] })).toHaveLength(1);
    expect(toRows({ result: [{ id: 1 }, { id: 2 }] })).toHaveLength(2);
  });

  it("geeft een lege lijst bij onbruikbare invoer", () => {
    expect(toRows(null)).toEqual([]);
    expect(toRows("nope")).toEqual([]);
    expect(toRows(REALTIME_SOUND)).toEqual([]);
  });
});

describe("pickCurrentEvent", () => {
  it("kiest het event waarvan het venster nu loopt", () => {
    const event = pickCurrentEvent(SOUNDEVENTS, NOW);
    expect(event).toMatchObject({ id: "486097", active: true, name: "05-08-2026 - 't ElixIr" });
    // Unix-seconden, niet milliseconden.
    expect(event?.startsAt?.toISOString()).toBe("2026-08-05T08:00:00.000Z");
    expect(event?.endsAt?.toISOString()).toBe("2026-08-06T05:00:00.000Z");
  });

  it("markeert het recentste event als inactief wanneer er niets loopt", () => {
    const event = pickCurrentEvent(SOUNDEVENTS, new Date("2026-08-07T12:00:00.000Z"));
    expect(event).toMatchObject({ id: "486097", active: false });
  });

  it("geeft null bij een leeg of onherkenbaar antwoord", () => {
    expect(pickCurrentEvent({ link_next: "/volgende" }, NOW)).toBeNull();
    expect(pickCurrentEvent([], NOW)).toBeNull();
    expect(pickCurrentEvent([{ naam: "zonder id" }], NOW)).toBeNull();
  });
});

describe("pickMeasurementPoint", () => {
  it("leest id, meterstatus en het reserveniveau uit het echte antwoord", () => {
    expect(pickMeasurementPoint(MEASUREMENT_POINTS)).toEqual({
      id: "3413",
      active: true,
      decibels: 47.7,
    });
  });

  it("kiest het actieve meetpunt wanneer er meerdere zijn", () => {
    expect(
      pickMeasurementPoint([
        { object_id: 10, is_active: false },
        { object_id: 11, is_active: true },
      ])
    ).toMatchObject({ id: "11" });
  });

  it("gaat uit van een werkende meter wanneer de vlag ontbreekt", () => {
    expect(pickMeasurementPoint([{ object_id: 12 }])).toMatchObject({ id: "12", active: true });
  });

  it("geeft null wanneer er geen id in zit", () => {
    expect(pickMeasurementPoint([{ label: "geen id" }])).toBeNull();
  });
});

describe("readDecibels", () => {
  it("leest het realtime-antwoord", () => {
    expect(readDecibels(REALTIME_SOUND)).toEqual({ decibels: 48.5, sampledAt: null });
  });

  it("neemt de jongste meting uit een reeks", () => {
    const sample = readDecibels([
      { timestamp: "2026-08-05T22:28:00Z", laeq: 61.2 },
      { timestamp: "2026-08-05T22:29:00Z", laeq: 71.4 },
    ]);
    expect(sample?.decibels).toBe(71.4);
    expect(sample?.sampledAt?.toISOString()).toBe("2026-08-05T22:29:00.000Z");
  });

  it("negeert onmogelijke waarden", () => {
    expect(readDecibels([{ laeq: 0 }, { laeq: 999 }])).toBeNull();
  });

  it("geeft null zonder meetwaarde", () => {
    expect(readDecibels({ status: "ok" })).toBeNull();
  });
});

describe("openingWindowPhase", () => {
  // Alles in UTC opgeschreven; de functie rekent naar Brusselse tijd, dus deze
  // verwachtingen mogen niet afhangen van de tijdzone van de testmachine.
  const cases: Array<[string, string, OpeningWindowPhase]> = [
    ["woensdag 23:00 Brussel", "2026-08-05T21:00:00Z", "evening"],
    ["woensdag 21:59 Brussel", "2026-08-05T19:59:00Z", "closed"],
    ["donderdag 02:00 Brussel (woensdagavond)", "2026-08-06T00:00:00Z", "after-midnight"],
    ["donderdag 08:00 Brussel", "2026-08-06T06:00:00Z", "closed"],
    ["vrijdag 23:00 Brussel", "2026-08-07T21:00:00Z", "closed"],
    ["zaterdag 03:00 Brussel (vrijdagnacht)", "2026-08-08T01:00:00Z", "closed"],
    ["zaterdag 15:00 Brussel", "2026-08-08T13:00:00Z", "closed"],
    ["zondag 23:00 Brussel", "2026-08-09T21:00:00Z", "evening"],
    ["maandag 01:00 Brussel (zondagavond)", "2026-08-10T00:00:00Z", "after-midnight"],
  ];

  for (const [label, iso, expected] of cases) {
    it(`${label} -> ${expected}`, () => {
      expect(openingWindowPhase(new Date(iso))).toBe(expected);
    });
  }

  it("werkt ook in de winteruur-offset", () => {
    // 21:00 UTC is in januari 22:00 in Brussel, dus wel binnen het venster.
    expect(openingWindowPhase(new Date("2027-01-06T21:00:00Z"))).toBe("evening");
    expect(withinOpeningWindow(new Date("2027-01-06T20:59:00Z"))).toBe(false);
  });
});

describe("evaluateStatus", () => {
  const base = { now: NOW, previous: null, thresholds: THRESHOLDS, sampledAt: NOW, meterActive: true };

  it("is open bij een lopend event boven de drempel", () => {
    const state = evaluateStatus({ ...base, event: activeEvent(), decibels: 70 });
    expect(state).toMatchObject({ isOpen: true, reason: "open", currentDecibels: 70 });
  });

  it("is dicht buiten de openingsuren, hoe luid het ook is", () => {
    // Zaterdagmiddag 15:00 Brussel: een cantus of een luide poetsploeg.
    const state = evaluateStatus({
      ...base,
      event: activeEvent({ active: true }),
      decibels: 95,
      now: new Date("2026-08-08T13:00:00Z"),
      sampledAt: new Date("2026-08-08T13:00:00Z"),
    });
    expect(state).toMatchObject({ isOpen: false, reason: "outside-hours", currentDecibels: null });
  });

  it("laat een open bar niet doorlopen tot na het venster", () => {
    const state = evaluateStatus({
      ...base,
      event: activeEvent(),
      decibels: 90,
      now: new Date("2026-08-06T06:00:00Z"), // 08:00 Brussel
      sampledAt: new Date("2026-08-06T06:00:00Z"),
      previous: { isOpen: true, quietCycles: 0 },
    });
    expect(state).toMatchObject({ isOpen: false, reason: "outside-hours" });
  });

  it("is dicht wanneer er geen event is", () => {
    expect(evaluateStatus({ ...base, event: null, decibels: 80 })).toMatchObject({
      isOpen: false,
      reason: "no-event",
    });
  });

  it("is dicht wanneer er geen event loopt", () => {
    expect(
      evaluateStatus({ ...base, event: activeEvent({ active: false }), decibels: 80 })
    ).toMatchObject({ isOpen: false, reason: "event-inactive" });
  });

  it("is dicht wanneer de meter niets doorstuurt", () => {
    expect(
      evaluateStatus({ ...base, event: activeEvent(), decibels: 80, meterActive: false })
    ).toMatchObject({ isOpen: false, reason: "meter-offline" });
  });

  it("is dicht bij een te stille meting", () => {
    expect(evaluateStatus({ ...base, event: activeEvent(), decibels: 48 })).toMatchObject({
      isOpen: false,
      reason: "too-quiet",
    });
  });

  it("is dicht bij een verouderde meting, ook als ze luid was", () => {
    const state = evaluateStatus({
      ...base,
      event: activeEvent(),
      decibels: 90,
      sampledAt: new Date(NOW.getTime() - 20 * 60_000),
    });
    expect(state).toMatchObject({ isOpen: false, reason: "measurement-stale" });
  });

  it("blijft open tussen de drempels in (hysterese)", () => {
    const state = evaluateStatus({
      ...base,
      event: activeEvent(),
      decibels: 62,
      previous: { isOpen: true, quietCycles: 0 },
    });
    expect(state).toMatchObject({ isOpen: true, quietCycles: 0 });
  });

  it("sluit pas na twee stille cycli op rij", () => {
    const first = evaluateStatus({
      ...base,
      event: activeEvent(),
      decibels: 50,
      previous: { isOpen: true, quietCycles: 0 },
    });
    expect(first).toMatchObject({ isOpen: true, quietCycles: 1 });

    const second = evaluateStatus({
      ...base,
      event: activeEvent(),
      decibels: 50,
      previous: { isOpen: first.isOpen, quietCycles: first.quietCycles },
    });
    expect(second).toMatchObject({ isOpen: false, reason: "too-quiet" });
  });

  it("opent niet vanuit gesloten toestand op een waarde tussen de drempels", () => {
    const state = evaluateStatus({
      ...base,
      event: activeEvent(),
      decibels: 62,
      previous: { isOpen: false, quietCycles: 0 },
    });
    expect(state.isOpen).toBe(false);
  });
});

describe("cache-helpers", () => {
  const stored: BarStatusState = {
    isOpen: true,
    currentDecibels: 70,
    lastUpdated: NOW.toISOString(),
    quietCycles: 0,
    eventId: "486097",
    reason: "open",
  };

  it("herkent een verouderde cache", () => {
    expect(isStale(stored.lastUpdated, new Date(NOW.getTime() + 5 * 60_000), 15 * 60_000)).toBe(false);
    expect(isStale(stored.lastUpdated, new Date(NOW.getTime() + 20 * 60_000), 15 * 60_000)).toBe(true);
    expect(isStale("geen datum", NOW, 15 * 60_000)).toBe(true);
  });

  it("leest een opgeslagen status terug", () => {
    expect(parseStoredStatus(stored)).toEqual(stored);
  });

  it("weigert onbruikbare opgeslagen waarden", () => {
    expect(parseStoredStatus(null)).toBeNull();
    expect(parseStoredStatus({ isOpen: true })).toBeNull();
    expect(parseStoredStatus({ lastUpdated: "onzin" })).toBeNull();
  });
});
