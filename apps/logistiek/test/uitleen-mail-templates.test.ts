import { describe, expect, it } from 'vitest';
import {
  reservationDecisionMail,
  reservationRequestSummary,
  teamDigestMail,
  tripCancelledDriverMail,
  tripDecisionMail,
  tripHandoverMail,
  tripRequestSummary,
} from '@vtk/mail/logistiek';

/**
 * De teksten van de uitleendienst, als pure functies in `@vtk/mail/logistiek`.
 *
 * Volledige teksten en geen `toContain`: deze functies werden uit
 * `lib/uitleen-mail.ts` gehaald zodat /admin/it/flows ze kan tonen, en die
 * verhuis mocht geen woord veranderen. Wie een tekst bewust wijzigt, past de
 * verwachting hier mee aan.
 */

const BASE = 'https://logistiek.vtk.be';

describe('naar de aanvrager', () => {
  it('materiaal goedgekeurd, met opmerkingen per item en wat niet toegekend is apart', () => {
    const mail = reservationDecisionMail({
      locale: 'nl',
      recipientName: 'Arthur',
      event: 'APPROVED',
      requestName: 'Galabal',
      pickupDate: 'vr 9 okt 2026',
      returnDate: 'ma 12 okt 2026',
      lines: [
        { quantity: 4, name: 'Tafel', note: 'liefst de lange', adminNote: null },
        { quantity: 2, name: 'Spot', adminNote: 'staat klaar bij het rek' },
        { quantity: 1, name: 'Rookmachine', adminNote: 'kapot', refused: true },
      ],
      flesserkeLines: [{ quantity: 3, name: 'Bak cola' }],
      baseUrl: BASE,
    });
    expect(mail.subject).toBe('VTK Logistiek: Galabal goedgekeurd');
    expect(mail.text).toBe(
      [
        'Dag Arthur,',
        'Je aanvraag is goedgekeurd.',
        'Aanvraag: Galabal\nPeriode: vr 9 okt 2026 - ma 12 okt 2026',
        'Materiaal:\n- 4 x Tafel (liefst de lange)\n- 2 x Spot (staat klaar bij het rek)\n- 3 x Bak cola\n\nNiet toegekend:\n- 1 x Rookmachine (kapot)',
        `Je aanvraag bekijken: ${BASE}/reservaties\n\nGroeten,\nLogistiek VTK`,
      ].join('\n\n')
    );
  });

  it('afgewezen in het Engels, met de reden', () => {
    const mail = reservationDecisionMail({
      locale: 'en',
      recipientName: 'Sam',
      event: 'REJECTED',
      requestName: 'Quiz',
      pickupDate: 'Fri 9 October 2026',
      returnDate: 'Mon 12 October 2026',
      lines: [],
      detail: 'Everything is booked that weekend.',
      baseUrl: BASE,
    });
    expect(mail.subject).toBe('VTK Logistiek: Quiz rejected');
    expect(mail.text).toBe(
      [
        'Hi Sam,',
        'Your request has been rejected.',
        'Request: Quiz\nPeriod: Fri 9 October 2026 - Mon 12 October 2026',
        'Reason: Everything is booked that weekend.',
        `View your request: ${BASE}/reservaties\n\nRegards,\nLogistics VTK`,
      ].join('\n\n')
    );
  });

  it('rit goedgekeurd: wat het team veranderde staat bovenaan', () => {
    const mail = tripDecisionMail({
      locale: 'nl',
      recipientName: 'Arthur',
      event: 'APPROVED',
      purpose: 'Tafels naar de zaal',
      legs: [
        { leg: 'HEEN', start: 'za 10 okt 2026 14:00', end: 'za 10 okt 2026 16:00', vehicle: 'Kar' },
        { leg: 'TERUG', start: 'zo 11 okt 2026 10:00', end: 'zo 11 okt 2026 12:00', vehicle: 'Kar' },
      ],
      teamChanges: ['Uren verschoven naar 14:00'],
      baseUrl: BASE,
    });
    expect(mail.subject).toBe('VTK Logistiek: Tafels naar de zaal goedgekeurd');
    expect(mail.text).toBe(
      [
        'Dag Arthur,',
        'Je rit is goedgekeurd.',
        'Logistiek paste je aanvraag aan:\n- Uren verschoven naar 14:00',
        'Rit: Tafels naar de zaal',
        '- Heenrit: za 10 okt 2026 14:00 - za 10 okt 2026 16:00 (Kar)\n- Terugrit: zo 11 okt 2026 10:00 - zo 11 okt 2026 12:00 (Kar)',
        `Je rit bekijken: ${BASE}/ritten\n\nGroeten,\nLogistiek VTK`,
      ].join('\n\n')
    );
  });

  it('een wijziging zegt wat er veranderde', () => {
    const mail = tripDecisionMail({
      locale: 'nl',
      recipientName: 'Arthur',
      event: 'EDITED',
      purpose: 'Vaten',
      legs: [{ leg: null, start: 'a', end: 'b', vehicle: 'Auto' }],
      detail: 'Voertuig: Kar → Auto',
      baseUrl: BASE,
    });
    expect(mail.text).toContain('Logistiek heeft je rit aangepast.');
    expect(mail.text).toContain('- Rit: a - b (Auto)');
    expect(mail.text).toContain('Wat er veranderde:\nVoertuig: Kar → Auto');
  });
});

