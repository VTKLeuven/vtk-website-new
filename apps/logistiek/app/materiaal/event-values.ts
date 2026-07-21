// Plain (niet-'use client') module zodat zowel server- als client-componenten
// deze helpers/typen kunnen gebruiken.

export type RequesterOption = { id: string; name: string };

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
    // Heeft het lid posten, dan is INTERN de logische default; anders EXTERN.
    // Het echte aanvragertype wordt server-side afgeleid uit de login.
    requesterType: groups.length > 0 ? 'INTERN' : 'EXTERN',
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
