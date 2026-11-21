/**
 * De teksten van de mails van de uitleendienst (logistiek.vtk.be).
 *
 * Pure functies: gegevens erin, `{ subject, text }` eruit. Ophalen, data
 * formatteren en versturen doet `apps/logistiek/lib/uitleen-mail.ts`; dezelfde
 * functies tonen hun voorbeeld op /admin/it/flows (`apps/web/lib/mailPreviews.ts`).
 * Daarom staan ze in een pakket en niet in de app zelf: de voorvertoning moet de
 * echte template aanroepen, en apps/web kan niet in apps/logistiek importeren.
 *
 * Data komen als tekst binnen. De uitleendienst formatteert ze met haar eigen
 * helpers (`formatDateTime` op de Brusselse klok, in apps/logistiek/lib/uitleen.ts);
 * een tweede kopie daarvan hier zou vroeg of laat afwijken.
 *
 * Platte tekst en geen opgemaakte HTML zoals de mails van vtk.be: het zijn
 * werkberichten met lijsten (materiaal, uren, bijrijders) die als tekst goed
 * lezen, en de huisstijl (`mailDesign.ts`) woont in apps/web. Zie
 * docs/design-decisions.md, "Mails van de uitleendienst".
 */

export type UitleenMailLocale = 'nl' | 'en';

/** Wat Logistiek met een aanvraag deed; elk ervan mailt de aanvrager. */
export type UitleenMailEvent = 'APPROVED' | 'REJECTED' | 'EDITED' | 'REOPENED';

/** Zoals `NOTIFY_KINDS` in apps/logistiek/lib/uitleen.ts. */
export type UitleenNotifyKind = 'materiaal' | 'flesserke' | 'transport';

export type UitleenMail = { subject: string; text: string };

/** Eén aanvraag in de teammelding: een titel voor de lijst en haar blok. */
export type UitleenDigestEntry = { title: string; text: string };

export const UITLEEN_SUBJECT_PREFIX = 'VTK Logistiek';

/**
 * Blokken aan elkaar met een lege regel ertussen. Een blok dat er niet is, valt
 * weg zonder een dubbele witregel achter te laten; daarom `null` en niet `''`
 * als "geen blok" (een lege string is hier een bewuste lege regel).
 */
function joinBlocks(blocks: Array<string | null | undefined>): string {
  return blocks.filter((block): block is string => block !== null && block !== undefined).join('\n\n');
}

/** Regels onder elkaar; een regel die er niet is, valt weg. */
function joinLines(lines: Array<string | null | undefined | false>): string {
  return lines.filter(Boolean).join('\n');
}

function greeting(name: string, locale: UitleenMailLocale): string | null {
  if (!name) return null;
  return locale !== 'en' ? `Dag ${name},` : `Hi ${name},`;
}

function signOff(locale: UitleenMailLocale): string {
  return locale !== 'en' ? 'Groeten,\nLogistiek VTK' : 'Regards,\nLogistics VTK';
}

/** Waar de mail over gaat; bepaalt of we "je aanvraag" of "je rit" schrijven. */
type MailSubject = 'reservation' | 'trip';

function eventWords(event: UitleenMailEvent, subject: MailSubject, locale: UitleenMailLocale) {
  const nl = locale !== 'en';
  const thing = nl
    ? subject === 'trip'
      ? 'je rit'
      : 'je aanvraag'
    : subject === 'trip'
      ? 'your trip'
      : 'your request';
  const Thing = thing.charAt(0).toUpperCase() + thing.slice(1);
  switch (event) {
    case 'APPROVED':
      return nl
        ? { subject: 'goedgekeurd', lead: `${Thing} is goedgekeurd.` }
        : { subject: 'approved', lead: `${Thing} has been approved.` };
    case 'REJECTED':
      return nl
        ? { subject: 'afgewezen', lead: `${Thing} is afgewezen.` }
        : { subject: 'rejected', lead: `${Thing} has been rejected.` };
    case 'EDITED':
      return nl
        ? { subject: 'aangepast', lead: `Logistiek heeft ${thing} aangepast.` }
        : { subject: 'changed', lead: `Logistics changed ${thing}.` };
    case 'REOPENED':
      return nl
        ? {
            subject: 'terug open',
            lead: `Logistiek heeft de beslissing over ${thing} teruggedraaid; ze staat weer open.`,
          }
        : {
            subject: 'reopened',
            lead: `Logistics undid the decision on ${thing}; it is open again.`,
          };
  }
}