const TRIP = {
  title: 'Tafels naar de zaal',
  eventName: 'Galabal',
  start: 'za 10 okt 2026 14:00',
  end: 'za 10 okt 2026 16:00',
  startDate: 'za 10 okt 2026',
  vehicle: 'Kar',
  pickupAddress: 'Logikot',
  destination: 'Zaal Alma 3',
  cargoNote: '20 tafels',
};

describe('naar een post of een chauffeur', () => {
  it('rit doorgegeven aan een post, zonder aanhef voor een gedeelde mailbox', () => {
    const mail = tripHandoverMail({
      locale: 'nl',
      recipientName: '',
      groupName: 'Sport',
      trip: TRIP,
      adminNote: 'Sleutel ligt in de bak',
      baseUrl: BASE,
    });
    expect(mail.subject).toBe('VTK Logistiek: chauffeur gezocht voor Tafels naar de zaal (za 10 okt 2026)');
    expect(mail.text).toBe(
      [
        'Logistiek heeft een rit met Kar doorgegeven aan Sport. Jullie duiden zelf de chauffeur aan (en eventuele bijrijders).',
        'Rit: Tafels naar de zaal\nEvenement: Galabal\nWanneer: za 10 okt 2026 14:00 - za 10 okt 2026 16:00\nLaadadres: Logikot\nBestemming: Zaal Alma 3\nLading: 20 tafels\nVan Logistiek: Sleutel ligt in de bak',
        `Chauffeur invullen: ${BASE}/ritten`,
        'Groeten,\nLogistiek VTK',
      ].join('\n\n')
    );
  });

  it('de chauffeur van een geannuleerde rit', () => {
    const mail = tripCancelledDriverMail({ locale: 'nl', recipientName: 'Jonas', trip: TRIP, baseUrl: BASE });
    expect(mail.subject).toBe('VTK Logistiek: rit geannuleerd, Tafels naar de zaal (za 10 okt 2026)');
    expect(mail.text).toBe(
      [
        'Dag Jonas,',
        'De aanvrager heeft een rit geannuleerd waarop jij als chauffeur stond. Je hoeft ze niet meer te rijden.',
        'Rit: Tafels naar de zaal\nEvenement: Galabal\nWanneer: za 10 okt 2026 14:00 - za 10 okt 2026 16:00\nVoertuig: Kar\nLaadadres: Logikot\nBestemming: Zaal Alma 3',
        `Je ritten: ${BASE}/ritten`,
        'Groeten,\nLogistiek VTK',
      ].join('\n\n')
    );
    expect(tripCancelledDriverMail({ locale: 'en', recipientName: 'Jo', trip: TRIP, baseUrl: BASE }).subject).toBe(
      'VTK Logistiek: trip cancelled, Tafels naar de zaal (za 10 okt 2026)'
    );
  });
});

