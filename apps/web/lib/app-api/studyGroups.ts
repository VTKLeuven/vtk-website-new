import "server-only";

import { prisma } from "@vtk/db";

import { absoluteMediaUrl } from "@/lib/app-api/media";
import type {
  AppStudyDay,
  AppStudyGroup,
  AppStudyMemberState,
  AppStudyOverview,
  AppStudySession,
} from "@/lib/app-api/contract";
import {
  STUDY_MAX_SECONDS,
  closeAbandonedSessions,
  dayStart,
  isLive,
  netSeconds,
  streakFrom,
  totalsPerDay,
  weekStart,
  type StudySessionRow,
} from "@/lib/app-api/study";
import { brusselsYMD, shiftYMD, ymdKey } from "@/lib/brussels";

/**
 * Studiegroepen: wie er met wie vergelijkt.
 *
 * **Een groep is de enige plek waar je tijd zichtbaar is.** Er is geen ranglijst
 * per opleiding en geen VTK-brede lijst; die zouden vooral meten wie geen leven
 * heeft, en niemand gaf zich daarvoor op. Stap je uit een groep, dan ben je uit
 * die lijst weg. Zie `docs/design-decisions.md`.
 *
 * **De code is de hele toegangscontrole**, en dat is bewust: dit is een blokgroep
 * onder vrienden en geen kluis. Hij is wel lang genoeg om niet te raden te zijn
 * en geschreven in tekens die je niet verkeerd overtikt.
 */

/** Geen I, O, 0 of 1: dat zijn de tekens die mensen fout overnemen van een scherm. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_GROUPS_PER_USER = 10;
const MAX_MEMBERS = 50;
const NAME_MIN = 2;
const NAME_MAX = 40;
/** Hoeveel dagen geschiedenis het weekoverzicht en de reeks nodig hebben. */
const HISTORY_DAYS = 400;

export class StudyGroupError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "GROUP_FULL"
      | "TOO_MANY_GROUPS"
      | "INVALID_NAME"
      | "NOT_OWNER"
      | "NOT_A_MEMBER",
  ) {
    super(code);
    this.name = "StudyGroupError";
  }
}

function randomCode(): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Wat iemand intikt is zelden wat er in de databank staat: kleine letters,
 * spaties, een streepje in het midden. Dat halen we eraf.
 *
 * Er wordt bewust **niets gegokt**. Een getypte O of 1 staat niet in het
 * alfabet, dus is het een vergissing, en er is geen teken waar ze duidelijk voor
 * bedoeld was. Zo'n code geeft dan gewoon "niet gevonden", en dat is eerlijker
 * dan iemand stilletjes in de verkeerde groep zetten.
 */
export function normaliseCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN || name.length > NAME_MAX) throw new StudyGroupError("INVALID_NAME");
  return name;
}

export async function createStudyGroup(userId: string, rawName: string): Promise<string> {
  const name = cleanName(rawName);

  const mine = await prisma.studyGroupMember.count({ where: { userId } });
  if (mine >= MAX_GROUPS_PER_USER) throw new StudyGroupError("TOO_MANY_GROUPS");

  // Botsingen zijn zeldzaam maar niet onmogelijk; vijf pogingen is ruim.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const taken = await prisma.studyGroup.count({ where: { code } });
    if (taken > 0) continue;

    const group = await prisma.studyGroup.create({
      data: {
        name,
        code,
        ownerId: userId,
        members: { create: { userId, role: "owner" } },
      },
      select: { id: true },
    });
    return group.id;
  }

  throw new Error("STUDY_CODE_EXHAUSTED");
}

export async function joinStudyGroup(userId: string, rawCode: string): Promise<string> {
  const code = normaliseCode(rawCode);
  if (code.length !== CODE_LENGTH) throw new StudyGroupError("NOT_FOUND");

  const group = await prisma.studyGroup.findUnique({
    where: { code },
    select: { id: true, _count: { select: { members: true } } },
  });
  if (!group) throw new StudyGroupError("NOT_FOUND");

  const existing = await prisma.studyGroupMember.count({ where: { groupId: group.id, userId } });
  // Twee keer dezelfde code invoeren hoort niets te doen, niet te falen.
  if (existing > 0) return group.id;

  if (group._count.members >= MAX_MEMBERS) throw new StudyGroupError("GROUP_FULL");

  const mine = await prisma.studyGroupMember.count({ where: { userId } });
  if (mine >= MAX_GROUPS_PER_USER) throw new StudyGroupError("TOO_MANY_GROUPS");

  await prisma.studyGroupMember.create({ data: { groupId: group.id, userId } });
  return group.id;
}

