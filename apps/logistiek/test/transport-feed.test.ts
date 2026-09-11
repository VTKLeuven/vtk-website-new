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

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('@vtk/db', () => ({
  prisma: { uitleenTransportBooking: { findMany } },
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

  it('haalt voor een chauffeursfeed enkel zijn eigen ritten op', async () => {
    // Een eigen `where` en geen filter achteraf: zie de comment bij de functie.
    findMany.mockResolvedValue([]);
    await buildTransportFeed('DRIVER', 'u9');
    const where = findMany.mock.calls[0][0].where;
    expect(where.driverId).toBe('u9');
    expect(where.status).toEqual({ in: ['APPROVED', 'COMPLETED'] });
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
