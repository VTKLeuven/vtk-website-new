import { describe, expect, it } from "vitest";
import {
  CURSUSDIENST_SHIFT_POST,
  bonnetjesForShift,
  mapCudiShift,
  parseCudiShiftSyncBody,
} from "@/lib/cudiShiftMirror";

const at = (hhmm: string) => new Date(`2026-07-21T${hhmm}:00.000Z`);

describe("bonnetjesForShift (1 bonnetje per begonnen uur)", () => {
  it("rounds up per started hour", () => {
    expect(bonnetjesForShift(at("10:00"), at("11:00"))).toBe(1); // 1u00
    expect(bonnetjesForShift(at("10:00"), at("11:30"))).toBe(2); // 1u30
    expect(bonnetjesForShift(at("10:00"), at("12:00"))).toBe(2); // 2u00
    expect(bonnetjesForShift(at("10:00"), at("12:01"))).toBe(3); // 2u01
    expect(bonnetjesForShift(at("10:00"), at("10:01"))).toBe(1); // net gestart
  });

  it("is 0 for a zero/negative duration", () => {
    expect(bonnetjesForShift(at("10:00"), at("10:00"))).toBe(0);
    expect(bonnetjesForShift(at("11:00"), at("10:00"))).toBe(0);
  });
});

describe("mapCudiShift", () => {
  it("derives reward + post and maps maxShifters → maxParticipants", () => {
    const data = mapCudiShift({
      sourceId: "cudi-1",
      name: "Cursusdienst balie",
      startTime: "2026-07-21T10:00:00.000Z",
      endTime: "2026-07-21T11:30:00.000Z",
      location: null,
      description: null,
      maxShifters: 3,
    });
    expect(data).toMatchObject({
      name: "Cursusdienst balie",
      location: "", // non-null op main
      description: "",
      maxParticipants: 3,
      reward: 2, // 1u30 → 2
      post: CURSUSDIENST_SHIFT_POST,
      sourceSystem: "cudi",
      sourceId: "cudi-1",
    });
    expect(data.startTime).toBeInstanceOf(Date);
  });
});

describe("parseCudiShiftSyncBody", () => {
  const validShift = {
    sourceId: "cudi-1",
    name: "Balie",
    startTime: "2026-07-21T10:00:00.000Z",
    endTime: "2026-07-21T12:00:00.000Z",
    maxShifters: 2,
  };

  it("accepts a well-formed body and an empty shift set", () => {
    const parsed = parseCudiShiftSyncBody({
      cutoff: "2026-07-21T00:00:00.000Z",
      shifts: [validShift],
    });
    expect(parsed?.shifts).toHaveLength(1);
    expect(parsed?.cutoff).toBeInstanceOf(Date);

    expect(parseCudiShiftSyncBody({ cutoff: "2026-07-21T00:00:00.000Z", shifts: [] })?.shifts).toEqual([]);
  });

  it("rejects malformed bodies", () => {
    expect(parseCudiShiftSyncBody(null)).toBeNull();
    expect(parseCudiShiftSyncBody({ shifts: [validShift] })).toBeNull(); // geen cutoff
    expect(parseCudiShiftSyncBody({ cutoff: "not-a-date", shifts: [] })).toBeNull();
    expect(parseCudiShiftSyncBody({ cutoff: "2026-07-21T00:00:00.000Z", shifts: "x" })).toBeNull();
    expect(
      parseCudiShiftSyncBody({
        cutoff: "2026-07-21T00:00:00.000Z",
        shifts: [{ ...validShift, startTime: "nope" }],
      }),
    ).toBeNull();
    expect(
      parseCudiShiftSyncBody({
        cutoff: "2026-07-21T00:00:00.000Z",
        shifts: [{ ...validShift, maxShifters: "2" }],
      }),
    ).toBeNull();
  });
});