/**
 * Uit een groep stappen, of iemand eruit zetten.
 *
 * De eigenaar die vertrekt geeft de groep door aan wie er het langst in zit; zo
 * blijft er altijd iemand die kan hernoemen en het doel kan zetten. Vertrekt de
 * laatste, dan verdwijnt de groep. Een lege groep met een code die nog
 * rondslingert is niets dan een val voor wie hem later gebruikt.
 */
export async function leaveStudyGroup(
  userId: string,
  groupId: string,
  targetUserId?: string,
): Promise<void> {
  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      ownerId: true,
      members: { select: { userId: true, joinedAt: true }, orderBy: { joinedAt: "asc" } },
    },
  });
  if (!group) throw new StudyGroupError("NOT_FOUND");
  if (!group.members.some((member) => member.userId === userId)) {
    throw new StudyGroupError("NOT_A_MEMBER");
  }

  const victim = targetUserId ?? userId;
  if (victim !== userId && group.ownerId !== userId) throw new StudyGroupError("NOT_OWNER");
  if (!group.members.some((member) => member.userId === victim)) {
    throw new StudyGroupError("NOT_A_MEMBER");
  }

  await prisma.studyGroupMember.deleteMany({ where: { groupId, userId: victim } });

  const rest = group.members.filter((member) => member.userId !== victim);
  if (rest.length === 0) {
    await prisma.studyGroup.delete({ where: { id: groupId } });
    return;
  }

  if (group.ownerId === victim) {
    await prisma.studyGroup.update({
      where: { id: groupId },
      data: { ownerId: rest[0].userId },
    });
    await prisma.studyGroupMember.updateMany({
      where: { groupId, userId: rest[0].userId },
      data: { role: "owner" },
    });
  }
}

export async function updateStudyGroup(
  userId: string,
  groupId: string,
  changes: { name?: string; weeklyGoalMinutes?: number | null },
): Promise<void> {
  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    select: { ownerId: true },
  });
  if (!group) throw new StudyGroupError("NOT_FOUND");
  if (group.ownerId !== userId) throw new StudyGroupError("NOT_OWNER");

  await prisma.studyGroup.update({
    where: { id: groupId },
    data: {
      ...(changes.name === undefined ? {} : { name: cleanName(changes.name) }),
      ...(changes.weeklyGoalMinutes === undefined
        ? {}
        : {
            weeklyGoalMinutes:
              changes.weeklyGoalMinutes === null
                ? null
                : Math.max(60, Math.min(100_000, Math.round(changes.weeklyGoalMinutes))),
          }),
    },
  });
}

// -----------------------------------------------------------------------------
// Het overzicht dat de app in één keer ophaalt
// -----------------------------------------------------------------------------

/**
 * Alles wat het studeerscherm nodig heeft, in één antwoord.
 *
 * Bewust niet opgesplitst in "mijn cijfers" en "mijn groepen": het is één scherm,
 * en twee aanvragen zouden betekenen dat de helft ervan al staat terwijl de andere
 * helft nog laadt. Groepen zijn klein genoeg om ze meteen mee te sturen.
 */
export async function studyOverview(
  request: Request,
  userId: string,
  now: Date = new Date(),
): Promise<AppStudyOverview> {
  await closeAbandonedSessions(userId, now);

  const since = new Date(dayStart(now).getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const [mine, memberships, profile] = await Promise.all([
    prisma.studySession.findMany({
      where: { userId, OR: [{ startedAt: { gte: since } }, { endedAt: null }] },
      orderBy: { startedAt: "desc" },
    }),
    prisma.studyGroupMember.findMany({
      where: { userId },
      orderBy: { joinedAt: "asc" },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            ownerId: true,
            weeklyGoalMinutes: true,
            members: { select: { userId: true }, orderBy: { joinedAt: "asc" } },
          },
        },
      },
    }),
    prisma.studyProfile.findUnique({ where: { userId } }),
  ]);

  const dailyGoalMinutes = profile?.dailyGoalMinutes ?? 240;
  const open = mine.find((session) => session.endedAt === null) ?? null;

  const todayFrom = dayStart(now);
  const weekFrom = weekStart(now);
  const totals = totalsPerDay(mine, now);

  const session: AppStudySession | null = open
    ? {
        id: open.id,
        subject: open.subject,
        subjectHidden: open.subjectHidden,
        startedAt: open.startedAt.toISOString(),
        seconds: netSeconds(open, now),
        paused: open.pausedAt !== null,
        pausedAt: open.pausedAt?.toISOString() ?? null,
        maxSeconds: STUDY_MAX_SECONDS,
      }
    : null;

  const week: AppStudyDay[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    const day = shiftYMD(brusselsYMD(now), -back);
    const key = ymdKey(day);
    const seconds = totals.get(key) ?? 0;
    week.push({ date: key, seconds, goalMet: seconds >= dailyGoalMinutes * 60 });
  }

  const groups = await groupStates(request, userId, memberships.map((row) => row.group), now);

  return {
    now: now.toISOString(),
    session,
    todaySeconds: sumFrom(mine, todayFrom, now),
    weekSeconds: sumFrom(mine, weekFrom, now),
    streak: streakFrom(totals, dailyGoalMinutes * 60, now),
    dailyGoalMinutes,
    week,
    subjects: recentSubjects(mine),
    groups,
  };
}

