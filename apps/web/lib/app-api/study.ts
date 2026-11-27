import "server-only";

import { prisma } from "@vtk/db";

import { brusselsYMD, brusselsWallClockMinutes, shiftYMD, ymdKey, type YMD } from "@/lib/brussels";

/**
 * Studietijd meten: de sessie, de dag, de week en de reeks.
 *
 * **Een sessie heeft geen duur totdat ze eindigt.** Ze loopt, ze pauzeert, ze
 * loopt weer. Wat je ziet is dus altijd een berekening op dit moment, en niet een
 * veld dat ergens opgeteld wordt. Pas bij het afsluiten legt `seconds` de uitkomst
 * vast; daarna verandert er niets meer aan.
 *
 * **De teller loopt door buiten de app.** Sinds november 2026: wie begint, legt
 * zijn telefoon weg, en dat is net de bedoeling. Tot dan pauzeerde de app zodra
 * je haar verliet, en stond je na een uur studeren met een vergrendeld scherm op
 * nul. De app meldt zich nog elke minuut zolang ze open is, en dat levensteken
 * beslist nog altijd hoever een sessie mag lopen.
 *
 * **Maar een vergeten teller levert geen nacht op.** Zonder levensteken telt een
 * sessie hoogstens `STUDY_AWAY_SECONDS` door na het laatste; daarna sluit ze
 * vanzelf op dat punt. Wie de app tussendoor even opent, schuift die grens op.
 * Zonder die regel levert een telefoon die 's avonds leegloopt de volgende
 * ochtend acht uur studietijd op, en dan is de hele ranglijst een grap.
 *
 * **De marge van een minuut is met opzet.** Een pauze (met de knop) korter dan
 * een minuut telt niet mee als pauze; een teller die daarop hapert voelt als een
 * straf voor iets dat niemand bedoeld heeft.
 */

/**
 * Zo lang telt een sessie door zonder dat de app zich meldt: de telefoon ligt
 * weg terwijl je studeert. Daarna is ze afgebroken, op dit punt na het laatste
 * levensteken.
 */
export const STUDY_AWAY_SECONDS = 3 * 60 * 60;
/** Een pauze korter dan dit telt niet. Even iets opzoeken is geen pauze. */
export const STUDY_PAUSE_GRACE_SECONDS = 60;
/** Netto maximum per sessie. Wie langer zit, splitst maar. */
export const STUDY_MAX_SECONDS = 8 * 60 * 60;

export type StudySessionRow = {
  id: string;
  userId: string;
  subject: string | null;
  subjectHidden: boolean;
  startedAt: Date;
  endedAt: Date | null;
  pausedAt: Date | null;
  pausedSeconds: number;
  lastSeenAt: Date;
  seconds: number | null;
};

/** Of deze sessie nu loopt: open, en het laatste levensteken is niet te lang geleden. */
export function isLive(session: StudySessionRow, now: Date): boolean {
  if (session.endedAt) return false;
  return now.getTime() - session.lastSeenAt.getTime() <= STUDY_AWAY_SECONDS * 1000;
}

/** Waar een sessie zonder levensteken ophoudt met tellen. */
function awayLimit(session: StudySessionRow): Date {
  return new Date(session.lastSeenAt.getTime() + STUDY_AWAY_SECONDS * 1000);
}

/**
 * De netto seconden van een sessie op dit moment.
 *
 * Voor een afgesloten sessie is dat gewoon het vastgelegde getal. Voor een
 * lopende sessie rekenen we tot nu; voor een sessie waarvan het levensteken te
 * lang wegbleef tot `STUDY_AWAY_SECONDS` na het laatste (`cutoffFor`).
 */
export function netSeconds(session: StudySessionRow, now: Date): number {
  if (session.seconds !== null) return session.seconds;

  const cutoff = cutoffFor(session, now);
  const gross = (cutoff.getTime() - session.startedAt.getTime()) / 1000;

  let paused = session.pausedSeconds;
  if (session.pausedAt && !session.endedAt) {
    const open = (cutoff.getTime() - session.pausedAt.getTime()) / 1000;
    paused += Math.max(0, open - STUDY_PAUSE_GRACE_SECONDS);
  }

  return Math.max(0, Math.min(STUDY_MAX_SECONDS, Math.round(gross - paused)));
}

/** Middernacht in Brussel van de dag waarin dit instant valt. */
export function dayStart(now: Date): Date {
  return brusselsWallClockMinutes(brusselsYMD(now), 0);
}

/** Maandag middernacht in Brussel van de week waarin dit instant valt. */
export function weekStart(now: Date): Date {
  const today = brusselsYMD(now);
  // `Date.UTC` met de kalenderdatum geeft de juiste weekdag, ongeacht tijdzone.
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const backToMonday = weekday === 0 ? 6 : weekday - 1;
  return brusselsWallClockMinutes(shiftYMD(today, -backToMonday), 0);
}

