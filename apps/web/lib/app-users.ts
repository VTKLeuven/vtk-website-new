import { prisma } from "@vtk/db";
import { currentStudyYear, currentWorkingYear } from "@/lib/workingYear";

/**
 * Wie heeft de VTK-app, en wie niet (Admin › Website › App › Wie heeft de app).
 *
 * "De app hebben" betekent hier: ooit ingelogd in de app. Een installatie zonder
 * login (`AppInstall.userId` leeg) is van niemand bekend en telt dus nergens.
 * Twee bronnen samen:
 *
 * - `AppInstall`: sinds de gebruiksrapporten van 24 november 2026. Een
 *   installatie houdt haar laatste `userId`, ook na uitloggen.
 * - `AppPushDevice`: een pushtoken, ook van voor die update. Wie de app eerder
 *   had en die update nog niet opende, staat enkel hier.
 *
 * Bewust enkel of iemand de app heeft, op welk toestel en wanneer laatst. Wat
 * iemand erin deed (schermen, sessies) blijft enkel in de totalen van de
 * statistieken. Zie docs/app-gebruik.md.
 */

export type AppUserPopulation = "praesidium" | "leden" | "alle";
export type AppUserStatus = "alle" | "met" | "zonder";

export type AppUsage = {
  platforms: Array<"ios" | "android">;
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** Meldingen aan op minstens één toestel; null zolang het nergens gevraagd is. */
  pushEnabled: boolean | null;
  appVersion: string | null;
};

export type AppUserRow = {
  userId: string;
  name: string;
  email: string;
  rNumber: string | null;
  /** De posten van dit werkingsjaar, enkel bij het praesidium. */
  posts: string[];
  app: AppUsage | null;
};

export type AppUserTotals = {
  total: number;
  withApp: number;
  ios: number;
  android: number;
  /** Met de app, maar de laatste 30 dagen niet meer geopend. */
  dormant: number;
};

export function parsePopulation(raw: string | undefined): AppUserPopulation {
  return raw === "leden" || raw === "alle" ? raw : "praesidium";
}

export function parseStatus(raw: string | undefined): AppUserStatus {
  return raw === "met" || raw === "zonder" ? raw : "alle";
}

const DAY = 86_400_000;

/** Telt hoeveel van een groep de app heeft. Pure functie: zie de test. */
export function appUserTotals(rows: AppUserRow[], now: Date): AppUserTotals {
  const since = now.getTime() - 30 * DAY;
  let withApp = 0;
  let ios = 0;
  let android = 0;
  let dormant = 0;
  for (const row of rows) {
    if (!row.app) continue;
    withApp += 1;
    if (row.app.platforms.includes("ios")) ios += 1;
    if (row.app.platforms.includes("android")) android += 1;
    if (row.app.lastSeenAt.getTime() < since) dormant += 1;
  }
  return { total: rows.length, withApp, ios, android, dormant };
}

/**
 * Filtert op status en zoekterm, en sorteert: zonder app eerst wanneer je beide
 * ziet (dat is wie je wil aanspreken), daarna op naam.
 */
export function filterAppUsers(rows: AppUserRow[], status: AppUserStatus, query: string): AppUserRow[] {
  const needle = query.trim().toLocaleLowerCase("nl-BE");
  return rows
    .filter((row) => (status === "met" ? row.app !== null : status === "zonder" ? row.app === null : true))
    .filter((row) => {
      if (!needle) return true;
      return [row.name, row.email, row.rNumber ?? "", ...row.posts].some((value) =>
        value.toLocaleLowerCase("nl-BE").includes(needle),
      );
    })
    .sort((a, b) => {
      if (status === "alle" && (a.app === null) !== (b.app === null)) return a.app === null ? -1 : 1;
      return a.name.localeCompare(b.name, "nl-BE", { sensitivity: "base" });
    });
}

/** Per account: of en hoe het de app heeft, uit de installaties en de pushtokens samen. */
async function appUsageByUser(userIds: string[] | null): Promise<Map<string, AppUsage>> {
  if (userIds !== null && userIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<
    Array<{
      userId: string;
      platforms: string[];
      firstSeenAt: Date;
      lastSeenAt: Date;
      pushEnabled: boolean | null;
      appVersion: string | null;
    }>
  >`
    SELECT "userId",
           array_agg(DISTINCT platform) AS platforms,
           min(first) AS "firstSeenAt",
           max(last) AS "lastSeenAt",
           bool_or(push) AS "pushEnabled",
           (array_agg(version ORDER BY last DESC) FILTER (WHERE version IS NOT NULL))[1] AS "appVersion"
    FROM (
      SELECT "userId", platform::text AS platform, "firstSeenAt" AS first, "lastSeenAt" AS last,
             "pushEnabled" AS push, "appVersion" AS version
      FROM "AppInstall"
      WHERE "userId" IS NOT NULL
      UNION ALL
      SELECT "userId", platform::text, "createdAt", "lastSeenAt", true, "appVersion"
      FROM "AppPushDevice"
    ) devices
    WHERE ${userIds === null} OR "userId" = ANY(${userIds ?? []}::text[])
    GROUP BY "userId"
  `;
  return new Map(
    rows.map((row) => [
      row.userId,
      {
        platforms: (["ios", "android"] as const).filter((platform) => row.platforms.includes(platform)),
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        pushEnabled: row.pushEnabled,
        appVersion: row.appVersion,
      },
    ]),
  );
}

type Person = { id: string; name: string; email: string; rNumber: string | null };

/**
 * De groep met per persoon de app. `alle` is elk account dat de app heeft: wie
 * ze niet heeft, is daar elk account op de site, en zo'n lijst zegt niets.
 */
export async function loadAppUsers(population: AppUserPopulation, locale: "nl" | "en", now = new Date()): Promise<AppUserRow[]> {
  const people = new Map<string, Person & { posts: string[] }>();

  if (population === "praesidium") {
    const memberships = await prisma.groupMembership.findMany({
      where: { year: currentWorkingYear(now), group: { type: "PRAESIDIUM" } },
      select: {
        user: { select: { id: true, name: true, email: true, rNumber: true } },
        group: { select: { nameNl: true, nameEn: true, orderInPraesidium: true } },
      },
      orderBy: { group: { orderInPraesidium: "asc" } },
    });
    for (const { user, group } of memberships) {
      const entry = people.get(user.id) ?? { ...user, posts: [] };
      const post = locale === "nl" ? group.nameNl : group.nameEn;
      if (!entry.posts.includes(post)) entry.posts.push(post);
      people.set(user.id, entry);
    }
  } else if (population === "leden") {
    const memberships = await prisma.membership.findMany({
      where: { year: currentStudyYear(now), activatedAt: { not: null } },
      select: { user: { select: { id: true, name: true, email: true, rNumber: true } } },
    });
    for (const { user } of memberships) people.set(user.id, { ...user, posts: [] });
  }

  const usage = await appUsageByUser(population === "alle" ? null : [...people.keys()]);

  if (population === "alle") {
    const users = await prisma.user.findMany({
      where: { id: { in: [...usage.keys()] } },
      select: { id: true, name: true, email: true, rNumber: true },
    });
    for (const user of users) people.set(user.id, { ...user, posts: [] });
  }

  return [...people.values()].map((person) => ({
    userId: person.id,
    name: person.name,
    email: person.email,
    rNumber: person.rNumber,
    posts: person.posts,
    app: usage.get(person.id) ?? null,
  }));
}