/** Ondertekening plus de link naar het overzicht van het lid zelf. */
function memberFooter(subject: MailSubject, locale: UitleenMailLocale, baseUrl: string): string {
  const nl = locale !== 'en';
  const url = `${baseUrl}${subject === 'trip' ? '/ritten' : '/reservaties'}`;
  if (nl) {
    const what = subject === 'trip' ? 'Je rit bekijken' : 'Je aanvraag bekijken';
    return `${what}: ${url}\n\n${signOff(locale)}`;
  }
  const what = subject === 'trip' ? 'View your trip' : 'View your request';
  return `${what}: ${url}\n\n${signOff(locale)}`;
}

/**
 * De toelichting van het team, indien er een is. Bij een wijziging is dit de
 * historiekregel ("Tafel: 5 → 3", "Uren verschoven naar 14:30"): zeggen wát er
 * veranderd is, niet enkel dát er iets veranderd is. Bij een afwijzing is het
 * de reden, en bij de rest een gewone zin die geen kopje nodig heeft.
 */
function detailBlock(
  note: string | null | undefined,
  event: UitleenMailEvent,
  locale: UitleenMailLocale
): string | null {
  const text = note?.trim();
  if (!text) return null;
  const nl = locale !== 'en';
  if (event === 'EDITED') return `${nl ? 'Wat er veranderde:' : 'What changed:'}\n${text}`;
  if (event === 'REJECTED') return `${nl ? 'Reden:' : 'Reason:'} ${text}`;
  return text;
}

// ---------------------------------------------------------------------------
// Naar de aanvrager
// ---------------------------------------------------------------------------

export type ReservationMailLine = {
  quantity: number;
  name: string;
  /** De opmerking van het lid bij dit item. */
  note?: string | null;
  /** De opmerking van het team bij dit item. */
  adminNote?: string | null;
  /** Niet toegekend; staat apart onderaan. */
  refused?: boolean;
};

/**
 * Een materiaal- of flesserke-aanvraag werd beslist, aangepast of heropend.
 *
 * De opmerkingen per item horen in de mail: de aanvrager leest die mail en niet
 * het scherm, en "zie vorig event" of "graag de zwarte" is precies de afspraak
 * die daarna misloopt als ze er niet in staat. Niet toegekende items staan apart
 * onderaan, niet tussen de rest: tussen de goedgekeurde lijst gelezen worden ze
 * meegenomen naar het evenement.
 */
export function reservationDecisionMail(input: {
  locale: UitleenMailLocale;
  recipientName: string;
  event: UitleenMailEvent;
  requestName: string;
  /** Al geformatteerd, in de taal van de mail. */
  pickupDate: string;
  returnDate: string;
  lines: ReservationMailLine[];
  flesserkeLines?: Array<{ quantity: number; name: string }>;
  /** De reden (bij een afwijzing) of wat er veranderde (bij een wijziging). */
  detail?: string | null;
  baseUrl: string;
}): UitleenMail {
  const { locale } = input;
  const nl = locale !== 'en';
  const words = eventWords(input.event, 'reservation', locale);

  const lineText = (line: { quantity: number; name: string; note?: string | null; adminNote?: string | null }) => {
    const notes = [line.note, line.adminNote].filter(Boolean).join(' | ');
    return `- ${line.quantity} x ${line.name}${notes ? ` (${notes})` : ''}`;
  };
  const granted = input.lines.filter((line) => !line.refused);
  const refused = input.lines.filter((line) => line.refused);
  const items = [...granted.map(lineText), ...(input.flesserkeLines ?? []).map(lineText)].join('\n');
  const refusedBlock =
    refused.length > 0
      ? `\n\n${nl ? 'Niet toegekend:' : 'Not granted:'}\n${refused
          .map((line) => `- ${line.quantity} x ${line.name}${line.adminNote ? ` (${line.adminNote})` : ''}`)
          .join('\n')}`
      : '';

  const text = joinBlocks([
    greeting(input.recipientName, locale),
    words.lead,
    `${nl ? 'Aanvraag' : 'Request'}: ${input.requestName}\n${nl ? 'Periode' : 'Period'}: ${input.pickupDate} - ${input.returnDate}`,
    items ? `${nl ? 'Materiaal' : 'Items'}:\n${items}${refusedBlock}` : refusedBlock.trim() || null,
    detailBlock(input.detail, input.event, locale),
    memberFooter('reservation', locale, input.baseUrl),
  ]);

  return { subject: `${UITLEEN_SUBJECT_PREFIX}: ${input.requestName} ${words.subject}`, text };
}

