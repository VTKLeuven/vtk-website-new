/**
 * De twee weergaven van /admin/bestuursorgaan, en de sleutel waaronder de
 * keuze in `UserViewPreference` staat. Los van de server actions: een
 * "use server"-bestand mag enkel async functies exporteren.
 */
export const BO_VIEWS = ["verkenner", "lijst"] as const;
export type BoView = (typeof BO_VIEWS)[number];
export const BO_VIEW_SCREEN = "bestuursorgaan";

export function parseBoView(value: string | null | undefined): BoView {
  return value === "lijst" ? "lijst" : "verkenner";
}
