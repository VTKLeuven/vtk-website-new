import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@vtk/db';
import { toDateInputValue } from '@/lib/uitleen';

/**
 * Wat samen geschreven moet worden, gebeurt in één transactie (L6 uit de audit
 * van november 2026): een nieuw evenement met de aanvraag die het aanmaakt, en
 * de naamcontrole van een sjabloon met het sjabloon zelf.
 *
 * Tegen een echte database, want het gaat precies over wat Postgres terugdraait
 * en over twee transacties die tegelijk lopen.
 */

vi.mock('@vtk/mail', () => ({ sendMail: vi.fn(async () => true) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

const session = vi.hoisted(() => ({ userId: '', groupId: '' }));
vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  requireSession: vi.fn(async () => ({
    user: { id: session.userId, isSuperAdmin: false, name: 'Transactie Lid', email: 'tx@vtk.test' },
    groups: [{ id: session.groupId, type: 'PRAESIDIUM' }],
    permissions: [],
    roleIds: [],
  })),
}));

const { createReservationAction, createTemplateFromSelectionAction } = await import('@/app/actions/uitleen');

const DAY = 24 * 60 * 60 * 1000;

describe('transacties bij het indienen', () => {
  const ids = { lid: randomUUID(), ander: randomUUID(), groep: randomUUID(), item: randomUUID() };
  const tag = ids.lid.slice(0, 8);

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: ids.lid, name: 'Transactie Lid', email: `tx-${ids.lid}@vtk.test` },
        { id: ids.ander, name: 'Transactie Ander', email: `tx-${ids.ander}@vtk.test` },
      ],
    });
    await prisma.group.create({
      data: { id: ids.groep, code: `tx-${tag}`, slug: `tx-${tag}`, nameNl: `Transactiepost ${tag}`, nameEn: `Transaction post ${tag}`, type: 'PRAESIDIUM' },
    });
    await prisma.uitleenItem.create({ data: { id: ids.item, name: `Transactietafel ${tag}`, quantity: 10 } });
  });

  afterAll(async () => {
    const users = [ids.lid, ids.ander];
    const reservations = await prisma.uitleenReservation.findMany({ where: { userId: { in: users } }, select: { id: true } });
    await prisma.uitleenReservationLine.deleteMany({ where: { reservationId: { in: reservations.map((r) => r.id) } } });
    await prisma.uitleenReservation.deleteMany({ where: { userId: { in: users } } });
    await prisma.uitleenEvent.deleteMany({ where: { createdById: { in: users } } });
    const templates = await prisma.uitleenRequestTemplate.findMany({ where: { createdById: { in: users } }, select: { id: true } });
    await prisma.uitleenRequestTemplateLine.deleteMany({ where: { templateId: { in: templates.map((t) => t.id) } } });
    await prisma.uitleenRequestTemplate.deleteMany({ where: { createdById: { in: users } } });
    await prisma.uitleenItem.deleteMany({ where: { id: ids.item } });
    await prisma.group.deleteMany({ where: { id: ids.groep } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  beforeEach(() => {
    session.userId = ids.lid;
    session.groupId = ids.groep;
    vi.restoreAllMocks();
  });

  function reservationInput(eventName: string) {
    const pickup = new Date(Date.now() + 10 * DAY);
    return {
      requesterType: 'INTERN',
      groupId: ids.groep,
      eventName,
      pickupDate: toDateInputValue(pickup),
      returnDate: toDateInputValue(new Date(pickup.getTime() + DAY)),
      createEvent: true,
      lines: [{ itemId: ids.item, quantity: 2 }],
    };
  }

  it('maakt het evenement en de aanvraag samen aan', async () => {
    const name = `Galabal ${tag}`;
    const result = await createReservationAction(reservationInput(name));
    expect(result).toMatchObject({ ok: true, eventCreated: true });

    const event = await prisma.uitleenEvent.findFirstOrThrow({ where: { name } });
    const reservation = await prisma.uitleenReservation.findFirstOrThrow({ where: { eventName: name } });
    expect(reservation.eventId).toBe(event.id);
  });

  it('laat geen evenement achter wanneer de aanvraag zelf niet geschreven raakt', async () => {
    const name = `Quiz ${tag}`;
    // De transactie loopt echt, enkel het schrijven van de aanvraag faalt.
    const real = prisma.$transaction.bind(prisma) as (fn: unknown, options?: unknown) => Promise<unknown>;
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>, options?: unknown) =>
      real(
        (tx: Record<string, unknown>) =>
          fn(
            new Proxy(tx, {
              get(target, prop) {
                if (prop !== 'uitleenReservation') return target[prop as string];
                return {
                  ...(target.uitleenReservation as object),
                  create: async () => {
                    throw new Error('schrijven mislukt');
                  },
                };
              },
            })
          ),
        options
      )) as never);

    await expect(createReservationAction(reservationInput(name))).rejects.toThrow('schrijven mislukt');
    expect(await prisma.uitleenEvent.count({ where: { name } })).toBe(0);
    expect(await prisma.uitleenReservation.count({ where: { eventName: name } })).toBe(0);
  });

  it('geeft bij twee gelijktijdige sjablonen met dezelfde naam er maar één', async () => {
    const name = `Cantus ${tag}`;
    const asUser = async (userId: string) => {
      session.userId = userId;
      return createTemplateFromSelectionAction({ name, lines: [{ itemId: ids.item, quantity: 3 }] });
    };
    const results = await Promise.all([asUser(ids.lid), asUser(ids.ander)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual({
      ok: false,
      error: `Er bestaat al een sjabloon met de naam "${name}". Kies een andere naam, of gebruik het bestaande.`,
    });
    expect(await prisma.uitleenRequestTemplate.count({ where: { name, active: true } })).toBe(1);
  });
});