/**
 * Sluit af wat blijven openstaan is, en kapt af wat over de maximumduur ging.
 *
 * Draait bij elke aanvraag van het lid zelf. Dat is bewust geen achtergrondtaak:
 * een sessie die niemand meer opvraagt hoeft ook niet opgeruimd te zijn, en zodra
 * iemand terugkomt, gebeurt het vanzelf en op het juiste moment.
 */
export async function closeAbandonedSessions(userId: string, now: Date): Promise<void> {
  const open = await prisma.studySession.findMany({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (open.length === 0) return;

  for (const [index, session] of open.entries()) {
    const stale = !isLive(session, now);
    const seconds = netSeconds(session, now);
    const overCap = seconds >= STUDY_MAX_SECONDS;
    // Er hoort er hoogstens één open te staan. Staat er toch meer dan één (twee
    // toestellen, een aanvraag die halverwege stierf), dan blijft de nieuwste
    // staan en gaan de rest dicht.
    const duplicate = index > 0;

    if (!stale && !overCap && !duplicate) continue;

    await prisma.studySession.update({
      where: { id: session.id },
      data: {
        endedAt: duplicate ? session.lastSeenAt : cutoffFor(session, now),
        seconds,
        endedReason: overCap ? "cap" : "timeout",
        pausedAt: null,
      },
    });
  }
}

export type DayTotal = { key: string; seconds: number };

/**
 * Totalen per Brusselse kalenderdag, over de sessies die je meegeeft.
 *
 * Een sessie hoort bij de dag waarop ze **begon**. Wie om half twaalf 's avonds
 * begint en tot twee uur doorgaat, heeft dat op één avond gedaan; die tijd over
 * twee dagen splitsen zou een reeks breken die niemand gebroken heeft.
 */
export function totalsPerDay(sessions: StudySessionRow[], now: Date): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    const key = ymdKey(brusselsYMD(session.startedAt));
    totals.set(key, (totals.get(key) ?? 0) + netSeconds(session, now));
  }
  return totals;
}

/**
 * Dagen op rij waarop het dagdoel gehaald werd.
 *
 * Vandaag telt enkel mee wanneer het doel al gehaald is; is dat nog niet zo, dan
 * loopt de reeks vanaf gisteren door. Anders zou je reeks elke ochtend op nul
 * springen en 's avonds terug op tien, en dat is geen reeks maar een sirene.
 */
export function streakFrom(totals: Map<string, number>, goalSeconds: number, now: Date): number {
  if (goalSeconds <= 0) return 0;

  let day: YMD = brusselsYMD(now);
  if ((totals.get(ymdKey(day)) ?? 0) < goalSeconds) day = shiftYMD(day, -1);

  let streak = 0;
  // Een jaar is ruim genoeg; niemand studeert 365 dagen op rij, en zo eindigt de
  // lus ook wanneer er iets geks in de gegevens staat.
  for (let guard = 0; guard < 366; guard += 1) {
    if ((totals.get(ymdKey(day)) ?? 0) < goalSeconds) break;
    streak += 1;
    day = shiftYMD(day, -1);
  }
  return streak;
}

/**
 * Tot waar deze sessie meetelt: haar eindtijd, nu, of de grens na het laatste
 * levensteken.
 *
 * Eén plek, want `netSeconds` en het afsluiten moeten exact hetzelfde moment
 * gebruiken. Liepen ze uiteen, dan zou de stand op het scherm een andere zijn dan
 * die in de databank belandt, en dat is precies het soort verschil dat niemand
 * ooit terugvindt.
 */
export function cutoffFor(session: StudySessionRow, now: Date): Date {
  return session.endedAt ?? (isLive(session, now) ? now : awayLimit(session));
}

