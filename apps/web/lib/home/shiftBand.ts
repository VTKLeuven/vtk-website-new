/**
 * Instellingen voor de shiften-band op de homepage.
 *
 * De shiften-band toont tot 4 openstaande shiften voor de komende 7 dagen
 * tussen de aftermovies en de career-sectie. Deze instelling laat de redactie
 * toe om de band tijdelijk of permanent uit te schakelen vanaf Admin -> Website -> Homepage.
 */

export const SHIFTS_BAND_SETTING = "home.shiftsBand";

export type ShiftsBandSetting = {
  visible: boolean;
};

export const DEFAULT_SHIFTS_BAND_SETTING: ShiftsBandSetting = {
  visible: true,
};

export function readShiftsBandSetting(value: unknown): ShiftsBandSetting {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_SHIFTS_BAND_SETTING;
  }
  const record = value as Record<string, unknown>;
  return {
    visible: record.visible !== false,
  };
}
