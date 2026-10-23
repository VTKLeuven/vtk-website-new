import { describe, expect, it } from "vitest";
import {
  LIGHTROOM_BLOCKERS,
  lightroomPollMs,
  lightroomView,
  parseLightroomStatus,
  type LightroomStatus,
} from "@/lib/lightroom-view";
import { LIGHTROOM_COPY } from "@/components/lightroom/LightroomCard";

/** Een antwoord zoals kenny het geeft (`lightroom-vm status --json`), met overschrijvingen. */
function kenny(overrides: Record<string, unknown> = {}): LightroomStatus {
  const status = parseLightroomStatus({
    state: "off",
    vm: "off",
    since: 1_792_791_220.4,
    gpu: { "0000:81:00.0": "nvidia" },
    vllm: "running",
    connect_url: null,
    message: null,
    idle_limit_minutes: 30,
    ready: false,
    started_by: null,
    can_start: true,
    blockers: [],
    blocker_codes: [],
    ...overrides,
  });
  if (!status) throw new Error("sample did not parse");
  return status;
}

describe("parseLightroomStatus", () => {
  it("reads what kenny sends", () => {
    const s = kenny({
      state: "running",
      ready: true,
      started_by: "Jan",
      parsec_users: ["jan#1"],
      hibernate_in_minutes: 12.5,
    });
    expect(s).toMatchObject({
      state: "running",
      ready: true,
      startedBy: "Jan",
      parsecUsers: ["jan#1"],
      hibernateInMinutes: 12.5,
      idleLimitMinutes: 30,
    });
  });

  it("refuses something that is not a status", () => {
    expect(parseLightroomStatus(null)).toBeNull();
    expect(parseLightroomStatus("off")).toBeNull();
    expect(parseLightroomStatus({ error: "unauthorised" })).toBeNull();
  });

  it("falls back on fields that are missing or of the wrong type", () => {
    // Zo antwoordt kenny's stop: enkel de toestand.
    const s = parseLightroomStatus({ state: "stopping" });
    expect(s).toMatchObject({ ready: false, canStart: false, parsecUsers: [], blockers: [], idleLimitMinutes: 30 });
    expect(parseLightroomStatus({ state: "running", parsec_users: null, ready: "yes" })).toMatchObject({
      parsecUsers: [],
      ready: false,
    });
  });

  it("turns a blocker code it does not know into check_failed, once", () => {
    expect(kenny({ blocker_codes: ["job", "new_reason", "other_new"] }).blockers).toEqual(["job", "check_failed"]);
  });
});

describe("lightroomView", () => {
  it("offers a start when kenny allows one", () => {
    expect(lightroomView(kenny())).toMatchObject({ kind: "off", canStart: true });
  });

  it("says why when kenny refuses", () => {
    const view = lightroomView(
      kenny({ can_start: false, blocker_codes: ["job"], blockers: ["a GPU job is running"] }),
    );
    expect(view).toMatchObject({ kind: "off", canStart: false, blockers: ["job"], details: ["a GPU job is running"] });
  });

  it("keeps saying starting until Windows answers", () => {
    expect(lightroomView(kenny({ state: "starting" })).kind).toBe("starting");
    expect(lightroomView(kenny({ state: "running", ready: false })).kind).toBe("starting");
    expect(lightroomView(kenny({ state: "running", ready: true })).kind).toBe("ready");
  });

  it("shows maintenance for the console and for a VM IT started by hand", () => {
    expect(lightroomView(kenny({ state: "console" })).kind).toBe("maintenance");
    expect(lightroomView(kenny({ state: "off", can_start: false, blocker_codes: ["maintenance"] })).kind).toBe(
      "maintenance",
    );
  });

  it("shows a VM that would not sleep as an error, with kenny's message", () => {
    expect(lightroomView(kenny({ state: "error", message: "stuck" }))).toEqual({ kind: "error", message: "stuck" });
  });
});

describe("lightroomPollMs", () => {
  it("asks quickly while something changes and slowly otherwise", () => {
    expect(lightroomPollMs({ kind: "starting", since: null, startedBy: null })).toBe(5_000);
    expect(lightroomPollMs({ kind: "stopping" })).toBe(5_000);
    expect(lightroomPollMs(lightroomView(kenny()))).toBe(30_000);
  });
});

describe("LIGHTROOM_COPY", () => {
  it.each(["nl", "en"] as const)("has %s words for every blocker kenny can send", (locale) => {
    for (const code of LIGHTROOM_BLOCKERS) expect(LIGHTROOM_COPY[locale].blockers[code]).toBeTruthy();
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LightroomPreview } from "@/components/lightroom/LightroomPreview";

// De voorvertoning op /admin/it/flows rendert de echte kaart in de toestanden
// die je zelden ziet; zo breekt geen van die toestanden ongemerkt.
describe("LightroomPreview", () => {
  it.each(["nl", "en"] as const)("renders every rare state in %s", (locale) => {
    const html = renderToStaticMarkup(createElement(LightroomPreview, { locale }));
    const t = LIGHTROOM_COPY[locale];
    for (const text of [t.blockedTitle, t.blockers.job, t.startingTitle, t.readyTitle, t.errorTitle]) {
      expect(html).toContain(text.replaceAll("'", "&#x27;"));
    }
    expect(html).toContain("1:35");
    expect(html).toContain("commu_lid#12345678");
  });
});
