import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * De agendafeed van de transportplanning.
 *
 * Hier wordt vooral getest wat er **niet** in mag: `CLASS:PRIVATE`. De feed
 * bevatte de rit al helemaal (titel, chauffeur, lading, nummers), maar met die
 * regel erbij toont Google in een geabonneerde agenda enkel "Bezet" en laat
 * Outlook de details weg. Een test op de aanwezigheid van de gegevens zou dat
 * niet gevangen hebben; die stonden er.
 */

const { findMany, membershipFindMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  membershipFindMany: vi.fn(),
}));

vi.mock('@vtk/db', () => ({
  prisma: {
    uitleenTransportBooking: { findMany },
    // De chauffeursfeed draagt sinds de postritten ook de posten van deze
    // persoon; zonder sessie moet hij die zelf opzoeken.
    groupMembership: { findMany: membershipFindMany },
  },
}));

process.env.LOGISTIEK_PUBLIC_URL = 'https://logistiek.vtk.be';

const { buildTransportFeed, feedWindow } = await import('@/lib/calendar/transport-feed');

type Booking = Awaited<ReturnType<typeof booking>>;

function booking(over: Record<string, unknown> = {}) {
  return {
    id: 'rit1',
    startAt: new Date('2026-09-19T08:00:00.000Z'),
    endAt: new Date('2026-09-19T11:00:00.000Z'),
    updatedAt: new Date('2026-09-11T09:00:00.000Z'),
    status: 'APPROVED',
    purpose: 'Cantusmateriaal ophalen',
    cargoNote: '20 bierbakken en 4 tafels',
    eventName: 'Doopcantus',
    pickupAddress: 'Logikot',
    destination: 'Zaal Alma 3',
    contactPhone: '0470 11 22 33',
    helpersNote: null,
    helpersPhone: null,
    helpers: [{ name: 'Lotte', phone: '0470 44 55 66' }],
    requesterType: 'INTERN',
    requesterName: null,
    user: { name: 'Arthur' },
    group: { nameNl: 'Feest' },
    vehicle: { nameNl: 'Kar' },
    driver: { name: 'Jonas' },
    ...over,
  };
}

/** De feed als losse regels; het ics-formaat vouwt lange regels op 75 octets. */
async function lines(rows: Booking[]): Promise<string[]> {
  findMany.mockResolvedValue(rows);
  const body = await buildTransportFeed('TEAM', 'u1');
  // Vouwregels (een regel die met een spatie begint) weer aan hun voorganger
  // plakken, anders vind je een lange DESCRIPTION nooit terug.
  return body.split('\r\n').reduce<string[]>((all, line) => {
    if (line.startsWith(' ') && all.length > 0) all[all.length - 1] += line.slice(1);
    else all.push(line);
    return all;
  }, []);
}

/**
 * De beschrijving van de eerste rit. Niet zomaar de eerste `DESCRIPTION:` in de
 * feed: de kalender zelf heeft er ook een ("De transportplanning van VTK
 * Logistiek"), en die staat erboven.
 */
function eventDescription(all: string[]): string {
  const start = all.indexOf('BEGIN:VEVENT');
  const end = all.indexOf('END:VEVENT', start);
  return all.slice(start, end).find((line) => line.startsWith('DESCRIPTION:')) ?? '';
}

beforeEach(() => {
  findMany.mockReset();
  membershipFindMany.mockReset();
  // De meeste tests gaan over wat er in een VEVENT staat, niet over welke
  // posten iemand heeft; standaard dus geen.
  membershipFindMany.mockResolvedValue([]);
});

