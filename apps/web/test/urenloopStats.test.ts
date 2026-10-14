import { describe, expect, it } from "vitest";
import {
  hasUrenloopMarker,
  resolvePublicUrenloopState,
  shouldAcceptUrenloopStats,
  splitOnUrenloopMarker,
  stripUrenloopMarker,
  urenloopStatsPayloadSchema,
  type StoredUrenloopStats,
  type UrenloopConfig,
  type UrenloopStatsPayload,
} from "@/lib/urenloop/stats";

function samplePayload(
  overrides: Partial<UrenloopStatsPayload> = {},
): UrenloopStatsPayload {
  return {
    eventStart: "2026-10-20T18:00:00.000Z",
    endsAt: "2026-10-21T18:00:00.000Z",
    generatedAt: "2026-10-20T20:00:00.000Z",
    lastLapAt: "2026-10-20T19:59:30.000Z",
    final: false,
    frozenAt: null,
    totals: { laps: 100, km: 53 },
    mostLaps: [{ name: "Jan Peeters", laps: 12 }],
    fastestLap: [{ name: "Piet Janssens", seconds: 68.42, time: "1:08.42" }],
    firstYearMostLaps: [{ name: "Koen Maes", laps: 8 }],
    groups: [{ name: "Speedyteam", laps: 40 }],
    ...overrides,
  };
}

const sampleConfig: UrenloopConfig = {
  startsAt: "2026-10-20T18:00:00.000Z",
  endsAt: "2026-10-21T18:00:00.000Z",
  showResultsUntil: "2026-10-28T18:00:00.000Z",
};

describe("[[24urenloop]] markdown marker", () => {
  it("splits on a standalone [[24urenloop]] line and ignores inline mentions", () => {
    const md = "Intro over de 24 urenloop met [[24urenloop]] in een zin.\n\n[[24urenloop]]\n\nSlot.";
    expect(hasUrenloopMarker(md)).toBe(true);
    const split = splitOnUrenloopMarker(md);
    expect(split.before).toBe("Intro over de 24 urenloop met [[24urenloop]] in een zin.");
    expect(split.after).toBe("Slot.");
  });

  it("strips the marker cleanly when outside the display window", () => {
    const md = "Voor.\n\n[[24urenloop]]\n\nNa.";
    expect(stripUrenloopMarker(md)).toBe("Voor.\n\nNa.");
  });
});

