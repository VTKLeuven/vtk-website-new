import "server-only";

import { prisma } from "@vtk/db";

import { addDays, brusselsDay, cohortTable, fill, mondayOf, seriesKeys, share, type CohortRow } from "./app-usage-series";

/**
 * De statistieken van de VTK-app voor Admin › Website › App: hoeveel mensen de
 * app hebben, hoe vaak ze ze openen, of ze terugkomen, wat ze erin doen, en
 * hoeveel van de bestellingen uit de app komen tegenover de website.
 *
 * De bronnen zijn de tabellen die `lib/app-api/usage.ts` vult (`AppInstall`,
 * `AppSession`, `AppScreenDay`, `AppAction`), en voor de vergelijking met de
 * website de bestellingen zelf. Wat een "sessie" of "actief" is, staat in
 * docs/app-gebruik.md; hier wordt enkel geteld.
 *
 * Alle dagen zijn dagen in Brussel.
 */

const TZ = "Europe/Brussels";
/** Boven zoveel dagen tekenen de grafieken per week. */
const WEEKLY_ABOVE_DAYS = 45;
/** Zoveel installatieweken staan er in de cohorttabel, en zoveel weken erna. */
export const COHORT_WEEKS = 8;

export type UsageRange = { from: Date | null; to: Date };

type CountRow = { key: string; value: number };

export type ChannelStats = {
  key: "tickets" | "theokot" | "shiften" | "piano";
  total: number;
  app: number;
  /** In cent; null waar er geen bedrag bij hoort. */
  totalCents: number | null;
  appCents: number | null;
};

