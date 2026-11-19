import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@vtk/db';
import { SAVE_IDLE } from '@/lib/saveState';

const session = vi.hoisted(() => ({ userId: '' }));
vi.mock('@/lib/session', () => ({
  requireSession: vi.fn(async () => ({ user: { id: session.userId } })),
  requirePermission: vi.fn(async () => ({ user: { id: session.userId } })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const { saveMeetingReservationAction } = await import('@/app/actions/meetings');
const { loadBureauStatsMeetings } = await import('@/lib/meetingStatsLoad');
const { yearOverview } = await import('@/lib/meetingStats');

/**
 * De herkomst van een bureau-inschrijving tegen een echte database: ze wordt
 * enkel bij de eerste inschrijving bewaard. Wie later zijn inschrijving bijwerkt
 * via een andere link, houdt de herkomst van de eerste keer. Die regel hangt aan
 * één regel code (de herkomst zit in de `create` van de upsert en niet in de
 * gedeelde `data`), en een fout daar faalt stil: de cijfers op de tab
 * Statistieken verschuiven dan zonder dat iets breekt.
 */
describe('herkomst van een bureau-inschrijving', () => {
  const tag = randomUUID().slice(0, 8);
  let meetingId = '';

  function form(fields: Record<string, string>) {
    const data = new FormData();
    data.set('meetingId', meetingId);
    data.set('choice', '');
    data.set('drink', '');
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  async function stored() {
    return prisma.meetingReservation.findUniqueOrThrow({
      where: { meetingId_userId: { meetingId, userId: session.userId } },
      select: { source: true, sourceCampaign: true, comment: true },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: `Bureau herkomst ${tag}`, email: `bureau-herkomst-${tag}@student.kuleuven.be` },
    });
    session.userId = user.id;
    const meeting = await prisma.meeting.create({
      data: {
        kind: 'BUREAU',
        year: 2030,
        semester: 1,
        slug: `bureau-herkomst-${tag}`,
        // Over drie dagen en zonder `opensAt`: het formulier staat open.
        startsAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });
    meetingId = meeting.id;
  });

  afterAll(async () => {
    if (meetingId) await prisma.meeting.deleteMany({ where: { id: meetingId } });
    if (session.userId) await prisma.user.deleteMany({ where: { id: session.userId } });
  });

  it('bewaart de herkomst van de eerste inschrijving', async () => {
    const result = await saveMeetingReservationAction(SAVE_IDLE, form({ source: 'mail', sourceCampaign: 'week-3' }));
    expect(result).toMatchObject({ status: 'success' });
    expect(await stored()).toMatchObject({ source: 'mail', sourceCampaign: 'week-3' });
  });

  it('een update via een andere link overschrijft de herkomst niet', async () => {
    await saveMeetingReservationAction(
      SAVE_IDLE,
      form({ source: 'instagram', sourceCampaign: 'story', comment: 'tweede keer' })
    );
    // De update zelf kwam wel aan, enkel de herkomst bleef staan.
    expect(await stored()).toEqual({ source: 'mail', sourceCampaign: 'week-3', comment: 'tweede keer' });
  });

  it('een nieuwe inschrijving zonder herkomst is direct, niet ongemeten', async () => {
    await prisma.meetingReservation.deleteMany({ where: { meetingId } });
    await saveMeetingReservationAction(SAVE_IDLE, form({}));
    expect(await stored()).toMatchObject({ source: 'direct', sourceCampaign: null });
  });
});

/**
 * "Terugkerend" begint elk werkingsjaar opnieuw (bevestigd door Onderwijs). De
 * grens zit in de vraag aan de database (`Meeting.year`), niet in de
 * rekenfunctie: dit legt die twee samen.
 */
describe('terugkerend over de grens van het werkingsjaar', () => {
  const tag = randomUUID().slice(0, 8);
  // Jaren waar geen echte bureaus in staan, zodat de telling enkel deze test ziet.
  const lastYear = 2090 + (parseInt(tag.slice(0, 2), 16) % 8);
  const thisYear = lastYear + 1;
  const meetingIds: string[] = [];
  let userId = '';

  async function bureau(year: number, startsAt: Date) {
    const meeting = await prisma.meeting.create({
      data: { kind: 'BUREAU', year, semester: 1, slug: `bureau-jaar-${tag}-${year}`, startsAt },
    });
    meetingIds.push(meeting.id);
    await prisma.meetingReservation.create({ data: { meetingId: meeting.id, userId, source: 'mail' } });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: `Bureau jaar ${tag}`, email: `bureau-jaar-${tag}@student.kuleuven.be` },
    });
    userId = user.id;
    // Mei van vorig werkingsjaar en oktober van dit: dezelfde student op beide.
    await bureau(lastYear, new Date(Date.UTC(thisYear, 4, 6, 10, 30)));
    await bureau(thisYear, new Date(Date.UTC(thisYear, 9, 6, 10, 30)));
  });

  afterAll(async () => {
    await prisma.meeting.deleteMany({ where: { id: { in: meetingIds } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('wie vorig werkingsjaar kwam, is bij zijn eerste bureau van dit jaar nieuw', async () => {
    const year = yearOverview(await loadBureauStatsMeetings(thisYear));
    expect(year.meetings).toHaveLength(1);
    expect(year.meetings[0]).toMatchObject({ newcomers: 1, returning: 0 });
  });
});
