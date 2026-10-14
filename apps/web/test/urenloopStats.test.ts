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
  const now = new Date("2026-10-20T21:00:00.000Z");

  it("rejects payloads when no edition is configured or eventStart is outside the edition window", () => {
    expect(
      shouldAcceptUrenloopStats({
        incoming: samplePayload(),
        incomingDeviceId: "dev-1",
        existing: null,
        config: { startsAt: null, endsAt: null, showResultsUntil: null },
        now,
      }),
    ).toEqual({ accept: false, reason: "OUTSIDE_EDITION_WINDOW" });

    expect(
      shouldAcceptUrenloopStats({
        incoming: samplePayload({ eventStart: "2025-10-20T18:00:00.000Z" }),
        incomingDeviceId: "dev-1",
        existing: null,
        config: sampleConfig,
        now,
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
      now,
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
      now,
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
  it("returns countdown before any stats arrive, live during the race, and null after showResultsUntil", () => {
    const preRace = resolvePublicUrenloopState(
      sampleConfig,
      null,
      new Date("2026-10-19T12:00:00.000Z"),
    );
    expect(preRace?.phase).toBe("countdown");

    const stored: StoredUrenloopStats = {
      payload: samplePayload(),
      receivedAt: "2026-10-20T20:00:00.000Z",
      deviceId: "dev-1",
      deviceLabel: "PISTE-1",
      deviceEmail: "sport@vtk.be",
    };

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
