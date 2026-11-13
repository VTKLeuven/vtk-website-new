/**
 * Hoe de openingsurenband op de homepage eruitziet, te kiezen in /admin/home.
 * Beide tonen hetzelfde (vandaag op een tijdas met de nu-lijn, de week, de
 * statuszin en de knoppen); enkel de vorm verschilt.
 *
 * - `strips`, week in strepen: per dienst een kolom met de week als dunne rijen
 *   op dezelfde as, vandaag de dikste rij. De standaard.
 * - `plain`, zonder kader: per dienst een rij op de band, vandaag als dunne lijn
 *   en de week als tekst eronder, met één nu-lijn door alle diensten.
 *
 * Zonder rij in `Setting` is het `strips`. Zie docs/design-decisions.md.
 */

export const HOURS_LAYOUT_SETTING = "home.hoursLayout";

export const HOURS_LAYOUTS = ["strips", "plain"] as const;
export type HoursLayout = (typeof HOURS_LAYOUTS)[number];

export const DEFAULT_HOURS_LAYOUT: HoursLayout = "strips";

export type HoursLayoutSetting = { layout: HoursLayout };

export function isHoursLayout(value: unknown): value is HoursLayout {
  return typeof value === "string" && (HOURS_LAYOUTS as readonly string[]).includes(value);
}

export function readHoursLayoutSetting(value: unknown): HoursLayoutSetting {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { layout: DEFAULT_HOURS_LAYOUT };
  }
  const layout = (value as Record<string, unknown>).layout;
  return { layout: isHoursLayout(layout) ? layout : DEFAULT_HOURS_LAYOUT };
}