function sumFrom(sessions: StudySessionRow[], from: Date, now: Date): number {
  return sessions
    .filter((session) => session.startedAt >= from)
    .reduce((total, session) => total + netSeconds(session, now), 0);
}

/** De vakken die dit lid eerder intikte, meest recent eerst. */
function recentSubjects(sessions: StudySessionRow[]): string[] {
  const seen: string[] = [];
  for (const session of sessions) {
    const subject = session.subject?.trim();
    if (!subject) continue;
    if (seen.some((other) => other.toLowerCase() === subject.toLowerCase())) continue;
    seen.push(subject);
    if (seen.length >= 8) break;
  }
  return seen;
}

type GroupRow = {
  id: string;
  name: string;
  code: string;
  ownerId: string | null;
  weeklyGoalMinutes: number | null;
  members: { userId: string }[];
};

async function groupStates(
  request: Request,
  userId: string,
  groups: GroupRow[],
  now: Date,
): Promise<AppStudyGroup[]> {
  if (groups.length === 0) return [];

  const everyone = [...new Set(groups.flatMap((group) => group.members.map((m) => m.userId)))];
  const weekFrom = weekStart(now);
  const todayFrom = dayStart(now);

  // Eén vraag voor alle groepen samen. Per groep vragen zou betekenen dat wie in
  // vijf groepen zit vijf keer dezelfde rijen ophaalt.
  const [people, sessions] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: everyone } },
      select: { id: true, name: true, avatarKey: true },
    }),
    prisma.studySession.findMany({
      where: {
        userId: { in: everyone },
        OR: [{ startedAt: { gte: weekFrom } }, { endedAt: null }],
      },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const byUser = new Map<string, StudySessionRow[]>();
  for (const session of sessions) {
    const list = byUser.get(session.userId);
    if (list) list.push(session);
    else byUser.set(session.userId, [session]);
  }
  const personById = new Map(people.map((person) => [person.id, person]));

  return groups.map((group) => {
    const members: AppStudyMemberState[] = group.members.map(({ userId: memberId }) => {
      const person = personById.get(memberId);
      const theirs = byUser.get(memberId) ?? [];
      const open = theirs.find((session) => session.endedAt === null) ?? null;
      const live = open ? isLive(open, now) : false;

      return {
        userId: memberId,
        name: person?.name ?? "Onbekend",
        avatarUrl: absoluteMediaUrl(request, person?.avatarKey ?? null),
        studying: live && !open?.pausedAt,
        paused: live && Boolean(open?.pausedAt),
        // Wie zijn vak verbergt, verbergt het voor iedereen behalve zichzelf.
        subject:
          open && (!open.subjectHidden || memberId === userId) ? (open.subject ?? null) : null,
        liveSeconds: live && open ? netSeconds(open, now) : null,
        startedAt: live && open ? open.startedAt.toISOString() : null,
        weekSeconds: sumFrom(theirs, weekFrom, now),
        todaySeconds: sumFrom(theirs, todayFrom, now),
        isYou: memberId === userId,
      };
    });

    // Wie nu bezig is staat bovenaan (dat is waar de zaal over gaat), daarna op
    // de week. Bij gelijke tijd op naam, zodat de volgorde niet danst.
    members.sort((a, b) => {
      const aActive = a.studying || a.paused;
      const bActive = b.studying || b.paused;
      if (aActive !== bActive) return aActive ? -1 : 1;
      if (a.weekSeconds !== b.weekSeconds) return b.weekSeconds - a.weekSeconds;
      return a.name.localeCompare(b.name, "nl");
    });

    return {
      id: group.id,
      name: group.name,
      code: group.code,
      memberCount: group.members.length,
      liveCount: members.filter((member) => member.studying || member.paused).length,
      isOwner: group.ownerId === userId,
      weeklyGoalMinutes: group.weeklyGoalMinutes,
      weekSeconds: members.reduce((total, member) => total + member.weekSeconds, 0),
      members,
    };
  });
}