export type TripMailLeg = {
  /** Heen- of terugrit; leeg bij een enkele rit. */
  leg: 'HEEN' | 'TERUG' | null;
  /** Al geformatteerd, in de taal van de mail. */
  start: string;
  end: string;
  vehicle: string;
};

function legLabel(leg: TripMailLeg['leg'], nl: boolean): string {
  if (leg === 'HEEN') return nl ? 'Heenrit' : 'Outbound';
  if (leg === 'TERUG') return nl ? 'Terugrit' : 'Return';
  return nl ? 'Rit' : 'Trip';
}

/**
 * Een rit werd beslist, aangepast of heropend. Eén mail voor een heen- en
 * terugrit samen: die worden samen beslist, en twee mails vlak na elkaar over
 * dezelfde aanvraag lezen als twee aanvragen.
 *
 * Bij het goedkeuren staat wat Logistiek aan de aanvraag veranderde bovenaan, en
 * niet verstopt in de lijst met uren: anders leest het lid een goedkeuring met
 * andere uren zonder te merken dat ze anders zijn.
 */
export function tripDecisionMail(input: {
  locale: UitleenMailLocale;
  recipientName: string;
  event: UitleenMailEvent;
  purpose: string;
  legs: TripMailLeg[];
  /** Wat het team aan de aanvraag veranderde; enkel bij een goedkeuring. */
  teamChanges?: string[];
  detail?: string | null;
  baseUrl: string;
}): UitleenMail {
  const { locale } = input;
  const nl = locale !== 'en';
  const words = eventWords(input.event, 'trip', locale);
  const trips = input.legs
    .map((leg) => `- ${legLabel(leg.leg, nl)}: ${leg.start} - ${leg.end} (${leg.vehicle})`)
    .join('\n');
  const changes = input.teamChanges ?? [];
  const changesBlock =
    changes.length > 0
      ? `${nl ? 'Logistiek paste je aanvraag aan:' : 'Logistics changed your request:'}\n${changes
          .map((line) => `- ${line}`)
          .join('\n')}`
      : null;

  const text = joinBlocks([
    greeting(input.recipientName, locale),
    words.lead,
    changesBlock,
    `${nl ? 'Rit' : 'Trip'}: ${input.purpose}`,
    trips,
    detailBlock(input.detail, input.event, locale),
    memberFooter('trip', locale, input.baseUrl),
  ]);

  return { subject: `${UITLEEN_SUBJECT_PREFIX}: ${input.purpose} ${words.subject}`, text };
}

// ---------------------------------------------------------------------------
// Naar een post of een chauffeur
// ---------------------------------------------------------------------------

/** Wat een chauffeur of een post over een rit moet weten, voor beide mails hieronder. */
export type TripMailFacts = {
  title: string;
  eventName?: string | null;
  /** Al geformatteerd, in de taal van de mail. */
  start: string;
  end: string;
  /** Enkel de dag, voor het onderwerp. */
  startDate: string;
  vehicle: string;
  pickupAddress?: string | null;
  destination?: string | null;
  cargoNote?: string | null;
};

