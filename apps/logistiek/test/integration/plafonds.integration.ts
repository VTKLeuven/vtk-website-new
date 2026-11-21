import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@vtk/db';

/**
 * Wat één lid kan aanvragen, publiceren en aan teammails kan uitlokken (S4, S5,
 * S6 uit de audit van november 2026).
 *
 * Tegen een echte database: de grenzen tellen rijen per status, per heen-en-
 * terug en per tijdstempel, en dat is precies wat een mock niet nakijkt.
 */

const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; subject: string; text: string }> }));

vi.mock('@vtk/mail', () => ({
  sendMail: vi.fn(async (input: { to: string; subject: string; text: string }) => {
    mail.sent.push(input);
    return true;
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

const session = vi.hoisted(() => ({ userId: '', groups: [] as Array<{ id: string }> }));
vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireSession: vi.fn(async () => ({
    user: { id: session.userId, isSuperAdmin: false },
    groups: session.groups,
    permissions: [],
    roleIds: [],
  })),
}));

const { createTemplateFromSelectionAction } = await import('@/app/actions/uitleen');
const { MAX_OPEN_REQUESTS, MAX_TEMPLATES_PER_PERSON, openRequestCount, openRequestLimitError } = await import(
  '@/lib/request-limits'
);
const { notifyTeamIfUrgent } = await import('@/lib/uitleen-mail');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('plafonds per lid', () => {
  const ids = {
    lid: randomUUID(),
    druk: randomUUID(),
    rustig: randomUUID(),
    extern: randomUUID(),
    voertuig: randomUUID(),
    item: randomUUID(),
  };
  const users = [ids.lid, ids.druk, ids.rustig, ids.extern];
  let settingsBefore: unknown = undefined;

  /** Een materiaalaanvraag met één lijn, zodat ze in de materiaalbundel hoort. */
  async function reservation(userId: string, data: Record<string, unknown>) {
    return prisma.uitleenReservation.create({
      data: {
        userId,
        requesterType: 'INTERN',
        eventName: 'Plafondtest',
        pickupDate: new Date(Date.now() + 10 * DAY),
        returnDate: new Date(Date.now() + 12 * DAY),
        totalPriceCents: 0,
        totalDepositCents: 0,
        status: 'REQUESTED',
        lines: { create: [{ itemId: ids.item, itemName: 'Plafondtafel', quantity: 1, unitPriceCents: 0, unitDepositCents: 0 }] },
        ...data,
      },
    });
  }

  async function trip(userId: string, data: Record<string, unknown>) {
    const startAt = (data.startAt as Date | undefined) ?? new Date(Date.now() + 5 * DAY);
    return prisma.uitleenTransportBooking.create({
      data: {
        userId,
        vehicleId: ids.voertuig,
        requesterType: 'INTERN',
        purpose: 'Plafondtest',
        contactPhone: '0470 00 00 00',
        pricingMode: 'FREE',
        rateCents: 0,
        status: 'REQUESTED',
        startAt,
        endAt: new Date(startAt.getTime() + 2 * HOUR),
        ...data,
      },
    });
  }

  beforeAll(async () => {
    const settings = await prisma.setting.findUnique({ where: { key: 'logistiek.settings' } });
    settingsBefore = settings?.value;
    const current = (settings?.value ?? {}) as Record<string, unknown>;
    const notifyEmails = { materiaal: ['materiaal@team.test'], flesserke: [], transport: [] };
    await prisma.setting.upsert({
      where: { key: 'logistiek.settings' },
      create: { key: 'logistiek.settings', value: { notifyEmails } },
      update: { value: { ...current, notifyEmails } },
    });

    await prisma.user.createMany({
      data: users.map((id) => ({ id, name: `Plafond ${id.slice(0, 4)}`, email: `plafond-${id}@vtk.test` })),
    });
    await prisma.uitleenVehicle.create({
      data: { id: ids.voertuig, code: `plafond-${ids.voertuig}`, nameNl: 'Plafondkar', nameEn: 'Cap trailer', pricingMode: 'FREE', rateCents: 0 },
    });
    await prisma.uitleenItem.create({ data: { id: ids.item, name: 'Plafondtafel', quantity: 10 } });
  });

  afterAll(async () => {
    const reservations = await prisma.uitleenReservation.findMany({ where: { userId: { in: users } }, select: { id: true } });
    const reservationIds = reservations.map((row) => row.id);
    await prisma.uitleenAuditLog.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.uitleenReservationLine.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.uitleenReservation.deleteMany({ where: { id: { in: reservationIds } } });
    await prisma.uitleenTransportBooking.deleteMany({ where: { userId: { in: users } } });
    const templates = await prisma.uitleenRequestTemplate.findMany({ where: { createdById: { in: users } }, select: { id: true } });
    await prisma.uitleenRequestTemplateLine.deleteMany({ where: { templateId: { in: templates.map((row) => row.id) } } });
    await prisma.uitleenRequestTemplate.deleteMany({ where: { createdById: { in: users } } });
    await prisma.uitleenItem.deleteMany({ where: { id: ids.item } });
    await prisma.uitleenVehicle.deleteMany({ where: { id: ids.voertuig } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (settingsBefore === undefined) await prisma.setting.deleteMany({ where: { key: 'logistiek.settings' } });
    else await prisma.setting.update({ where: { key: 'logistiek.settings' }, data: { value: settingsBefore as object } });
  });

  beforeEach(() => {
    mail.sent.length = 0;
    session.userId = ids.lid;
    session.groups = [{ id: 'g' }];
  });

  it('telt enkel wat nog loopt, en heen en terug als één aanvraag', async () => {
    for (const status of ['REQUESTED', 'APPROVED', 'PICKED_UP', 'RETURNED', 'CANCELLED', 'REJECTED'] as const) {
      await reservation(ids.lid, { status });
    }
    const tripGroupId = randomUUID();
    const later = new Date(Date.now() + 5 * DAY);
    await trip(ids.lid, { tripGroupId, tripLeg: 'HEEN', startAt: later });
    await trip(ids.lid, { tripGroupId, tripLeg: 'TERUG', startAt: new Date(later.getTime() + 6 * HOUR) });
    await trip(ids.lid, { status: 'APPROVED' });
    // Voorbij, of geannuleerd: houdt niemand nog bezig.
    await trip(ids.lid, { status: 'APPROVED', startAt: new Date(Date.now() - 3 * DAY) });
    await trip(ids.lid, { status: 'CANCELLED' });

    // Drie aanvragen materiaal, één heen-en-terug en één losse rit.
    expect(await openRequestCount(ids.lid)).toBe(5);
    expect(await openRequestLimitError(ids.lid)).toBeNull();
  });

  it('weigert een nieuwe aanvraag vanaf het plafond', async () => {
    const missing = MAX_OPEN_REQUESTS - (await openRequestCount(ids.lid));
    for (let i = 0; i < missing - 1; i++) await reservation(ids.lid, {});
    expect(await openRequestLimitError(ids.lid)).toBeNull();
    await reservation(ids.lid, {});
    expect(await openRequestLimitError(ids.lid)).toBe(
      `Je hebt al ${MAX_OPEN_REQUESTS} aanvragen openstaan. Wacht tot er een afgerond is, of mail logistiek@vtk.be.`
    );
  });

  it('laat een externe geen sjabloon publiceren', async () => {
    session.userId = ids.extern;
    session.groups = [];
    const result = await createTemplateFromSelectionAction({ name: 'Extern', lines: [{ itemId: ids.item, quantity: 2 }] });
    expect(result).toEqual({ ok: false, error: 'Sjablonen zijn er voor de posten en werkgroepen van VTK.' });
    expect(await prisma.uitleenRequestTemplate.count({ where: { createdById: ids.extern } })).toBe(0);
  });

  it('stopt bij het maximum aan sjablonen per persoon', async () => {
    for (let i = 0; i < MAX_TEMPLATES_PER_PERSON - 1; i++) {
      await prisma.uitleenRequestTemplate.create({
        data: { name: `Plafond ${ids.lid} ${i}`, createdById: ids.lid, lines: { create: [{ itemId: ids.item, quantity: 1 }] } },
      });
    }
    const last = await createTemplateFromSelectionAction({
      name: `Plafond ${ids.lid} laatste`,
      lines: [{ itemId: ids.item, quantity: 2 }],
    });
    expect(last).toMatchObject({ ok: true });

    const tooMany = await createTemplateFromSelectionAction({
      name: `Plafond ${ids.lid} te veel`,
      lines: [{ itemId: ids.item, quantity: 2 }],
    });
    expect(tooMany).toEqual({
      ok: false,
      error: `Je hebt al ${MAX_TEMPLATES_PER_PERSON} sjablonen. Vraag Logistiek om er een op te ruimen.`,
    });
  });

  it('geeft een melding in plaats van een fout bij invoer die geen formulier stuurt', async () => {
    session.userId = ids.rustig;
    const call = createTemplateFromSelectionAction as (input: unknown) => Promise<unknown>;
    expect(await call({ name: 'x'.repeat(20_000), lines: [] })).toEqual({
      ok: false,
      error: 'Deze aanvraag kon niet gelezen worden. Herlaad de pagina en probeer opnieuw.',
    });
    expect(await call({ name: 42, lines: 'abc' })).toEqual({ ok: false, error: 'Geef het sjabloon een naam.' });
    expect(await call({ name: 'Ok', lines: 'abc' })).toEqual({
      ok: false,
      error: 'Kies eerst materiaal; een leeg sjabloon heeft geen nut.',
    });
    expect(await call({ name: 'Ok', lines: [{ itemId: { $ne: null }, quantity: 1 }] })).toEqual({
      ok: false,
      error: 'Kies eerst materiaal; een leeg sjabloon heeft geen nut.',
    });
  });

  it('laat na drie teammails in een uur de volgende dringende aanvraag op de bundel wachten', async () => {
    // Drie mails het laatste uur over de aanvragen van dit lid.
    for (const minutesAgo of [50, 30, 10]) {
      await reservation(ids.druk, { teamNotifiedAt: new Date(Date.now() - minutesAgo * 60 * 1000) });
    }
    const urgent = await reservation(ids.druk, {
      pickupDate: new Date(Date.now() + 6 * HOUR),
      returnDate: new Date(Date.now() + 2 * DAY),
    });
    await notifyTeamIfUrgent('materiaal', urgent.id);

    expect(mail.sent).toHaveLength(0);
    const row = await prisma.uitleenReservation.findUniqueOrThrow({ where: { id: urgent.id } });
    expect(row.teamNotifiedAt).toBeNull();
  });

  it('telt een bundel als één mail, zodat een gewoon lid gewoon gemeld wordt', async () => {
    // Eén bundel met drie aanvragen en één dringende mail: twee mails.
    const bundle = new Date(Date.now() - 40 * 60 * 1000);
    for (let i = 0; i < 3; i++) await reservation(ids.rustig, { teamNotifiedAt: bundle });
    await reservation(ids.rustig, { teamNotifiedAt: new Date(Date.now() - 5 * 60 * 1000) });
    const urgent = await reservation(ids.rustig, {
      eventName: 'Dringend vanavond',
      pickupDate: new Date(Date.now() + 6 * HOUR),
      returnDate: new Date(Date.now() + 2 * DAY),
    });
    await notifyTeamIfUrgent('materiaal', urgent.id);

    expect(mail.sent.map((sent) => sent.to)).toEqual(['materiaal@team.test']);
    expect(mail.sent[0]?.text).toContain('Aanvraag: Dringend vanavond');
    const row = await prisma.uitleenReservation.findUniqueOrThrow({ where: { id: urgent.id } });
    expect(row.teamNotifiedAt).not.toBeNull();
  });
});
