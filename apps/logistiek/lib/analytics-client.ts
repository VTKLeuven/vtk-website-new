import {
  LOGISTICS_DRINKS_EVENT,
  LOGISTICS_RESERVATION_EVENT,
  LOGISTICS_SEARCH_EVENT,
  LOGISTICS_TEMPLATE_EVENT,
  LOGISTICS_VAN_EVENT,
  LOGISTICS_VIEW_EVENT,
} from "./analytics";

type UmamiTracker = {
  track: (eventName: string, eventData?: Record<string, unknown>) => void;
};

function tracker(): UmamiTracker | null {
  if (typeof window === "undefined") return null;
  const umami = (window as unknown as { umami?: Partial<UmamiTracker> }).umami;
  return typeof umami?.track === "function" ? (umami as UmamiTracker) : null;
}

export function trackMaterialSearch(query: string, resultCount: number): void {
  const term = query.trim();
  if (!term) return;
  tracker()?.track(LOGISTICS_SEARCH_EVENT, { zoekterm: term, resultaten: String(resultCount) });
}

export function trackMaterialView(item: { name: string; category?: string }): void {
  tracker()?.track(LOGISTICS_VIEW_EVENT, { item: item.name, categorie: item.category ?? "" });
}

export function trackReservationSubmitted(details: { type: string; itemCount: number }): void {
  tracker()?.track(LOGISTICS_RESERVATION_EVENT, {
    type: details.type,
    aantal_items: String(details.itemCount),
  });
}

export function trackVanRequestSubmitted(details?: { vehicle?: string }): void {
  tracker()?.track(LOGISTICS_VAN_EVENT, { voertuig: details?.vehicle ?? "kar" });
}

export function trackDrinksOrderSubmitted(drinkCount: number): void {
  tracker()?.track(LOGISTICS_DRINKS_EVENT, { aantal_dranken: String(drinkCount) });
}

export function trackTemplateLoaded(templateName: string): void {
  tracker()?.track(LOGISTICS_TEMPLATE_EVENT, { sjabloon: templateName });
}
