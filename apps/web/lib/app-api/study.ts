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
 * **Het levensteken doet het echte werk.** De app meldt zich elke minuut zolang
 * ze open is. Blijft dat weg, dan is de sessie niet "nog bezig" maar afgebroken,
 * en telt ze tot het laatste teken van leven. Zonder die regel levert een telefoon
 * die 's avonds leegloopt de volgende ochtend veertien uur studietijd op, en dan
 * is de hele ranglijst een grap.
 *
 * **De marge van een minuut is met opzet.** Wie de app verlaat, pauzeert; maar een
 * pauze korter dan een minuut telt niet mee als pauze. Even een bericht lezen mag,
 * en een teller die daarop hapert voelt als een straf voor iets dat niemand
 * bedoeld heeft. Langer wegblijven is gewoon niet studeren.
 */

/** Zonder levensteken binnen deze tijd is iemand niet meer "nu bezig". */
export const STUDY_STALE_SECONDS = 180;
/** Een pauze korter dan dit telt niet. Even iets opzoeken is geen pauze. */
export const STUDY_PAUSE_GRACE_SECONDS = 60;
/** Netto maximum per sessie. Wie langer zit, splitst maar. */
export const STUDY_MAX_SECONDS = 8 * 60 * 60;
/**
 * Hoelang een sessie zonder levensteken open mag blijven staan voor we ze zelf
 * afsluiten. Ruim genoeg om een tunnel of een lege batterij te overleven zonder
 * je sessie kwijt te spelen, kort genoeg om niet dagen open te blijven staan.
 */
const STUDY_ABANDON_SECONDS = 30 * 60;

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

/** Of deze sessie nu echt loopt: open, en de app heeft zich net nog gemeld. */
export function isLive(session: StudySessionRow, now: Date): boolean {
  if (session.endedAt) return false;
  return now.getTime() - session.lastSeenAt.getTime() <= STUDY_STALE_SECONDS * 1000;
}

/**
 * De netto seconden van een sessie op dit moment.
 *
 * Voor een afgesloten sessie is dat gewoon het vastgelegde getal. Voor een
 * lopende sessie rekenen we tot nu; voor een sessie waarvan het levensteken
 * wegbleef tot het laatste teken van leven, want daarna weten we niets meer.
 */
export function netSeconds(session: StudySessionRow, now: Date): number {
  if (session.seconds !== null) return session.seconds;

  const cutoff = session.endedAt ?? (isLive(session, now) ? now : session.lastSeenAt);
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
    const stale = now.getTime() - session.lastSeenAt.getTime() > STUDY_ABANDON_SECONDS * 1000;
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
        endedAt: stale || duplicate ? session.lastSeenAt : now,
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
 * Tot waar deze sessie meetelt: haar eindtijd, nu, of het laatste levensteken.
 *
 * Eén plek, want `netSeconds` en het afsluiten moeten exact hetzelfde moment
 * gebruiken. Liepen ze uiteen, dan zou de stand op het scherm een andere zijn dan
 * die in de databank belandt, en dat is precies het soort verschil dat niemand
 * ooit terugvindt.
 */
export function cutoffFor(session: StudySessionRow, now: Date): Date {
  return session.endedAt ?? (isLive(session, now) ? now : session.lastSeenAt);
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
 * app twee uur geleden wegklikte en nu op stoppen drukt, hoort die twee uur niet
 * te krijgen; de sessie telt tot het laatste moment waarop we wisten dat ze nog
 * liep.
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

/** Het dagdoel van dit lid, in minuten. */
export async function setDailyGoal(userId: string, minutes: number): Promise<void> {
  const dailyGoalMinutes = Math.max(15, Math.min(1440, Math.round(minutes)));
  await prisma.studyProfile.upsert({
    where: { userId },
    update: { dailyGoalMinutes },
    create: { userId, dailyGoalMinutes },
  });
}