/**
 * "Jullie post mag deze autorit zelf invullen", zodra Logistiek een rit aan een
 * post of werkgroep doorgeeft. Zonder naam (`recipientName` leeg) voor een
 * gedeelde mailbox: daar zit niet één persoon achter.
 */
export function tripHandoverMail(input: {
  locale: UitleenMailLocale;
  recipientName: string;
  groupName: string;
  trip: TripMailFacts;
  adminNote?: string | null;
  baseUrl: string;
}): UitleenMail {
  const { locale, trip } = input;
  const nl = locale !== 'en';
  const url = `${input.baseUrl}/ritten`;
  const text = joinBlocks([
    greeting(input.recipientName, locale),
    nl
      ? `Logistiek heeft een rit met ${trip.vehicle} doorgegeven aan ${input.groupName}. Jullie duiden zelf de chauffeur aan (en eventuele bijrijders).`
      : `Logistics assigned a trip with ${trip.vehicle} to ${input.groupName}. Your post picks the driver (and any passengers).`,
    joinLines([
      `${nl ? 'Rit' : 'Trip'}: ${trip.title}`,
      trip.eventName ? `${nl ? 'Evenement' : 'Event'}: ${trip.eventName}` : null,
      `${nl ? 'Wanneer' : 'When'}: ${trip.start} - ${trip.end}`,
      trip.pickupAddress ? `${nl ? 'Laadadres' : 'Loading address'}: ${trip.pickupAddress}` : null,
      trip.destination ? `${nl ? 'Bestemming' : 'Destination'}: ${trip.destination}` : null,
      trip.cargoNote ? `${nl ? 'Lading' : 'Cargo'}: ${trip.cargoNote}` : null,
      input.adminNote ? `${nl ? 'Van Logistiek' : 'From Logistics'}: ${input.adminNote}` : null,
    ]),
    nl ? `Chauffeur invullen: ${url}` : `Pick a driver: ${url}`,
    signOff(locale),
  ]);
  const subject = nl
    ? `${UITLEEN_SUBJECT_PREFIX}: chauffeur gezocht voor ${trip.title} (${trip.startDate})`
    : `${UITLEEN_SUBJECT_PREFIX}: driver needed for ${trip.title} (${trip.startDate})`;
  return { subject, text };
}

/**
 * De aanvrager annuleerde een rit waarop deze chauffeur stond.
 *
 * Zonder deze mail merkte de chauffeur het pas wanneer hij de planning opende,
 * en in het slechtste geval stond hij aan het logikot voor een rit die er niet
 * meer was.
 */
export function tripCancelledDriverMail(input: {
  locale: UitleenMailLocale;
  recipientName: string;
  trip: TripMailFacts;
  baseUrl: string;
}): UitleenMail {
  const { locale, trip } = input;
  const nl = locale !== 'en';
  const text = joinBlocks([
    greeting(input.recipientName, locale),
    nl
      ? 'De aanvrager heeft een rit geannuleerd waarop jij als chauffeur stond. Je hoeft ze niet meer te rijden.'
      : 'The requester cancelled a trip you were driving. You no longer need to drive it.',
    joinLines([
      `${nl ? 'Rit' : 'Trip'}: ${trip.title}`,
      trip.eventName ? `${nl ? 'Evenement' : 'Event'}: ${trip.eventName}` : null,
      `${nl ? 'Wanneer' : 'When'}: ${trip.start} - ${trip.end}`,
      `${nl ? 'Voertuig' : 'Vehicle'}: ${trip.vehicle}`,
      trip.pickupAddress ? `${nl ? 'Laadadres' : 'Loading address'}: ${trip.pickupAddress}` : null,
      trip.destination ? `${nl ? 'Bestemming' : 'Destination'}: ${trip.destination}` : null,
    ]),
    nl ? `Je ritten: ${input.baseUrl}/ritten` : `Your trips: ${input.baseUrl}/ritten`,
    signOff(locale),
  ]);
  const subject = nl
    ? `${UITLEEN_SUBJECT_PREFIX}: rit geannuleerd, ${trip.title} (${trip.startDate})`
    : `${UITLEEN_SUBJECT_PREFIX}: trip cancelled, ${trip.title} (${trip.startDate})`;
  return { subject, text };
}

