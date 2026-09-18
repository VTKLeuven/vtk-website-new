import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIFTS_BAND_SETTING,
  readShiftsBandSetting,
} from "@/lib/home/shiftBand";

describe("shiftBand settings", () => {
  it("geeft standaardwaarden terug bij ongeldige of ontbrekende input", () => {
    expect(readShiftsBandSetting(null)).toEqual(DEFAULT_SHIFTS_BAND_SETTING);
    expect(readShiftsBandSetting(undefined)).toEqual(DEFAULT_SHIFTS_BAND_SETTING);
    expect(readShiftsBandSetting("string")).toEqual(DEFAULT_SHIFTS_BAND_SETTING);
    expect(readShiftsBandSetting([])).toEqual(DEFAULT_SHIFTS_BAND_SETTING);
  });

  it("leest geldige zichtbaarheid correct uit", () => {
    expect(readShiftsBandSetting({ visible: true })).toEqual({ visible: true });
    expect(readShiftsBandSetting({ visible: false })).toEqual({ visible: false });
  });

  it("beschouwt ontbrekende visible property als true", () => {
    expect(readShiftsBandSetting({})).toEqual({ visible: true });
  });
});