describe('naar het team', () => {
  const reservation = (cancelled?: { wasApproved: boolean }) =>
    reservationRequestSummary({
      id: 'r1',
      requestName: 'Galabal',
      requester: 'Feest',
      userName: 'Arthur',
      pickupDate: 'vr 9 okt 2026',
      returnDate: 'ma 12 okt 2026',
      lines: [{ quantity: 4, name: 'Tafel' }],
      delivery: true,
      memberNote: 'Graag voor 14u',
      baseUrl: BASE,
      cancelled,
    });

  it('een nieuwe aanvraag: alles wat het team nodig heeft om te beslissen', () => {
    expect(reservation().text).toBe(
      [
        'Aanvraag: Galabal\nVan: Feest (Arthur)\nPeriode: vr 9 okt 2026 - ma 12 okt 2026',
        'Gevraagd:\n- 4 x Tafel',
        'Er is levering gevraagd.',
        'Nota van het lid:\nGraag voor 14u',
        `Beslissen: ${BASE}/beheer/aanvragen/r1`,
      ].join('\n\n')
    );
  });

  it('een geannuleerde aanvraag: enkel wat er nu nog toe doet', () => {
    expect(reservation({ wasApproved: true }).text).toBe(
      [
        'Aanvraag: Galabal\nVan: Feest (Arthur)\nPeriode: vr 9 okt 2026 - ma 12 okt 2026',
        'Ze stond al goedgekeurd; wat al klaarlag, mag terug.',
        'Was gevraagd:\n- 4 x Tafel',
        `Bekijken: ${BASE}/beheer/aanvragen/r1`,
      ].join('\n\n')
    );
  });

  const trip = (cancelled?: Parameters<typeof tripRequestSummary>[0]['cancelled']) =>
    tripRequestSummary({
      id: 't1',
      title: 'Tafels naar de zaal',
      purpose: 'Tafels naar de zaal',
      eventName: 'Galabal',
      requester: 'Feest',
      userName: 'Arthur',
      legs: [{ start: 'za 10 okt 2026 14:00', end: 'za 10 okt 2026 16:00', vehicle: 'Kar' }],
      cargoNote: '20 tafels',
      helpers: [{ name: 'Lotte', phone: '0470 00 00 00' }],
      pickupAddress: 'Logikot',
      destination: null,
      memberNote: null,
      baseUrl: BASE,
      cancelled,
    });

  it('een nieuwe rit', () => {
    expect(trip().text).toBe(
      [
        'Waarvoor: Tafels naar de zaal\nEvenement: Galabal\nVan: Feest (Arthur)',
        '- za 10 okt 2026 14:00 tot za 10 okt 2026 16:00 (Kar)',
        'Lading: 20 tafels',
        'Bijrijders: Lotte (0470 00 00 00)',
        'Van: Logikot\nNaar: niet ingevuld',
        `Beslissen: ${BASE}/beheer/vervoer?rit=t1`,
      ].join('\n\n')
    );
  });

  it('een geannuleerde rit noemt de chauffeur, of de post die nog niets weet', () => {
    expect(trip({ wasApproved: true, driverName: 'Jonas' }).text).toContain(
      'Ze stond al goedgekeurd.\nChauffeur: Jonas (kreeg een mail)'
    );
    expect(trip({ wasApproved: true, assignedGroupName: 'Sport' }).text).toContain(
      'Nog geen chauffeur; doorgegeven aan Sport. Die post kreeg over de annulatie geen mail.'
    );
    expect(trip({ wasApproved: false }).text).not.toContain('Lading:');
  });

  it('de bundel met enkel nieuwe aanvragen is de mail zoals ze altijd was', () => {
    const one = teamDigestMail({ kind: 'transport', baseUrl: BASE, requests: [trip()] });
    expect(one.subject).toBe('VTK Logistiek: nieuwe ritaanvraag, Tafels naar de zaal');
    expect(one.text).toBe(`Er is een nieuwe ritaanvraag binnengekomen op ${BASE}.\n\n${trip().text}`);

    const two = teamDigestMail({ kind: 'materiaal', baseUrl: BASE, requests: [reservation(), reservation()] });
    expect(two.subject).toBe('VTK Logistiek: 2 nieuwe materiaalaanvragen');
    expect(two.text.startsWith(`Er staan 2 nieuwe aanvragen klaar op ${BASE}.\n\n1. Galabal\n\n`)).toBe(true);
    expect(two.text).toContain('\n\n2. Galabal\n\n');
  });

  it('de bundel met annulaties, alleen of naast nieuwe aanvragen', () => {
    const only = teamDigestMail({
      kind: 'materiaal',
      baseUrl: BASE,
      requests: [],
      cancellations: [reservation({ wasApproved: true })],
    });
    expect(only.subject).toBe('VTK Logistiek: materiaalaanvraag geannuleerd, Galabal');
    expect(only.text.startsWith('De aanvrager heeft deze materiaalaanvraag geannuleerd.')).toBe(true);

    const mixed = teamDigestMail({
      kind: 'transport',
      baseUrl: BASE,
      requests: [trip(), trip()],
      cancellations: [trip({ wasApproved: false })],
    });
    expect(mixed.subject).toBe('VTK Logistiek: 2 nieuwe ritaanvragen, 1 geannuleerd');
    // Eén nummering over beide kopjes: "punt 3" is de annulatie.
    expect(mixed.text).toMatch(/Nieuw:\n\n1\. .*\n\n[\s\S]*2\. [\s\S]*Geannuleerd:\n\n3\. /);
  });
});
