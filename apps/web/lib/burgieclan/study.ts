import "server-only";

import { prisma } from "@vtk/db";

import { brusselsYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import { closeAbandonedSessions, dayStart, netSeconds, totalsPerDay } from "@/lib/app-api/study";
import { studyOverview } from "@/lib/app-api/studyGroups";

/** Hoe ver de dagtotalen voor de kalender van Burgieclan teruggaan: een blok en wat marge. */
const CALENDAR_DAYS = 120;

/**
 * Samen blokken zoals Burgieclan het toont (`docs/burgieclan-planning.md`, "Studietimer").
 *
 * De timer op Burgieclan is geen eigen klok maar dezelfde sessie als in de app: wat
 * je daar start, telt hier mee, en omgekeerd. Burgieclan krijgt daarom enkel wat
 * het tekent: de lopende sessie, de dag (wanneer begonnen, wanneer gestopt), het
 * dagdoel en de reeks, hoeveel van je groepen nu zitten, en een totaal per dag voor
 * de kalender. Namen en groepen blijven hier.
 */
export type BurgieclanStudy = {
  now: string;
  session: {
    startedAt: string;
    /** Netto seconden tot nu, pauzes er al af. */
    seconds: number;
    paused: boolean;
    pausedAt: string | null;
    subject: string | null;
    maxSeconds: number;
  } | null;
  todaySeconds: number;
  dailyGoalMinutes: number;
  streak: number;
  /** Groepsgenoten die nu echt zitten, jezelf niet meegeteld. */
  friendsStudying: number;
  /** De sessies van vandaag, oudste eerst: wanneer je begon en stopte. */
  today: { startedAt: string; endedAt: string | null; seconds: number }[];
  /** Seconden per Brusselse dag (`yyyy-mm-dd`), enkel dagen met tijd. */
  days: { date: string; seconds: number }[];
};

export async function burgieclanStudy(request: Request, userId: string, now: Date = new Date()): Promise<BurgieclanStudy> {
  await closeAbandonedSessions(userId, now);

  const since = new Date(dayStart(now).getTime() - CALENDAR_DAYS * 24 * 60 * 60 * 1000);
  const [overview, sessions] = await Promise.all([
    studyOverview(request, userId),
    prisma.studySession.findMany({
      where: { userId, OR: [{ startedAt: { gte: since } }, { endedAt: null }] },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  const friends = new Set<string>();
  for (const group of overview.groups) {
    for (const member of group.members) {
      if (member.studying && !member.isYou) friends.add(member.userId);
    }
  }

  const todayFrom = dayStart(now);
  const today = sessions
    .filter((session) => session.startedAt >= todayFrom)
    .map((session) => ({
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      seconds: netSeconds(session, now),
    }));

  const totals = totalsPerDay(sessions, now);
  const days: { date: string; seconds: number }[] = [];
  for (let back = CALENDAR_DAYS; back >= 0; back -= 1) {
    const date = ymdKey(shiftYMD(brusselsYMD(now), -back));
    const seconds = totals.get(date) ?? 0;
    if (seconds > 0) days.push({ date, seconds });
  }

  const session = overview.session;
  return {
    now: overview.now,
    session: session
      ? {
          startedAt: session.startedAt,
          seconds: session.seconds,
          paused: session.paused,
          pausedAt: session.pausedAt,
          subject: session.subjectHidden ? null : session.subject,
          maxSeconds: session.maxSeconds,
        }
      : null,
    todaySeconds: overview.todaySeconds,
    dailyGoalMinutes: overview.dailyGoalMinutes,
    streak: overview.streak,
    friendsStudying: friends.size,
    today,
    days,
  };
}