// ---------------------------------------------------------------------------
// Naar het team (altijd in het Nederlands: een teamadres heeft geen taal)
// ---------------------------------------------------------------------------

/** Wat er van een geannuleerde aanvraag in de teammelding hoort. */
export type CancelledFacts = {
  /** Stond ze al goedgekeurd? Dan lag er misschien al materiaal klaar. */
  wasApproved: boolean;
};

/** De samenvatting van een materiaal- of flesserke-aanvraag voor de teammelding. */
export function reservationRequestSummary(input: {
  id: string;
  requestName: string;
  requester: string;
  userName: string;
  pickupDate: string;
  returnDate: string;
  lines: Array<{ quantity: number; name: string }>;
  delivery: boolean;
  memberNote?: string | null;
  baseUrl: string;
  /** Gezet voor een aanvraag die de aanvrager annuleerde. */
  cancelled?: CancelledFacts;
}): UitleenDigestEntry {
  const items = input.lines.map((line) => `- ${line.quantity} x ${line.name}`).join('\n');
  const url = `${input.baseUrl}/beheer/aanvragen/${input.id}`;
  return {
    title: input.requestName,
    text: joinBlocks([
      `Aanvraag: ${input.requestName}\nVan: ${input.requester} (${input.userName})\nPeriode: ${input.pickupDate} - ${input.returnDate}`,
      input.cancelled
        ? input.cancelled.wasApproved
          ? 'Ze stond al goedgekeurd; wat al klaarlag, mag terug.'
          : 'Ze was nog niet beslist.'
        : null,
      items ? `${input.cancelled ? 'Was gevraagd' : 'Gevraagd'}:\n${items}` : null,
      !input.cancelled && input.delivery ? 'Er is levering gevraagd.' : null,
      !input.cancelled && input.memberNote ? `Nota van het lid:\n${input.memberNote}` : null,
      input.cancelled ? `Bekijken: ${url}` : `Beslissen: ${url}`,
    ]),
  };
}

/** Idem voor een rit; bij een heen-en-terugaanvraag staan beide ritten erin. */
export function tripRequestSummary(input: {
  id: string;
  title: string;
  purpose: string;
  eventName?: string | null;
  requester: string;
  userName: string;
  legs: Array<{ start: string; end: string; vehicle: string }>;
  cargoNote?: string | null;
  helpers: Array<{ name: string; phone?: string | null }>;
  pickupAddress?: string | null;
  destination?: string | null;
  memberNote?: string | null;
  baseUrl: string;
  /** Gezet voor een rit die de aanvrager annuleerde. */
  cancelled?: CancelledFacts & {
    /** Wie erop stond als chauffeur; die kreeg zelf een mail. */
    driverName?: string | null;
    /** De post die de chauffeur moest kiezen, als er nog geen was. */
    assignedGroupName?: string | null;
  };
}): UitleenDigestEntry {
  const url = `${input.baseUrl}/beheer/vervoer?rit=${input.id}`;
  const cancelled = input.cancelled;
  return {
    title: input.title,
    text: joinBlocks([
      joinLines([
        `Waarvoor: ${input.purpose}`,
        input.eventName ? `Evenement: ${input.eventName}` : null,
        `Van: ${input.requester} (${input.userName})`,
      ]),
      input.legs.map((leg) => `- ${leg.start} tot ${leg.end} (${leg.vehicle})`).join('\n'),
      cancelled
        ? joinLines([
            cancelled.wasApproved ? 'Ze stond al goedgekeurd.' : 'Ze was nog niet beslist.',
            cancelled.driverName
              ? `Chauffeur: ${cancelled.driverName} (kreeg een mail)`
              : cancelled.assignedGroupName
                ? `Nog geen chauffeur; doorgegeven aan ${cancelled.assignedGroupName}. Die post kreeg over de annulatie geen mail.`
                : null,
          ])
        : null,
      !cancelled && input.cargoNote ? `Lading: ${input.cargoNote}` : null,
      !cancelled && input.helpers.length > 0
        ? `Bijrijders: ${input.helpers
            .map((helper) => `${helper.name}${helper.phone ? ` (${helper.phone})` : ''}`)
            .join(', ')}`
        : null,
      !cancelled && [input.pickupAddress, input.destination].some(Boolean)
        ? `Van: ${input.pickupAddress ?? 'niet ingevuld'}\nNaar: ${input.destination ?? 'niet ingevuld'}`
        : null,
      !cancelled && input.memberNote ? `Nota van het lid:\n${input.memberNote}` : null,
      cancelled ? `Bekijken: ${url}` : `Beslissen: ${url}`,
    ]),
  };
}

