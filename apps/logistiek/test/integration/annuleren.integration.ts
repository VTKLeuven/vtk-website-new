import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@vtk/db';

/**
 * Een lid annuleert iets wat het team al zag of goedkeurde (L1 uit de audit van
 * november 2026).
 *
 * Voordien vertrok er niets en kwam er geen regel in de historiek: een
 * chauffeur die op de rit stond, merkte het pas wanneer hij de planning opende.
 * Nu schrijft het annuleren een historiekregel, krijgt de chauffeur meteen een
 * mail, en komt de annulatie in de teammelding (meteen binnen het etmaal,
 * anders in de bundel).
 *
 * Tegen een echte database, want het hangt aan wat de transactie leest en
 * schrijft (`teamNotifiedAt`, de historiek) en aan de wachtrij die daarop zoekt.
 */

const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; cc?: string | string[]; subject: string; text: string }> }));

vi.mock('@vtk/mail', () => ({
  sendMail: vi.fn(async (input: { to: string; cc?: string | string[]; subject: string; text: string }) => {
    mail.sent.push(input);
    return true;
  }),
}));

// Buiten een Next-request bestaat er geen cache om te invalideren, en geen
// cookies: de actions lezen er de taal uit om hun melding te vertalen.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

const session = vi.hoisted(() => ({ userId: '' }));
vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireSession: vi.fn(async () => ({
    user: { id: session.userId, isSuperAdmin: false },
    groups: [{ id: 'g' }],
    permissions: [],
    roleIds: [],
  })),
}));

const { cancelReservationAction, cancelVanBookingAction } = await import('@/app/actions/uitleen');
const { sendTeamDigests } = await import('@/lib/uitleen-mail');

const DAY = 24 * 60 * 60 * 1000;

