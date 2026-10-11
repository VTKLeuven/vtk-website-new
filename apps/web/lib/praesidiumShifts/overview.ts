import "server-only";

import { loadPostNames } from "@/lib/shift/postNames";
import {
  listPhones,
  loadRoster,
  loadSiteParticipations,
  loadYearLists,
  toStatsList,
  type RosterMember,
} from "@/lib/praesidiumShifts/server";
import {
  averages,
  detectedOpenSlots,
  entryCounts,
  entryUser,
  entryWeight,
  memberTotals,
  nameIndex,
  summarizeList,
  type Averages,
  type SlotStat,
  type StatsName,
} from "@/lib/praesidiumShifts/stats";

/*
 * Wat de schermen van het shiftenoverzicht tonen, als gewone objecten die naar
 * een clientcomponent mogen: datums als `yyyy-mm-dd` of ISO-tekst, geen Maps.
 */

export type OverviewListRow = {
  id: string;
  kind: "EVENT" | "WEEKLY";
  status: "DRAFT" | "ACTIVE";
  name: string;
  eventDate: string | null;
  expectedPerMember: number | null;
  counted: number;
  praesidium: number;
  others: number;
  unresolvedNames: number;
  unresolvedShifts: number;
  openSlots: number | null;
  /** Gemiddelde per praesidiumlid op deze lijst. */
  average: number;
  /** Hoeveel praesidiumleden de richtlijn haalden. */
  metTarget: number | null;
};

export type OverviewEntry = {
  listId: string;
  sheet: string;
  slot: string | null;
  role: string | null;
  date: string | null;
  weight: number;
  label: string;
};

export type OverviewSiteShift = {
  shiftId: string;
  name: string;
  startTime: string;
  post: string | null;
  necessary: boolean;
};

export type OverviewMember = {
  userId: string;
  name: string;
  posts: string[];
  phone: string | null;
  /** Het nummer komt uit het overzicht van een shiftenlijst, niet uit het profiel. */
  phoneFromList: boolean;
  lists: number;
  perList: Record<string, number>;
  siteNecessary: number;
  siteVoluntary: number;
  site: number;
  total: number;
  weeklyPast: number;
  weeklyUpcoming: number;
  entries: OverviewEntry[];
  siteShifts: OverviewSiteShift[];
  weekly: OverviewEntry[];
};

export type Overview = {
  year: number;
  roster: RosterMember[];
  members: OverviewMember[];
  averages: Averages;
  eventLists: OverviewListRow[];
  weeklyLists: OverviewListRow[];
};

function isoDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export async function buildOverview(year: number, locale: "nl" | "en", now = new Date()): Promise<Overview> {
  const [roster, { lists, entries, names }] = await Promise.all([loadRoster(year, locale), loadYearLists(year)]);
  const memberIds = roster.map((m) => m.userId);
  const [participations, phones, postNames] = await Promise.all([
    loadSiteParticipations(year, memberIds),
    listPhones(memberIds.filter((id) => !roster.find((m) => m.userId === id)?.phone)),
    loadPostNames(locale),
  ]);

  const statsLists = lists.map(toStatsList);
  const active = lists.filter((l) => l.status === "ACTIVE");
  const activeEvent = statsLists.filter((l) => l.kind === "EVENT" && active.some((a) => a.id === l.id));
  const activeWeekly = statsLists.filter((l) => l.kind === "WEEKLY" && active.some((a) => a.id === l.id));
  const statsNames: StatsName[] = names;

  const totals = memberTotals({
    memberIds,
    eventLists: activeEvent,
    weeklyLists: activeWeekly,
    entries,
    names: statsNames,
    siteShifts: participations.map((p) => ({
      shiftId: p.shiftId,
      userId: p.userId,
      necessary: Boolean(p.praesidiumNecessity),
    })),
    now,
  });

  // Per lid de vakjes en shiften, voor het detailvenster.
  const index = nameIndex(statsNames);
  const byId = new Map(statsLists.map((l) => [l.id, l]));
  const labels = new Map(names.map((n) => [`${n.listId}\u0000${n.nameKey}`, n.label]));
  const entriesByUser = new Map<string, OverviewEntry[]>();
  const weeklyByUser = new Map<string, OverviewEntry[]>();
  for (const entry of entries) {
    const list = byId.get(entry.listId);
    if (!list || !active.some((a) => a.id === list.id) || !entryCounts(list, entry)) continue;
    const userId = entryUser(index, entry);
    if (!userId) continue;
    const row: OverviewEntry = {
      listId: entry.listId,
      sheet: entry.sheet,
      slot: entry.slot,
      role: entry.role,
      date: isoDay(entry.date),
      weight: entryWeight(list, entry),
      label: labels.get(`${entry.listId}\u0000${entry.nameKey}`) ?? entry.rawName,
    };
    const target = list.kind === "EVENT" ? entriesByUser : weeklyByUser;
    const bucket = target.get(userId) ?? [];
    bucket.push(row);
    target.set(userId, bucket);
  }
  const siteByUser = new Map<string, OverviewSiteShift[]>();
  for (const p of participations) {
    const bucket = siteByUser.get(p.userId) ?? [];
    bucket.push({
      shiftId: p.shiftId,
      name: p.shift.name,
      startTime: p.shift.startTime.toISOString(),
      post: p.shift.post ? postNames[p.shift.post] ?? p.shift.post : null,
      necessary: Boolean(p.praesidiumNecessity),
    });
    siteByUser.set(p.userId, bucket);
  }

  const byDate = (a: OverviewEntry, b: OverviewEntry) =>
    (a.date ?? "").localeCompare(b.date ?? "") || (a.slot ?? "").localeCompare(b.slot ?? "");
  const members: OverviewMember[] = roster.map((member) => {
    const total = totals.find((t) => t.userId === member.userId)!;
    const listPhone = member.phone ? null : phones.get(member.userId) ?? null;
    return {
      userId: member.userId,
      name: member.name,
      posts: member.posts,
      phone: member.phone ?? listPhone,
      phoneFromList: !member.phone && Boolean(listPhone),
      lists: total.lists,
      perList: Object.fromEntries(total.perList),
      siteNecessary: total.siteNecessary,
      siteVoluntary: total.siteVoluntary,
      site: total.site,
      total: total.total,
      weeklyPast: total.weeklyPast,
      weeklyUpcoming: total.weeklyUpcoming,
      entries: (entriesByUser.get(member.userId) ?? []).sort(byDate),
      siteShifts: siteByUser.get(member.userId) ?? [],
      weekly: (weeklyByUser.get(member.userId) ?? []).sort(byDate),
    };
  });

  const listRow = (list: (typeof lists)[number]): OverviewListRow => {
    const stats = byId.get(list.id)!;
    const summary = summarizeList(stats, entries, statsNames);
    const perMember = roster.map((m) => summary.perUser.get(m.userId) ?? 0);
    const average = perMember.length ? perMember.reduce((s, v) => s + v, 0) / perMember.length : 0;
    return {
      id: list.id,
      kind: list.kind,
      status: list.status,
      name: list.name,
      eventDate: isoDay(list.eventDate),
      expectedPerMember: list.expectedPerMember,
      counted: summary.counted,
      praesidium: summary.praesidium,
      others: summary.others,
      unresolvedNames: summary.unresolvedNames,
      unresolvedShifts: summary.unresolvedShifts,
      openSlots: list.openSlots ?? detectedOpenSlots(stats, (list.slots ?? []) as SlotStat[]),
      average,
      metTarget:
        list.expectedPerMember !== null
          ? perMember.filter((v) => v >= (list.expectedPerMember ?? 0)).length
          : null,
    };
  };

  return {
    year,
    roster,
    members,
    averages: averages(totals),
    eventLists: lists.filter((l) => l.kind === "EVENT").map(listRow),
    weeklyLists: lists.filter((l) => l.kind === "WEEKLY").map(listRow),
  };
}
