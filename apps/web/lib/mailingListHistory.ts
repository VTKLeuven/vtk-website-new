import "server-only";

import { prisma } from "@vtk/db";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import { CAREER_CATEGORY } from "@/lib/careerOptIn";
import { MAILING_LISTS, listWhere, type MailingListId } from "@/lib/mailinglists";

/**
 * De dagelijkse telling van de mailinglijsten (`MailingListDailyCount`).
 *
 * Een lijst is een momentopname: wie Career uitzet of zijn studie niet
 * bevestigt, verdwijnt eruit zonder spoor, dus het verloop is achteraf niet uit
 * `User` te halen. De background-worker roept {@link recordMailingListCounts}
 * elke vijf minuten aan; die overschrijft de rij van vandaag, zodat de laatste
 * ronde van een dag de stand van die dag wordt. Een dag waarop de worker stil
 * lag, heeft geen rij, en de grafiek toont daar een gat in plaats van een
 * verzonnen punt.
 *
 * Alle lijsten gaan mee, niet enkel Career: het zijn een paar tellingen per
 * ronde, en een verloop dat je pas begint te meten wanneer iemand erom vraagt,
 * heeft geen verleden.
 */

export const HISTORY_KEYS = {
  /** De lijst zoals Brevo en de export ze kennen (`listWhere`). */
  list: (id: MailingListId) => `list:${id}`,
  /** Alle actieve accounts met Career aan; de bovenste regel van de uitsplitsing. */
  careerOptIns: "career:optIns",
} as const;

/** Een Brusselse dag (`yyyy-mm-dd`) als Postgres-`date`. */
function asDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export async function recordMailingListCounts(now: Date = new Date()): Promise<{ day: string; keys: number }> {
  const day = ymdKey(brusselsYMD(now));
  const [listCounts, careerOptIns] = await Promise.all([
    Promise.all(MAILING_LISTS.map((id) => prisma.user.count({ where: listWhere(id) }))),
    prisma.user.count({
      where: { active: true, deletedAt: null, mailCategories: { has: CAREER_CATEGORY } },
    }),
  ]);

  const rows: { key: string; value: number }[] = [
    ...MAILING_LISTS.map((id, i) => ({ key: HISTORY_KEYS.list(id), value: listCounts[i] })),
    { key: HISTORY_KEYS.careerOptIns, value: careerOptIns },
  ];

  await prisma.$transaction(
    rows.map(({ key, value }) =>
      prisma.mailingListDailyCount.upsert({
        where: { day_key: { day: asDate(day), key } },
        create: { day: asDate(day), key, value },
        update: { value },
      }),
    ),
  );
  return { day, keys: rows.length };
}

/** De telling per sleutel, als dag (`yyyy-mm-dd`) naar waarde. */
export async function readHistory(keys: string[]): Promise<Map<string, Map<string, number>>> {
  const rows = await prisma.mailingListDailyCount.findMany({
    where: { key: { in: keys } },
    select: { day: true, key: true, value: true },
    orderBy: { day: "asc" },
  });
  const byKey = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const series = byKey.get(row.key) ?? new Map<string, number>();
    // Een `date` komt terug als middernacht UTC; de eerste tien tekens zijn de dag.
    series.set(row.day.toISOString().slice(0, 10), row.value);
    byKey.set(row.key, series);
  }
  return byKey;
}