export type AppUsageStats = Awaited<ReturnType<typeof loadAppUsageStats>>;

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export async function loadAppUsageStats(range: UsageRange, now = new Date()) {
  const d1 = new Date(now.getTime() - 86_400_000);
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const today = brusselsDay(now);

  // Wanneer de meting begon: de eerste installatie. Een periode van voor die
  // dag toont geen nullen maar begint pas daar.
  const first = await prisma.appInstall.aggregate({ _min: { firstSeenAt: true } });
  const measuringSince = first._min.firstSeenAt;
  if (!measuringSince) return null;

  const from = range.from && range.from > measuringSince ? range.from : measuringSince;
  const to = range.to;
  const fromDay = brusselsDay(from);
  const toDay = brusselsDay(to);
  const days = Math.round((Date.parse(`${toDay}T12:00:00Z`) - Date.parse(`${fromDay}T12:00:00Z`)) / 86_400_000) + 1;
  const unit: "day" | "week" = days > WEEKLY_ABOVE_DAYS ? "week" : "day";
  const keys = seriesKeys(fromDay, toDay, unit);
  const cohortStart = addDays(mondayOf(today), -(COHORT_WEEKS - 1) * 7);

  const [
    installs,
    activity,
    members,
    perDayInstalls,
    perDayActive,
    sessionTotals,
    perHour,
    perWeekday,
    frequency,
    retention,
    cohortSizes,
    cohortActive,
    screens,
    tabs,
    versions,
    systems,
    models,
    channels,
    channelWeeks,
    appActions,
  ] = await Promise.all([
    // ---- Installaties: de stand nu, en wat er in de periode bijkwam
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE platform = 'ios')::int AS ios,
        count(*) FILTER (WHERE platform = 'android')::int AS android,
        count(*) FILTER (WHERE "lastSeenAt" >= ${d1})::int AS active1,
        count(*) FILTER (WHERE "lastSeenAt" >= ${d7})::int AS active7,
        count(*) FILTER (WHERE "lastSeenAt" >= ${d30})::int AS active30,
        count(*) FILTER (WHERE "lastSeenAt" < ${d30})::int AS dormant,
        count(*) FILTER (WHERE "userId" IS NOT NULL)::int AS "signedIn",
        count(DISTINCT "userId")::int AS members,
        count(*) FILTER (WHERE "pushEnabled" = true)::int AS "pushOn",
        count(*) FILTER (WHERE "pushEnabled" IS NOT NULL)::int AS "pushAsked",
        count(*) FILTER (WHERE "expoGo")::int AS "expoGo",
        count(*) FILTER (WHERE locale = 'en')::int AS english,
        count(*) FILTER (WHERE "firstSeenAt" >= ${from} AND "firstSeenAt" < ${to})::int AS "newInPeriod",
        count(*) FILTER (WHERE "firstSeenAt" >= ${from} AND "firstSeenAt" < ${to} AND platform = 'ios')::int AS "newIos",
        count(*) FILTER (WHERE "firstSeenAt" >= ${from} AND "firstSeenAt" < ${to} AND platform = 'android')::int AS "newAndroid"
      FROM "AppInstall"
    `,
    // ---- Actief: vandaag, deze week, deze maand (unieke installaties met een sessie)
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        count(DISTINCT "installId") FILTER (WHERE ("lastSeenAt" AT TIME ZONE ${TZ})::date = ${today}::date)::int AS dau,
        count(DISTINCT "installId") FILTER (WHERE "lastSeenAt" >= ${d7})::int AS wau,
        count(DISTINCT "installId") FILTER (WHERE "lastSeenAt" >= ${d30})::int AS mau,
        count(DISTINCT "userId") FILTER (WHERE "lastSeenAt" >= ${d30})::int AS "members30",
        (SELECT avg(n) FROM (
          SELECT count(DISTINCT "installId") AS n FROM "AppSession"
          WHERE "startedAt" >= ${d30}
          GROUP BY ("startedAt" AT TIME ZONE ${TZ})::date
        ) daily)::float8 AS "avgDau30"
      FROM "AppSession"
      WHERE "lastSeenAt" >= ${d30}
    `,
    // ---- Leden die de afgelopen 30 dagen ergens ingelogd waren (site of app): de noemer voor "welk deel gebruikt de app"
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT count(DISTINCT "userId")::int AS active FROM "session" WHERE "updatedAt" >= ${d30}
    `,
    // ---- Nieuwe installaties per dag of week, per platform
    prisma.$queryRaw<Array<{ key: string; platform: string; value: number }>>`
      SELECT to_char(date_trunc(${unit}, "firstSeenAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS key,
             platform::text AS platform, count(*)::int AS value
      FROM "AppInstall"
      WHERE "firstSeenAt" >= ${from} AND "firstSeenAt" < ${to}
      GROUP BY 1, 2
    `,
    // ---- Actieve installaties, sessies en leden per dag of week
    prisma.$queryRaw<Array<{ key: string; installs: number; sessions: number; members: number; minutes: number }>>`
      SELECT to_char(date_trunc(${unit}, "startedAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS key,
             count(DISTINCT "installId")::int AS installs,
             count(*)::int AS sessions,
             count(DISTINCT "userId")::int AS members,
             (sum("activeSeconds") / 60.0)::float8 AS minutes
      FROM "AppSession"
      WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
      GROUP BY 1
    `,
    // ---- Sessies in de periode
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        count(*)::int AS sessions,
        count(DISTINCT "installId")::int AS installs,
        count(DISTINCT "userId")::int AS members,
        avg("activeSeconds")::float8 AS "avgSeconds",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "activeSeconds")::float8 AS "medianSeconds",
        sum("activeSeconds")::float8 AS "totalSeconds",
        avg("screenViews")::float8 AS "avgScreens",
        sum("screenViews")::int AS "screenViews"
      FROM "AppSession"
      WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
    `,
    // ---- Wanneer de app geopend wordt: per uur en per weekdag
    prisma.$queryRaw<CountRow[]>`
      SELECT extract(hour FROM "startedAt" AT TIME ZONE ${TZ})::int::text AS key, count(*)::int AS value
      FROM "AppSession" WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
      GROUP BY 1
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT extract(isodow FROM "startedAt" AT TIME ZONE ${TZ})::int::text AS key, count(*)::int AS value
      FROM "AppSession" WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
      GROUP BY 1
    `,
    // ---- Hoe vaak: sessies en verschillende dagen per installatie in de periode
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        count(*) FILTER (WHERE sessions = 1)::int AS once,
        count(*) FILTER (WHERE sessions BETWEEN 2 AND 4)::int AS few,
        count(*) FILTER (WHERE sessions BETWEEN 5 AND 19)::int AS regular,
        count(*) FILTER (WHERE sessions >= 20)::int AS heavy,
        count(*) FILTER (WHERE days >= 2)::int AS "multiDay",
        count(*) FILTER (WHERE days >= 7)::int AS "sevenDays",
        count(*)::int AS total,
        avg(sessions)::float8 AS "avgSessions",
        avg(days)::float8 AS "avgDays"
      FROM (
        SELECT "installId", count(*) AS sessions, count(DISTINCT ("startedAt" AT TIME ZONE ${TZ})::date) AS days
        FROM "AppSession" WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
        GROUP BY 1
      ) per_install
    `,
    // ---- Terugkomen: van de installaties uit de periode, wie opende de app opnieuw na 1, 7 en 30 dagen
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        count(*) FILTER (WHERE i."firstSeenAt" <= now() - interval '1 day')::int AS "eligible1",
        count(*) FILTER (WHERE i."firstSeenAt" <= now() - interval '1 day' AND EXISTS (
          SELECT 1 FROM "AppSession" s WHERE s."installId" = i.id AND s."lastSeenAt" >= i."firstSeenAt" + interval '1 day'))::int AS "back1",
        count(*) FILTER (WHERE i."firstSeenAt" <= now() - interval '7 days')::int AS "eligible7",
        count(*) FILTER (WHERE i."firstSeenAt" <= now() - interval '7 days' AND EXISTS (
          SELECT 1 FROM "AppSession" s WHERE s."installId" = i.id AND s."lastSeenAt" >= i."firstSeenAt" + interval '7 days'))::int AS "back7",
        count(*) FILTER (WHERE i."firstSeenAt" <= now() - interval '30 days')::int AS "eligible30",
        count(*) FILTER (WHERE i."firstSeenAt" <= now() - interval '30 days' AND EXISTS (
          SELECT 1 FROM "AppSession" s WHERE s."installId" = i.id AND s."lastSeenAt" >= i."firstSeenAt" + interval '30 days'))::int AS "back30",
        count(*) FILTER (WHERE (SELECT count(*) FROM "AppSession" s WHERE s."installId" = i.id) >= 2)::int AS "twoSessions",
        count(*)::int AS total
      FROM "AppInstall" i
      WHERE i."firstSeenAt" >= ${from} AND i."firstSeenAt" < ${to}
    `,
    // ---- Cohorten: de laatste weken, los van de gekozen periode
    prisma.$queryRaw<Array<{ week: string; size: number }>>`
      SELECT to_char(date_trunc('week', "firstSeenAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS week, count(*)::int AS size
      FROM "AppInstall"
      WHERE ("firstSeenAt" AT TIME ZONE ${TZ})::date >= ${cohortStart}::date
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ week: string; offset: number; installs: number }>>`
      WITH cohort AS (
        SELECT id, date_trunc('week', "firstSeenAt" AT TIME ZONE ${TZ})::date AS week
        FROM "AppInstall"
        WHERE ("firstSeenAt" AT TIME ZONE ${TZ})::date >= ${cohortStart}::date
      ),
      activity AS (
        SELECT DISTINCT s."installId", date_trunc('week', s."lastSeenAt" AT TIME ZONE ${TZ})::date AS week
        FROM "AppSession" s JOIN cohort c ON c.id = s."installId"
      )
      SELECT to_char(c.week, 'YYYY-MM-DD') AS week, ((a.week - c.week) / 7)::int AS "offset", count(DISTINCT a."installId")::int AS installs
      FROM cohort c JOIN activity a ON a."installId" = c.id AND a.week >= c.week
      GROUP BY 1, 2
    `,
    // ---- Schermen
    prisma.$queryRaw<Array<{ screen: string; tab: string; views: number; installs: number }>>`
      SELECT screen, tab, sum(views)::int AS views, count(DISTINCT "installId")::int AS installs
      FROM "AppScreenDay"
      WHERE day >= ${fromDay}::date AND day <= ${toDay}::date
      GROUP BY 1, 2
      ORDER BY views DESC
      LIMIT 40
    `,
    prisma.$queryRaw<Array<{ tab: string; views: number; installs: number }>>`
      SELECT tab, sum(views)::int AS views, count(DISTINCT "installId")::int AS installs
      FROM "AppScreenDay"
      WHERE day >= ${fromDay}::date AND day <= ${toDay}::date
      GROUP BY 1
      ORDER BY views DESC
    `,
    // ---- Toestellen en versies, van wie de app de laatste 30 dagen opende
    prisma.$queryRaw<Array<{ version: string | null; channel: string | null; update: string | null; installs: number }>>`
      SELECT "appVersion" AS version, channel, left("updateId", 8) AS update, count(*)::int AS installs
      FROM "AppInstall" WHERE "lastSeenAt" >= ${d30}
      GROUP BY 1, 2, 3 ORDER BY installs DESC LIMIT 15
    `,
    prisma.$queryRaw<Array<{ platform: string; os: string | null; installs: number }>>`
      SELECT platform::text AS platform, split_part(coalesce("osVersion", '?'), '.', 1) AS os, count(*)::int AS installs
      FROM "AppInstall" WHERE "lastSeenAt" >= ${d30}
      GROUP BY 1, 2 ORDER BY installs DESC LIMIT 15
    `,
    prisma.$queryRaw<Array<{ model: string; installs: number }>>`
      SELECT "deviceModel" AS model, count(*)::int AS installs
      FROM "AppInstall" WHERE "lastSeenAt" >= ${d30} AND "deviceModel" IS NOT NULL
      GROUP BY 1 ORDER BY installs DESC LIMIT 10
    `,
    // ---- App tegenover website
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        (SELECT count(*) FROM "TicketOrder" o
          WHERE o.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o."paidAt" >= ${from} AND o."paidAt" < ${to})::int AS "ticketsTotal",
        (SELECT count(*) FROM "TicketOrder" o
          WHERE o.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o."paidAt" >= ${from} AND o."paidAt" < ${to} AND o.source = 'app')::int AS "ticketsApp",
        (SELECT coalesce(sum(o."totalCents"), 0) FROM "TicketOrder" o
          WHERE o.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o."paidAt" >= ${from} AND o."paidAt" < ${to})::float8 AS "ticketsTotalCents",
        (SELECT coalesce(sum(o."totalCents"), 0) FROM "TicketOrder" o
          WHERE o.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o."paidAt" >= ${from} AND o."paidAt" < ${to} AND o.source = 'app')::float8 AS "ticketsAppCents",
        (SELECT count(*) FROM "TicketOrderItem" it JOIN "TicketOrder" o ON o.id = it."orderId"
          WHERE o.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o."paidAt" >= ${from} AND o."paidAt" < ${to})::int AS "ticketItemsTotal",
        (SELECT count(*) FROM "TicketOrderItem" it JOIN "TicketOrder" o ON o.id = it."orderId"
          WHERE o.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o."paidAt" >= ${from} AND o."paidAt" < ${to} AND o.source = 'app')::int AS "ticketItemsApp",
        (SELECT count(*) FROM "TheokotOrder" o
          WHERE o.status <> 'CANCELLED' AND o."createdAt" >= ${from} AND o."createdAt" < ${to})::int AS "theokotTotal",
        (SELECT count(*) FROM "TheokotOrder" o
          WHERE o.status <> 'CANCELLED' AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
            AND EXISTS (SELECT 1 FROM "AppAction" a WHERE a.kind = 'theokot_order' AND a."refId" = o.id))::int AS "theokotApp",
        (SELECT coalesce(sum(o."totalCents"), 0) FROM "TheokotOrder" o
          WHERE o.status <> 'CANCELLED' AND o."createdAt" >= ${from} AND o."createdAt" < ${to})::float8 AS "theokotTotalCents",
        (SELECT coalesce(sum(o."totalCents"), 0) FROM "TheokotOrder" o
          WHERE o.status <> 'CANCELLED' AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
            AND EXISTS (SELECT 1 FROM "AppAction" a WHERE a.kind = 'theokot_order' AND a."refId" = o.id))::float8 AS "theokotAppCents",
        (SELECT count(*) FROM "ShiftParticipant" p
          WHERE p."registeredAt" >= ${from} AND p."registeredAt" < ${to})::int AS "shiftenTotal",
        (SELECT count(*) FROM "ShiftParticipant" p
          WHERE p."registeredAt" >= ${from} AND p."registeredAt" < ${to}
            AND EXISTS (SELECT 1 FROM "AppAction" a WHERE a.kind = 'shift_register' AND a."refId" = p."shiftId" || ':' || p."userId"))::int AS "shiftenApp",
        (SELECT count(*) FROM "PianoReservation" r
          WHERE r."createdAt" >= ${from} AND r."createdAt" < ${to})::int AS "pianoTotal",
        (SELECT count(*) FROM "AppAction" a
          WHERE a.kind = 'piano_reservation' AND a."createdAt" >= ${from} AND a."createdAt" < ${to})::int AS "pianoApp"
    `,
    // ---- Het aandeel van de app per week, voor tickets en broodjes
    prisma.$queryRaw<Array<{ key: string; tickets: number; ticketsApp: number; theokot: number; theokotApp: number }>>`
      WITH t AS (
        SELECT to_char(date_trunc(${unit}, o."paidAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS key,
               count(*)::int AS tickets, count(*) FILTER (WHERE o.source = 'app')::int AS "ticketsApp"
        FROM "TicketOrder" o
        WHERE o.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o."paidAt" >= ${from} AND o."paidAt" < ${to}
        GROUP BY 1
      ),
      b AS (
        SELECT to_char(date_trunc(${unit}, o."createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS key,
               count(*)::int AS theokot,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "AppAction" a WHERE a.kind = 'theokot_order' AND a."refId" = o.id))::int AS "theokotApp"
        FROM "TheokotOrder" o
        WHERE o.status <> 'CANCELLED' AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
        GROUP BY 1
      )
      SELECT coalesce(t.key, b.key) AS key,
             coalesce(t.tickets, 0) AS tickets, coalesce(t."ticketsApp", 0) AS "ticketsApp",
             coalesce(b.theokot, 0) AS theokot, coalesce(b."theokotApp", 0) AS "theokotApp"
      FROM t FULL OUTER JOIN b ON b.key = t.key
    `,
    // ---- Wat er verder in de app gebeurde
    prisma.$queryRaw<Array<{ kind: string; count: number; members: number }>>`
      SELECT kind, count(*)::int AS count, count(DISTINCT "userId")::int AS members
      FROM "AppAction"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1
    `,
  ]);

  const i = installs[0] ?? {};
  const a = activity[0] ?? {};
  const s = sessionTotals[0] ?? {};
  const f = frequency[0] ?? {};
  const r = retention[0] ?? {};
  const c = channels[0] ?? {};

  const installSeries = {
    ios: fill(keys, perDayInstalls.filter((row) => row.platform === "ios")),
    android: fill(keys, perDayInstalls.filter((row) => row.platform === "android")),
  };
  const activeMap = new Map(perDayActive.map((row) => [row.key, row]));
  const activeSeries = {
    installs: keys.map((key) => num(activeMap.get(key)?.installs)),
    sessions: keys.map((key) => num(activeMap.get(key)?.sessions)),
    members: keys.map((key) => num(activeMap.get(key)?.members)),
    minutes: keys.map((key) => Math.round(num(activeMap.get(key)?.minutes))),
  };
  // Het totaal aan installaties door de tijd: wat er voor de periode al was, plus wat erbij kwam.
  const before = num(i.total) - num(i.newInPeriod);
  let running = before;
  const cumulative = keys.map((_, index) => (running += installSeries.ios[index]! + installSeries.android[index]!));

  const channelMap = new Map(channelWeeks.map((row) => [row.key, row]));
  const appShareSeries = {
    tickets: keys.map((key) => {
      const row = channelMap.get(key);
      return row && num(row.tickets) > 0 ? Math.round((num(row.ticketsApp) / num(row.tickets)) * 1000) / 10 : null;
    }),
    theokot: keys.map((key) => {
      const row = channelMap.get(key);
      return row && num(row.theokot) > 0 ? Math.round((num(row.theokotApp) / num(row.theokot)) * 1000) / 10 : null;
    }),
  };

  const actionCount = (kind: string) => appActions.find((row) => row.kind === kind) ?? { kind, count: 0, members: 0 };
  const orderingMembers = await prisma.$queryRaw<Array<{ members: number }>>`
    SELECT count(DISTINCT u)::int AS members FROM (
      SELECT "userId" AS u FROM "AppAction"
      WHERE kind IN ('theokot_order', 'cudi_order', 'shift_register', 'piano_reservation')
        AND "createdAt" >= ${from} AND "createdAt" < ${to} AND "userId" IS NOT NULL
      UNION
      SELECT "buyerUserId" AS u FROM "TicketOrder"
      WHERE source = 'app' AND status IN ('PAID', 'PARTIALLY_REFUNDED')
        AND "paidAt" >= ${from} AND "paidAt" < ${to} AND "buyerUserId" IS NOT NULL
    ) x
  `;

  const channelStats: ChannelStats[] = [
    {
      key: "tickets",
      total: num(c.ticketsTotal),
      app: num(c.ticketsApp),
      totalCents: num(c.ticketsTotalCents),
      appCents: num(c.ticketsAppCents),
    },
    {
      key: "theokot",
      total: num(c.theokotTotal),
      app: num(c.theokotApp),
      totalCents: num(c.theokotTotalCents),
      appCents: num(c.theokotAppCents),
    },
    { key: "shiften", total: num(c.shiftenTotal), app: num(c.shiftenApp), totalCents: null, appCents: null },
    { key: "piano", total: num(c.pianoTotal), app: num(c.pianoApp), totalCents: null, appCents: null },
  ];

  const mau = num(a.mau);
  const membersActive = num(members[0]?.active);
  const hours = fill(
    Array.from({ length: 24 }, (_, h) => String(h)),
    perHour,
  );
  const weekdays = fill(["1", "2", "3", "4", "5", "6", "7"], perWeekday);

  return {
    measuringSince,
    from,
    to,
    unit,
    keys,
    installs: {
      total: num(i.total),
      ios: num(i.ios),
      android: num(i.android),
      active1: num(i.active1),
      active7: num(i.active7),
      active30: num(i.active30),
      dormant: num(i.dormant),
      signedIn: num(i.signedIn),
      members: num(i.members),
      pushOn: num(i.pushOn),
      pushAsked: num(i.pushAsked),
      expoGo: num(i.expoGo),
      english: num(i.english),
      newInPeriod: num(i.newInPeriod),
      newIos: num(i.newIos),
      newAndroid: num(i.newAndroid),
    },
    activity: {
      dau: num(a.dau),
      wau: num(a.wau),
      mau,
      avgDau30: numOrNull(a.avgDau30),
      /** Gemiddeld dagelijks actief tegenover maandelijks actief: hoe "plakkerig" de app is. */
      stickiness: mau > 0 && a.avgDau30 !== null ? num(a.avgDau30) / mau : null,
      members30: num(a.members30),
      membersActive30: membersActive,
      memberShare: share(num(a.members30), membersActive),
    },
    sessions: {
      count: num(s.sessions),
      installs: num(s.installs),
      members: num(s.members),
      avgSeconds: numOrNull(s.avgSeconds),
      medianSeconds: numOrNull(s.medianSeconds),
      totalSeconds: num(s.totalSeconds),
      avgScreens: numOrNull(s.avgScreens),
      screenViews: num(s.screenViews),
      perInstall: share(num(s.sessions), num(s.installs)),
    },
    frequency: {
      once: num(f.once),
      few: num(f.few),
      regular: num(f.regular),
      heavy: num(f.heavy),
      multiDay: num(f.multiDay),
      sevenDays: num(f.sevenDays),
      total: num(f.total),
      avgSessions: numOrNull(f.avgSessions),
      avgDays: numOrNull(f.avgDays),
    },
    retention: {
      total: num(r.total),
      twoSessions: num(r.twoSessions),
      day1: { eligible: num(r.eligible1), back: num(r.back1) },
      day7: { eligible: num(r.eligible7), back: num(r.back7) },
      day30: { eligible: num(r.eligible30), back: num(r.back30) },
    },
    cohorts: cohortTable(cohortSizes, cohortActive, COHORT_WEEKS, mondayOf(today)) satisfies CohortRow[],
    series: { installs: installSeries, cumulative, active: activeSeries, appShare: appShareSeries },
    hours,
    weekdays,
    screens,
    tabs,
    versions,
    systems,
    models,
    channels: channelStats,
    actions: {
      cudi: actionCount("cudi_order"),
      pushOpen: actionCount("push_open"),
      theokot: actionCount("theokot_order"),
      shiften: actionCount("shift_register"),
      piano: actionCount("piano_reservation"),
      orderingMembers: num(orderingMembers[0]?.members),
    },
    pushDevices: await prisma.appPushDevice.count(),
  };
}