describe("urenloopStatsPayloadSchema", () => {
  it("accepts a valid payload and rejects malformed ones", () => {
    expect(urenloopStatsPayloadSchema.safeParse(samplePayload()).success).toBe(true);
    expect(
      urenloopStatsPayloadSchema.safeParse({
        ...samplePayload(),
        totals: { laps: -1, km: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("shouldAcceptUrenloopStats", () => {
  const nowDuringRace = new Date("2026-10-20T21:00:00.000Z");

  it("accepts pre-race test pushes before startsAt so /admin/24urenloop can test the connection", () => {
    expect(
      shouldAcceptUrenloopStats({
        incoming: samplePayload({ eventStart: "2026-10-20T14:00:00.000Z" }),
        incomingDeviceId: "dev-1",
        existing: null,
        config: sampleConfig,
        now: new Date("2026-10-20T14:05:00.000Z"),
      }),
    ).toEqual({ accept: true });

    expect(
      shouldAcceptUrenloopStats({
        incoming: samplePayload({ eventStart: "2026-10-14T15:00:00.000Z" }),
        incomingDeviceId: "dev-1",
        existing: null,
        config: { startsAt: null, endsAt: null, showResultsUntil: null },
        now: new Date("2026-10-14T15:05:00.000Z"),
      }),
    ).toEqual({ accept: true });
  });

  it("rejects payloads from a previous year's edition once startsAt has passed", () => {
    expect(
      shouldAcceptUrenloopStats({
        incoming: samplePayload({ eventStart: "2025-10-20T18:00:00.000Z" }),
        incomingDeviceId: "dev-1",
        existing: null,
        config: sampleConfig,
        now: nowDuringRace,
      }),
    ).toEqual({ accept: false, reason: "OUTSIDE_EDITION_WINDOW" });
  });

  it("rejects a stale backup laptop with an older lastLapAt on the same run", () => {
    const existing: StoredUrenloopStats = {
      payload: samplePayload({ lastLapAt: "2026-10-20T20:30:00.000Z" }),
      receivedAt: "2026-10-20T20:30:05.000Z",
      deviceId: "dev-primary",
      deviceLabel: "PISTE-1",
      deviceEmail: "sport@vtk.be",
    };

    const decision = shouldAcceptUrenloopStats({
      incoming: samplePayload({ lastLapAt: "2026-10-20T20:10:00.000Z" }),
      incomingDeviceId: "dev-backup",
      existing,
      config: sampleConfig,
      now: nowDuringRace,
    });
    expect(decision).toEqual({ accept: false, reason: "STALE_BACKUP_DEVICE" });
  });

  it("allows the same timing laptop to lower lastLapAt after deleting a lap", () => {
    const existing: StoredUrenloopStats = {
      payload: samplePayload({ lastLapAt: "2026-10-20T20:30:00.000Z" }),
      receivedAt: "2026-10-20T20:30:05.000Z",
      deviceId: "dev-primary",
      deviceLabel: "PISTE-1",
      deviceEmail: "sport@vtk.be",
    };

    const decision = shouldAcceptUrenloopStats({
      incoming: samplePayload({ lastLapAt: "2026-10-20T20:28:00.000Z" }),
      incomingDeviceId: "dev-primary",
      existing,
      config: sampleConfig,
      now: nowDuringRace,
    });
    expect(decision).toEqual({ accept: true });
  });

  it("rejects non-final payloads from another laptop once final is stored", () => {
    const existing: StoredUrenloopStats = {
      payload: samplePayload({
        final: true,
        lastLapAt: "2026-10-21T18:01:00.000Z",
      }),
      receivedAt: "2026-10-21T18:01:05.000Z",
      deviceId: "dev-primary",
      deviceLabel: "PISTE-1",
      deviceEmail: "sport@vtk.be",
    };

    const decision = shouldAcceptUrenloopStats({
      incoming: samplePayload({
        final: false,
        lastLapAt: "2026-10-21T18:01:00.000Z",
      }),
      incomingDeviceId: "dev-backup",
      existing,
      config: sampleConfig,
      now: new Date("2026-10-21T18:05:00.000Z"),
    });
    expect(decision).toEqual({ accept: false, reason: "ALREADY_FINAL" });
  });
});

describe("resolvePublicUrenloopState", () => {
  it("stays on countdown before startsAt even when stats are stored, and shows the app's live standings once startsAt has passed", () => {
    const stored: StoredUrenloopStats = {
      payload: samplePayload(),
      receivedAt: "2026-10-20T20:00:00.000Z",
      deviceId: "dev-1",
      deviceLabel: "PISTE-1",
      deviceEmail: "sport@vtk.be",
    };

    // Before startsAt: public site stays on countdown even if stats were pushed
    const beforeStartGun = resolvePublicUrenloopState(
      sampleConfig,
      stored,
      new Date("2026-10-20T15:00:00.000Z"),
    );
    expect(beforeStartGun?.phase).toBe("countdown");

    // Once startsAt has passed: public site shows the live standings from the app
    const freshLive = resolvePublicUrenloopState(
      sampleConfig,
      stored,
      new Date("2026-10-20T20:05:00.000Z"),
    );
    expect(freshLive?.phase).toBe("live");
    if (freshLive?.phase === "live") {
      expect(freshLive.stale).toBe(false);
    }

    const staleLive = resolvePublicUrenloopState(
      sampleConfig,
      stored,
      new Date("2026-10-20T20:20:00.000Z"),
    );
    expect(staleLive?.phase).toBe("live");
    if (staleLive?.phase === "live") {
      expect(staleLive.stale).toBe(true);
    }

    const expired = resolvePublicUrenloopState(
      sampleConfig,
      stored,
      new Date("2026-10-29T00:00:00.000Z"),
    );
    expect(expired).toBeNull();
  });
});

