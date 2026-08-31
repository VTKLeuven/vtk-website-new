/**
 * Waarop de transportplanning gefilterd kan worden, en hoe dat in de URL staat.
 *
 * Bewust een gewone module zonder `'use client'`: de server leest de filters uit
 * de query en de filterbalk schrijft ze terug, dus beide kanten hebben deze
 * constanten nodig. In een client-module wordt élke export een client-referentie,
 * ook een array (zie de comment in `app/beheer/kalender/kalender-kinds.ts`).
 *
 * **Leeg betekent alles.** Een filter die niets doet, hoort niet in de URL te
 * staan: dan blijft een gedeelde link kort, en "geen parameter" en "alles
 * aangevinkt" zijn hetzelfde ding in plaats van twee toestanden die uit elkaar
 * kunnen lopen.
 */

export const TRIP_STATUSES = ['REQUESTED', 'APPROVED', 'COMPLETED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  REQUESTED: 'Te beslissen',
  APPROVED: 'Goedgekeurd',
  COMPLETED: 'Afgerond',
};

export const REQUESTER_TYPES = ['INTERN', 'WERKGROEP', 'EXTERN'] as const;
export type RequesterType = (typeof REQUESTER_TYPES)[number];

export const REQUESTER_TYPE_FILTER_LABELS: Record<RequesterType, string> = {
  INTERN: 'Post',
  WERKGROEP: 'Werkgroep',
  EXTERN: 'Extern',
};

/**
 * De waarde voor "nog geen chauffeur" in de chauffeursfilter.
 *
 * Een sentinel en geen aparte schakelaar: "toon enkel de ritten van Arthur en de
 * ritten die nog niemand hebben" is precies de vraag waarmee je een weekend
 * indeelt, en met twee losse filters is dat een EN in plaats van een OF.
 */
export const NO_DRIVER = 'geen';

export type TransportFilters = {
  /** Leeg = alle voertuigen. */
  vehicleIds: string[];
  /** Leeg = alle chauffeurs; kan {@link NO_DRIVER} bevatten. */
  driverIds: string[];
  /** Leeg = alle statussen. */
  statuses: TripStatus[];
  /** Leeg = alle aanvragertypes. */
  requesterTypes: RequesterType[];
};

export const EMPTY_FILTERS: TransportFilters = {
  vehicleIds: [],
  driverIds: [],
  statuses: [],
  requesterTypes: [],
};

/** Komma-gescheiden lijst uit de query, zonder lege stukken. */
function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseTransportFilters(query: {
  voertuig?: string;
  chauffeur?: string;
  status?: string;
  aanvrager?: string;
}): TransportFilters {
  return {
    vehicleIds: parseList(query.voertuig),
    driverIds: parseList(query.chauffeur),
    statuses: parseList(query.status).filter((value): value is TripStatus =>
      (TRIP_STATUSES as readonly string[]).includes(value)
    ),
    requesterTypes: parseList(query.aanvrager).filter((value): value is RequesterType =>
      (REQUESTER_TYPES as readonly string[]).includes(value)
    ),
  };
}

/** Wat er in de URL komt te staan; wat leeg is, komt er niet in. */
export function filtersToQuery(filters: TransportFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.vehicleIds.length > 0) query.voertuig = filters.vehicleIds.join(',');
  if (filters.driverIds.length > 0) query.chauffeur = filters.driverIds.join(',');
  if (filters.statuses.length > 0) query.status = filters.statuses.join(',');
  if (filters.requesterTypes.length > 0) query.aanvrager = filters.requesterTypes.join(',');
  return query;
}

/** Hoeveel filters er iets doen; voor de teller op de knop op een smal scherm. */
export function countActiveFilters(filters: TransportFilters): number {
  return (
    (filters.vehicleIds.length > 0 ? 1 : 0) +
    (filters.driverIds.length > 0 ? 1 : 0) +
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.requesterTypes.length > 0 ? 1 : 0)
  );
}

export function hasActiveFilters(filters: TransportFilters): boolean {
  return countActiveFilters(filters) > 0;
}

/**
 * Wat er niet getoond wordt, in woorden.
 *
 * Zonder deze zin leest een lege kalender als "niets gepland", terwijl het "niets
 * dat aan je filters voldoet" is. Dat onderscheid is het verschil tussen een
 * rustige week en een verkeerd aangevinkt vakje.
 */
export function describeFilters(
  filters: TransportFilters,
  names: { vehicles: Map<string, string>; drivers: Map<string, string> }
): string[] {
  const parts: string[] = [];
  if (filters.vehicleIds.length > 0) {
    parts.push(
      `enkel ${filters.vehicleIds.map((id) => names.vehicles.get(id) ?? 'onbekend voertuig').join(', ')}`
    );
  }
  if (filters.driverIds.length > 0) {
    parts.push(
      `enkel ${filters.driverIds
        .map((id) => (id === NO_DRIVER ? 'ritten zonder chauffeur' : (names.drivers.get(id) ?? 'onbekende chauffeur')))
        .join(', ')}`
    );
  }
  if (filters.statuses.length > 0) {
    parts.push(`enkel ${filters.statuses.map((s) => TRIP_STATUS_LABELS[s].toLowerCase()).join(', ')}`);
  }
  if (filters.requesterTypes.length > 0) {
    parts.push(
      `enkel ${filters.requesterTypes.map((t) => REQUESTER_TYPE_FILTER_LABELS[t].toLowerCase()).join(', ')}`
    );
  }
  return parts;
}