describe('annuleren door de aanvrager', () => {
  const ids = {
    aanvrager: randomUUID(),
    chauffeur: randomUUID(),
    voertuig: randomUUID(),
    item: randomUUID(),
    goedgekeurd: randomUUID(),
    nieuw: randomUUID(),
    heen: randomUUID(),
    terug: randomUUID(),
    morgen: randomUUID(),
  };
  const tripGroupId = randomUUID();
  let settingsBefore: unknown = undefined;
  let digestBefore: unknown = undefined;

  beforeAll(async () => {
    // De teamadressen en de bundelklok vastzetten, en achteraf terugzetten.
    const [settings, digest] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'logistiek.settings' } }),
      prisma.setting.findUnique({ where: { key: 'logistiek.teamDigest' } }),
    ]);
    settingsBefore = settings?.value;
    digestBefore = digest?.value;
    const current = (settings?.value ?? {}) as Record<string, unknown>;
    await prisma.setting.upsert({
      where: { key: 'logistiek.settings' },
      create: {
        key: 'logistiek.settings',
        value: { notifyEmails: { materiaal: ['materiaal@team.test'], flesserke: [], transport: ['ritten@team.test'] } },
      },
      update: {
        value: {
          ...current,
          notifyEmails: { materiaal: ['materiaal@team.test'], flesserke: [], transport: ['ritten@team.test'] },
        },
      },
    });
    await prisma.setting.deleteMany({ where: { key: 'logistiek.teamDigest' } });

    await prisma.user.createMany({
      data: [
        { id: ids.aanvrager, name: 'Arthur Aanvrager', email: `annul-${ids.aanvrager}@vtk.test` },
        { id: ids.chauffeur, name: 'Jonas Chauffeur', email: `annul-${ids.chauffeur}@vtk.test` },
      ],
    });
    await prisma.uitleenVehicle.create({
      data: { id: ids.voertuig, code: `annul-${ids.voertuig}`, nameNl: 'Testkar', nameEn: 'Test trailer', pricingMode: 'FREE', rateCents: 0 },
    });
    await prisma.uitleenItem.create({ data: { id: ids.item, name: 'Testtafel', quantity: 10 } });

    const pickup = new Date(Date.UTC(2030, 0, 10));
    const base = {
      userId: ids.aanvrager,
      requesterType: 'INTERN' as const,
      pickupDate: pickup,
      returnDate: new Date(Date.UTC(2030, 0, 12)),
      totalPriceCents: 0,
      totalDepositCents: 0,
      lines: { create: [{ itemId: ids.item, itemName: 'Testtafel', quantity: 4, unitPriceCents: 0, unitDepositCents: 0 }] },
    };
    // Goedgekeurd en het team wist ervan: de annulatie moet gemeld worden.
    await prisma.uitleenReservation.create({
      data: { ...base, id: ids.goedgekeurd, eventName: 'Galabal', status: 'APPROVED', teamNotifiedAt: new Date() },
    });
    // Net ingediend, nog in geen enkele bundel: annuleren laat niets achter.
    await prisma.uitleenReservation.create({
      data: { ...base, id: ids.nieuw, eventName: 'Quiz', status: 'REQUESTED', teamNotifiedAt: null },
    });

    const trip = {
      userId: ids.aanvrager,
      vehicleId: ids.voertuig,
      requesterType: 'INTERN' as const,
      purpose: 'Tafels naar de zaal',
      contactPhone: '0470 00 00 00',
      pricingMode: 'FREE' as const,
      rateCents: 0,
    };
    const later = new Date(Date.now() + 10 * DAY);
    // Heen en terug, goedgekeurd, met een chauffeur op de heenrit.
    await prisma.uitleenTransportBooking.create({
      data: {
        ...trip,
        id: ids.heen,
        tripGroupId,
        tripLeg: 'HEEN',
        status: 'APPROVED',
        driverId: ids.chauffeur,
        startAt: later,
        endAt: new Date(later.getTime() + 2 * 60 * 60 * 1000),
        teamNotifiedAt: new Date(),
      },
    });
    await prisma.uitleenTransportBooking.create({
      data: {
        ...trip,
        id: ids.terug,
        tripGroupId,
        tripLeg: 'TERUG',
        status: 'APPROVED',
        startAt: new Date(later.getTime() + 6 * 60 * 60 * 1000),
        endAt: new Date(later.getTime() + 8 * 60 * 60 * 1000),
        teamNotifiedAt: new Date(),
      },
    });
    // Vertrekt morgen: te dringend voor de bundel.
    const tomorrow = new Date(Date.now() + 20 * 60 * 60 * 1000);
    await prisma.uitleenTransportBooking.create({
      data: {
        ...trip,
        id: ids.morgen,
        purpose: 'Vaten ophalen',
        status: 'APPROVED',
        startAt: tomorrow,
        endAt: new Date(tomorrow.getTime() + 60 * 60 * 1000),
        teamNotifiedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    const bookingIds = [ids.heen, ids.terug, ids.morgen];
    const reservationIds = [ids.goedgekeurd, ids.nieuw];
    await prisma.uitleenAuditLog.deleteMany({
      where: { OR: [{ transportBookingId: { in: bookingIds } }, { reservationId: { in: reservationIds } }] },
    });
    await prisma.uitleenTransportBooking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.uitleenReservationLine.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.uitleenReservation.deleteMany({ where: { id: { in: reservationIds } } });
    await prisma.uitleenItem.deleteMany({ where: { id: ids.item } });
    await prisma.uitleenVehicle.deleteMany({ where: { id: ids.voertuig } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.aanvrager, ids.chauffeur] } } });
    if (settingsBefore === undefined) await prisma.setting.deleteMany({ where: { key: 'logistiek.settings' } });
    else await prisma.setting.update({ where: { key: 'logistiek.settings' }, data: { value: settingsBefore as object } });
    if (digestBefore === undefined) await prisma.setting.deleteMany({ where: { key: 'logistiek.teamDigest' } });
    else
      await prisma.setting.upsert({
        where: { key: 'logistiek.teamDigest' },
        create: { key: 'logistiek.teamDigest', value: digestBefore as object },
        update: { value: digestBefore as object },
      });
  });

  beforeEach(() => {
    mail.sent.length = 0;
    session.userId = ids.aanvrager;
  });

  it('schrijft een historiekregel en zet een gekende aanvraag terug in de teamwachtrij', async () => {
    const result = await cancelReservationAction(ids.goedgekeurd);
    expect(result.ok).toBe(true);

    const row = await prisma.uitleenReservation.findUniqueOrThrow({
      where: { id: ids.goedgekeurd },
      select: { status: true, teamNotifiedAt: true, auditLogs: true },
    });
    expect(row.status).toBe('CANCELLED');
    expect(row.teamNotifiedAt).toBeNull();
    expect(row.auditLogs).toHaveLength(1);
    expect(row.auditLogs[0]).toMatchObject({
      kind: 'STATUS_CHANGED',
      fromStatus: 'APPROVED',
      toStatus: 'CANCELLED',
      actorId: ids.aanvrager,
    });
    // De afhaling ligt in 2030: geen dringende mail, de bundel neemt ze mee.
    expect(mail.sent).toHaveLength(0);
  });

  it('stempelt een aanvraag die het team nooit zag, zodat ze niet in de bundel belandt', async () => {
    expect((await cancelReservationAction(ids.nieuw)).ok).toBe(true);
    const row = await prisma.uitleenReservation.findUniqueOrThrow({
      where: { id: ids.nieuw },
      select: { status: true, teamNotifiedAt: true },
    });
    expect(row.status).toBe('CANCELLED');
    expect(row.teamNotifiedAt).not.toBeNull();
  });

  it('annuleert heen en terug samen en mailt de chauffeur meteen', async () => {
    const result = await cancelVanBookingAction(ids.heen);
    expect(result).toMatchObject({ ok: true, message: 'Heen- en terugrit geannuleerd.' });

    const rows = await prisma.uitleenTransportBooking.findMany({
      where: { id: { in: [ids.heen, ids.terug] } },
      select: { status: true, teamNotifiedAt: true, _count: { select: { auditLogs: true } } },
    });
    expect(rows.map((row) => row.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect(rows.every((row) => row.teamNotifiedAt === null && row._count.auditLogs === 1)).toBe(true);

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe(`annul-${ids.chauffeur}@vtk.test`);
    expect(mail.sent[0].subject).toContain('rit geannuleerd, Tafels naar de zaal');
    expect(mail.sent[0].text).toContain('Je hoeft ze niet meer te rijden.');
  });

  it('meldt een rit die morgen vertrekt meteen aan het team', async () => {
    expect((await cancelVanBookingAction(ids.morgen)).ok).toBe(true);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe('ritten@team.test');
    expect(mail.sent[0].subject).toBe('VTK Logistiek: ritaanvraag geannuleerd, Vaten ophalen');
    expect(mail.sent[0].text).toContain('Ze stond al goedgekeurd.');
    const row = await prisma.uitleenTransportBooking.findUniqueOrThrow({ where: { id: ids.morgen } });
    expect(row.teamNotifiedAt).not.toBeNull();
  });

  it('zet de rest in de uurlijkse bundel, één keer', async () => {
    const sent = await sendTeamDigests();
    // Andere testdata in dezelfde databank kan ook in de bundel zitten; hier
    // telt enkel wat deze test annuleerde.
    const materiaal = mail.sent.find((m) => m.to === 'materiaal@team.test');
    const ritten = mail.sent.find((m) => m.to === 'ritten@team.test');
    expect(materiaal?.text).toContain('Aanvraag: Galabal');
    expect(materiaal?.text).toContain('Ze stond al goedgekeurd; wat al klaarlag, mag terug.');
    expect(materiaal?.text).not.toContain('Aanvraag: Quiz');
    expect(ritten?.text).toContain('Waarvoor: Tafels naar de zaal');
    expect(ritten?.text).toContain('Chauffeur: Jonas Chauffeur (kreeg een mail)');
    // Heen en terug staan als één aanvraag in de mail.
    expect(ritten?.text.match(/Waarvoor: Tafels naar de zaal/g)).toHaveLength(1);
    expect(sent.materiaal).toBeGreaterThanOrEqual(1);

    // Gestempeld: een tweede bundel neemt ze niet nog eens mee.
    const rows = await prisma.uitleenTransportBooking.findMany({
      where: { id: { in: [ids.heen, ids.terug] } },
      select: { teamNotifiedAt: true },
    });
    expect(rows.every((row) => row.teamNotifiedAt !== null)).toBe(true);
  });
});