/** De open sessie van dit lid, of `null`. */
export async function openSessionOf(userId: string): Promise<StudySessionRow | null> {
  return prisma.studySession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Gaan zitten.
 *
 * Loopt er al een sessie, dan gebeurt er niets en krijg je die terug. Twee keer
 * op de knop drukken hoort geen tweede sessie te maken, en al helemaal niet je
 * eerste kwijt te spelen.
 */
export async function startStudySession(
  userId: string,
  input: { subject?: string; subjectHidden?: boolean },
  now: Date = new Date(),
): Promise<{ session: StudySessionRow; started: boolean }> {
  await closeAbandonedSessions(userId, now);

  const existing = await openSessionOf(userId);
  if (existing) return { session: existing, started: false };

  const subject = input.subject?.trim();
  if (subject) await rememberSubject(userId, subject);
  const session = await prisma.studySession.create({
    data: {
      userId,
      subject: subject ? subject : null,
      subjectHidden: input.subjectHidden ?? false,
      startedAt: now,
      lastSeenAt: now,
    },
  });

  return { session, started: true };
}

/**
 * Pauzeren, hervatten, of enkel laten weten dat het scherm nog openstaat.
 *
 * Het hervatten is de enige plek waar de marge van een minuut toegepast wordt, en
 * ze staat hier in exact dezelfde vorm als in `netSeconds`. Zou de ene rekenen met
 * marge en de andere zonder, dan verspringt je teller op het moment dat je
 * terugkomt.
 */
export async function updateStudySession(
  userId: string,
  input: { action: "pause" | "resume" | "heartbeat"; subject?: string; subjectHidden?: boolean },
  now: Date = new Date(),
): Promise<void> {
  await closeAbandonedSessions(userId, now);

  const session = await openSessionOf(userId);
  if (!session) return;

  const subject = input.subject?.trim();
  const text: { subject?: string | null; subjectHidden?: boolean } = {
    ...(input.subject === undefined ? {} : { subject: subject ? subject : null }),
    ...(input.subjectHidden === undefined ? {} : { subjectHidden: input.subjectHidden }),
  };

  if (input.action === "pause") {
    await prisma.studySession.update({
      where: { id: session.id },
      data: { ...text, lastSeenAt: now, pausedAt: session.pausedAt ?? now },
    });
    return;
  }

  if (input.action === "resume") {
    if (!session.pausedAt) {
      await prisma.studySession.update({
        where: { id: session.id },
        data: { ...text, lastSeenAt: now },
      });
      return;
    }
    const paused = (now.getTime() - session.pausedAt.getTime()) / 1000;
    await prisma.studySession.update({
      where: { id: session.id },
      data: {
        ...text,
        lastSeenAt: now,
        pausedAt: null,
        pausedSeconds:
          session.pausedSeconds + Math.max(0, Math.round(paused - STUDY_PAUSE_GRACE_SECONDS)),
      },
    });
    return;
  }

  await prisma.studySession.update({
    where: { id: session.id },
    data: { ...text, lastSeenAt: now },
  });
}

/**
 * Opstaan.
 *
 * `lastSeenAt` wordt hier met opzet **niet** bijgewerkt voor het rekenen. Wie zijn
 * app vijf uur geleden wegklikte en nu op stoppen drukt, krijgt er drie
 * (`STUDY_AWAY_SECONDS`) en niet vijf.
 */
export async function stopStudySession(
  userId: string,
  now: Date = new Date(),
): Promise<{ seconds: number; subject: string | null } | null> {
  await closeAbandonedSessions(userId, now);

  const session = await openSessionOf(userId);
  if (!session) return null;

  const seconds = netSeconds(session, now);
  await prisma.studySession.update({
    where: { id: session.id },
    data: {
      endedAt: cutoffFor(session, now),
      seconds,
      endedReason: seconds >= STUDY_MAX_SECONDS ? "cap" : "user",
      pausedAt: null,
    },
  });

  return { seconds, subject: session.subject };
}

/** Zoveel vakken mag de lijst onder "Waaraan werk je?" hebben. */
export const STUDY_MAX_SUBJECTS = 20;

/**
 * Een lijst vakken opgekuist: ingekort, zonder lege en zonder dubbele (los van
 * hoofdletters, de eerste wint), en niet langer dan het maximum.
 */
export function cleanSubjects(subjects: readonly string[]): string[] {
  const kept: string[] = [];
  for (const raw of subjects) {
    const subject = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!subject) continue;
    if (kept.some((other) => other.toLowerCase() === subject.toLowerCase())) continue;
    kept.push(subject);
    if (kept.length >= STUDY_MAX_SUBJECTS) break;
  }
  return kept;
}

/**
 * De vakken onder "Waaraan werk je?" bewaren, zoals het lid ze in de app beheert.
 * Vanaf dan is dat de lijst, en niet langer wat er in de laatste sessies stond.
 */
export async function setStudySubjects(userId: string, subjects: readonly string[], now = new Date()): Promise<void> {
  const clean = cleanSubjects(subjects);
  await prisma.studyProfile.upsert({
    where: { userId },
    update: { subjects: clean, subjectsSetAt: now },
    create: { userId, subjects: clean, subjectsSetAt: now },
  });
}

/**
 * Een nieuw ingetikt vak komt vooraan in een lijst die het lid zelf beheert; wie
 * nooit iets beheerde, krijgt het toch al te zien via zijn laatste sessies.
 */
async function rememberSubject(userId: string, subject: string): Promise<void> {
  const profile = await prisma.studyProfile.findUnique({ where: { userId } });
  if (!profile?.subjectsSetAt) return;
  if (profile.subjects.some((other) => other.toLowerCase() === subject.toLowerCase())) return;
  await prisma.studyProfile.update({
    where: { userId },
    data: { subjects: cleanSubjects([subject, ...profile.subjects]) },
  });
}

/** Het dagdoel van dit lid, in minuten. */
export async function setDailyGoal(userId: string, minutes: number): Promise<void> {
  const dailyGoalMinutes = Math.max(15, Math.min(1440, Math.round(minutes)));
  await prisma.studyProfile.upsert({
    where: { userId },
    update: { dailyGoalMinutes },
    create: { userId, dailyGoalMinutes },
  });
}
