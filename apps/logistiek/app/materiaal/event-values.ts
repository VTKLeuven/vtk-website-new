// Plain (niet-'use client') module zodat zowel server- als client-componenten
// deze helpers/typen kunnen gebruiken.

import type { AuthGroupType } from '@vtk/auth';

/**
 * Een groep waarnamens je kan aanvragen. `type` scheidt praesidiumposten van
 * werkgroepen in de keuzelijst; een oudere hoofdsite kan het in de sessie nog
 * niet meesturen, dus behandelen we een ontbrekend type als een post.
 */
export type RequesterOption = { id: string; name: string; type: AuthGroupType };

/**
 * De groepen uit de sessie als keuzelijst, in de taal van het lid. `type` is
 * optioneel omdat de sessie van een nog niet meegedeployde hoofdsite het veld
 * kan missen; dan tonen we de groep als post, wat de situatie van voordien is.
 */
export function requesterOptions(
  groups: Array<{ id: string; nameNl: string; nameEn: string; type?: AuthGroupType }>,
  locale: 'nl' | 'en'
): RequesterOption[] {
  return groups.map((group) => ({
    id: group.id,
    name: locale === 'en' ? group.nameEn : group.nameNl,
    type: group.type ?? 'PRAESIDIUM',
  }));
}

export function isWerkgroep(option: RequesterOption): boolean {
  return option.type === 'WERKGROEP';
}

/** Splitst de keuzelijst in posten en werkgroepen, met behoud van de volgorde. */
export function splitRequesterOptions(groups: RequesterOption[]): {
  posten: RequesterOption[];
  werkgroepen: RequesterOption[];
} {
  return {
    posten: groups.filter((group) => !isWerkgroep(group)),
    werkgroepen: groups.filter(isWerkgroep),
  };
}

export type EventReservationValues = {
  requesterType: 'INTERN' | 'WERKGROEP' | 'EXTERN';
  groupId: string;
  requesterName: string;
  eventName: string;
  eventLocation: string;
  eventStart: string;
  expectedAttendance: string;
  contactName: string;
  contactPhone: string;
  delivery: boolean;
  deliveryNote: string;
};

export function emptyEventValues(groups: RequesterOption[]): EventReservationValues {
  return {
    // Heeft het lid groepen, dan hangt het type af van de eerste: een post geeft
    // INTERN, een werkgroep WERKGROEP. Wie niets heeft, vraagt EXTERN aan. Het
    // echte aanvragertype wordt server-side opnieuw afgeleid uit de login.
    requesterType:
      groups.length === 0 ? 'EXTERN' : isWerkgroep(groups[0]) ? 'WERKGROEP' : 'INTERN',
    groupId: groups[0]?.id ?? '',
    requesterName: '',
    eventName: '',
    eventLocation: '',
    eventStart: '',
    expectedAttendance: '',
    contactName: '',
    contactPhone: '',
    delivery: false,
    deliveryNote: '',
  };
}
