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
const { loadMeetingAdmin } = await import('@/lib/meetingAdmin');

/**
 * Het vriendjesbureau tegen een echte database. De vraag is enkel voor studenten
 * van de faculteit (`User.firwStudent`), en dat moet de server afdwingen: het
 * formulier toont de vraag niet aan wie er niet studeert, maar een verborgen
 * veld is na te maken. Een fout daar faalt stil: er staan dan te veel vriendjes
 * in het beheer en er wordt te veel gekocht.
 */
describe('vriendjesbureau', () => {
  const tag = randomUUID().slice(0, 8);
  // Een jaar waar geen echte bureaus in staan: één bureau per dag is uniek.
  const year = 2090 + (parseInt(tag.slice(0, 2), 16) % 8);
  const day = (month: number, date: number) => new Date(Date.UTC(year, month - 1, date, 11, 30));
  const meetingIds: string[] = [];
  let friendsBureauId = '';
  let student = '';
  let outsider = '';

  async function bureau(slug: string, startsAt: Date, friendsBureau = false) {
    const meeting = await prisma.meeting.create({
      data: { kind: 'BUREAU', year, semester: 1, slug: `${slug}-${tag}`, startsAt, friendsBureau },
    });
    meetingIds.push(meeting.id);
    return meeting.id;
  }

  function form(fields: Record<string, string>) {
    const data = new FormData();
    data.set('meetingId', friendsBureauId);
    data.set('choice', '');
    data.set('drink', '');
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  async function storedRole(userId: string) {
    const row = await prisma.meetingReservation.findUniqueOrThrow({
      where: { meetingId_userId: { meetingId: friendsBureauId, userId } },
      select: { friendRole: true },
    });
    return row.friendRole;
  }

  async function saveAs(userId: string, fields: Record<string, string>) {
    session.userId = userId;
    return saveMeetingReservationAction(SAVE_IDLE, form(fields));
  }

  beforeAll(async () => {
    student = (
      await prisma.user.create({
        data: { name: `Vriendje ${tag}`, email: `vriendje-${tag}@student.kuleuven.be`, firwStudent: true },
      })
    ).id;
    outsider = (
      await prisma.user.create({
        data: { name: `Buiten ${tag}`, email: `buiten-${tag}@student.kuleuven.be`, firwStudent: false },
      })
    ).id;

    // Twee bureaus voor het vriendjesbureau en één erna, telkens met de student.
    for (const [slug, startsAt] of [
      ['vriendje-eerder-1', day(11, 5)],
      ['vriendje-eerder-2', day(11, 19)],
      ['vriendje-later', day(12, 17)],
    ] as const) {
      const id = await bureau(slug, startsAt);
      await prisma.meetingReservation.create({ data: { meetingId: id, userId: student } });
    }
    // Zonder `opensAt` en ver in de toekomst: het formulier staat open.
    friendsBureauId = await bureau('vriendjesbureau', day(12, 3), true);
  });

  afterAll(async () => {
    await prisma.meeting.deleteMany({ where: { id: { in: meetingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [student, outsider].filter(Boolean) } } });
  });

  it('bewaart het antwoord van een student van de faculteit', async () => {
    expect(await saveAs(student, { friendRole: 'IS_FRIEND' })).toMatchObject({ status: 'success' });
    expect(await storedRole(student)).toBe('IS_FRIEND');
  });

  it('zet het leeg voor wie niet aan de faculteit studeert, ook met een nagemaakt veld', async () => {
    expect(await saveAs(outsider, { friendRole: 'BRINGS_FRIEND' })).toMatchObject({ status: 'success' });
    expect(await storedRole(outsider)).toBeNull();
  });

  it('laat het antwoord staan wanneer het vinkje even uit staat', async () => {
    await prisma.meeting.update({ where: { id: friendsBureauId }, data: { friendsBureau: false } });
    await saveAs(student, { comment: 'zonder vraag' });
    expect(await storedRole(student)).toBe('IS_FRIEND');
    await prisma.meeting.update({ where: { id: friendsBureauId }, data: { friendsBureau: true } });
  });

  it('komt gewoon wist een eerder antwoord', async () => {
    await saveAs(student, { friendRole: '' });
    expect(await storedRole(student)).toBeNull();
    await saveAs(student, { friendRole: 'IS_FRIEND' });
  });

  it('telt in het beheer enkel de eerdere bureaus van een vriendje', async () => {
    const { meetings } = await loadMeetingAdmin('BUREAU', {
      locale: 'nl',
      workingYear: year,
      semester: 1,
      meetingId: friendsBureauId,
    });
    expect(meetings).toHaveLength(1);
    expect(meetings[0].friendsBureau).toBe(true);
    const rows = new Map(meetings[0].reservations.map((row) => [row.name, row]));
    expect(rows.get(`Vriendje ${tag}`)).toMatchObject({ friendRole: 'IS_FRIEND', earlierBureaus: 2 });
    expect(rows.get(`Buiten ${tag}`)).toMatchObject({ friendRole: null, earlierBureaus: null });
  });
});