/**
 * De gebundelde melding naar het team: wat er binnenkwam, en wat de aanvrager
 * intussen annuleerde.
 *
 * Elke aanvraag houdt haar eigen blok met haar eigen link: dat is waarvoor de
 * mail bestaat. De aanhef staat er één keer boven en niet per blok; drie keer
 * "er is een nieuwe aanvraag binnengekomen" in dezelfde mail leest als drie
 * mails die per ongeluk aan elkaar geplakt zijn.
 */
export function teamDigestMail(input: {
  kind: UitleenNotifyKind;
  baseUrl: string;
  requests: UitleenDigestEntry[];
  cancellations?: UitleenDigestEntry[];
}): UitleenMail {
  const { kind, baseUrl, requests } = input;
  const cancellations = input.cancellations ?? [];
  const noun = kind === 'transport' ? 'ritaanvraag' : `${kind}aanvraag`;
  const nouns = noun.replace(/aanvraag$/, 'aanvragen');
  const numbered = (entries: UitleenDigestEntry[], offset: number) =>
    entries.map((entry, index) => `${offset + index + 1}. ${entry.title}\n\n${entry.text}`);

  // Enkel nieuwe aanvragen: de mail zoals ze altijd was.
  if (cancellations.length === 0) {
    const subject =
      requests.length === 1
        ? `${UITLEEN_SUBJECT_PREFIX}: nieuwe ${noun}, ${requests[0].title}`
        : `${UITLEEN_SUBJECT_PREFIX}: ${requests.length} nieuwe ${nouns}`;
    const text = joinBlocks([
      requests.length === 1
        ? `Er is een nieuwe ${noun} binnengekomen op ${baseUrl}.`
        : `Er staan ${requests.length} nieuwe aanvragen klaar op ${baseUrl}.`,
      ...(requests.length === 1 ? [requests[0].text] : numbered(requests, 0)),
    ]);
    return { subject, text };
  }

  // Enkel annulaties.
  if (requests.length === 0) {
    const subject =
      cancellations.length === 1
        ? `${UITLEEN_SUBJECT_PREFIX}: ${noun} geannuleerd, ${cancellations[0].title}`
        : `${UITLEEN_SUBJECT_PREFIX}: ${cancellations.length} ${nouns} geannuleerd`;
    const text = joinBlocks([
      cancellations.length === 1
        ? `De aanvrager heeft deze ${noun} geannuleerd.`
        : `Aanvragers hebben ${cancellations.length} ${nouns} geannuleerd.`,
      ...(cancellations.length === 1 ? [cancellations[0].text] : numbered(cancellations, 0)),
    ]);
    return { subject, text };
  }

  // Allebei: twee kopjes, één nummering zodat "punt 3" in de mail eenduidig is.
  const subject = `${UITLEEN_SUBJECT_PREFIX}: ${requests.length} nieuwe ${
    requests.length === 1 ? noun : nouns
  }, ${cancellations.length} geannuleerd`;
  const text = joinBlocks([
    `Er staan nieuwe aanvragen klaar op ${baseUrl}, en de aanvrager annuleerde er ${
      cancellations.length === 1 ? 'een' : cancellations.length
    }.`,
    'Nieuw:',
    ...numbered(requests, 0),
    'Geannuleerd:',
    ...numbered(cancellations, requests.length),
  ]);
  return { subject, text };
}