describe('buildTransportFeed', () => {
  it('markeert een rit niet als privé', async () => {
    // De regressie: `private: true` gaf CLASS:PRIVATE, en dan staat er "Bezet"
    // in de agenda in plaats van de rit.
    const result = await lines([booking()]);
    expect(result).not.toContain('CLASS:PRIVATE');
    expect(result).toContain('CLASS:PUBLIC');
  });

  it('zet het voertuig en het evenement in de titel', async () => {
    // In een agenda-app zie je vaak enkel de eerste regel.
    expect(await lines([booking()])).toContain('SUMMARY:Kar: Doopcantus');
  });

  it('valt in de titel terug op het doel van de rit', async () => {
    const result = await lines([booking({ eventName: null })]);
    expect(result).toContain('SUMMARY:Kar: Cantusmateriaal ophalen');
  });

  it('zet lading, chauffeur en nummers in de beschrijving', async () => {
    const description = eventDescription(await lines([booking()]));
    // Het ics-formaat escapet komma's; daarom per stuk en niet op de hele zin.
    expect(description).toContain('Lading: 20 bierbakken en 4 tafels');
    expect(description).toContain('Chauffeur: Jonas');
    expect(description).toContain('Aanvrager bellen: 0470 11 22 33');
    expect(description).toContain('Bijrijders: Lotte (0470 44 55 66)');
    expect(description).toContain('Aanvrager: Feest (Arthur)');
  });

  it('zegt het wanneer er nog geen chauffeur is', async () => {
    const description = eventDescription(await lines([booking({ driver: null })]));
    expect(description).toContain('Nog geen chauffeur');
  });

  it('geeft de bestemming als locatie', async () => {
    // Dat is wat een agenda-app als navigatiedoel aanbiedt.
    expect(await lines([booking()])).toContain('LOCATION:Zaal Alma 3');
  });

  it('haalt voor een chauffeursfeed enkel ritten op die hem aangaan', async () => {
    // Een eigen `where` en geen filter achteraf: zie de comment bij de functie.
    findMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([{ groupId: 'g1' }]);
    await buildTransportFeed('DRIVER', 'u9');

    const where = findMany.mock.calls[0][0].where;
    const [{ OR: bronnen }] = where.AND;
    expect(bronnen).toContainEqual({ driverId: 'u9' });
    // De rit die aan zijn post doorgegeven is: precies degene die nog een
    // chauffeur zoekt, en die hier vroeger ontbrak.
    expect(bronnen).toContainEqual({ assignedGroupId: { in: ['g1'] } });
    expect(bronnen).toContainEqual({ groupId: { in: ['g1'] }, driverId: { not: null } });
  });

  it('valt terug op enkel de eigen ritten wanneer je in geen enkele post zit', async () => {
    findMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([]);
    await buildTransportFeed('DRIVER', 'u9');

    const [{ OR: bronnen }] = findMany.mock.calls[0][0].where.AND;
    expect(bronnen).toEqual([{ driverId: 'u9' }]);
  });

  it('laat een afgelaste rit niet stil verdwijnen maar stuurt een grafsteen', async () => {
    // Een VEVENT dat gewoon wegvalt, ruimt Apple op en laat Google geregeld
    // staan. `STATUS:CANCELLED` is de expliciete instructie om te schrappen.
    const afgelast = booking({ status: 'CANCELLED' });
    const ics = await lines([afgelast]);

    expect(ics).toContain('STATUS:CANCELLED');
    // En ook leesbaar, voor een client die STATUS negeert.
    expect(ics.find((line) => line.startsWith('SUMMARY:'))).toContain('Afgelast:');
  });

  it('zet een levende rit gewoon op CONFIRMED', async () => {
    expect(await lines([booking()])).toContain('STATUS:CONFIRMED');
  });

  it('vraagt afgelaste ritten enkel op zolang ze vers zijn', async () => {
    findMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([]);
    const now = new Date('2026-09-20T12:00:00.000Z');
    await buildTransportFeed('DRIVER', 'u9', now);

    const [, statusWhere] = findMany.mock.calls[0][0].where.AND;
    const grafsteen = statusWhere.OR.find((tak: { status: { in: string[] } }) => tak.status.in.includes('CANCELLED'));
    expect(grafsteen.status.in).toEqual(['REJECTED', 'CANCELLED']);
    // Dertig dagen: elke client heeft intussen minstens één keer opgehaald.
    const dagen = Math.round((now.getTime() - grafsteen.updatedAt.gte.getTime()) / 86_400_000);
    expect(dagen).toBe(30);
  });
});

describe('feedWindow', () => {
  it('kijkt kort terug en lang vooruit', async () => {
    // Een agenda-client haalt dit elk uur op; gereden ritten van drie jaar
    // geleden meesturen kost enkel bandbreedte.
    const now = new Date('2026-09-11T12:00:00.000Z');
    const { from, to } = feedWindow(now);
    const days = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);
    expect(days(now, from)).toBe(60);
    expect(days(to, now)).toBe(365);
  });
});
