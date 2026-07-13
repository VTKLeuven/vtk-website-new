import { prisma } from "@vtk/db";
import { GroupCode } from "@prisma/client";
import { format } from "date-fns";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { academicYearRange, academicYearRangeFor, currentAcademicYear } from "@/lib/shift";
import { ShiftAdmin } from "./ShiftAdmin";

/** `yyyy-MM-dd` → lokale middernacht, of null bij ongeldige invoer. */
function parseLocalDay(value: string | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export default async function AdminShifts({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; year?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requireSession();

  const has = (perm: string) => session.user.isSuperAdmin || session.permissions.includes(perm);
  const canEdit = has("shift.edit");
  const canReward = has("shift.reward");
  const canRanking = has("shift.ranking");

  if (!canEdit && !canReward && !canRanking) {
    return <p className="text-sm text-zinc-500">{locale === "nl" ? "Geen toegang." : "No access."}</p>;
  }

  const now = new Date();
  const { from: fromParam, to: toParam, year: yearParam } = await searchParams;

  // Geselecteerd academiejaar voor ranglijst + vergoedingen (standaard huidige).
  const parsedYear = Number(yearParam);
  const selectedYear = Number.isInteger(parsedYear) ? parsedYear : currentAcademicYear(now);
  const ay = academicYearRangeFor(selectedYear);
  // "Voltooid" = eindtijd in het verleden; voor het huidige jaar dus tot nu.
  const completedBefore = new Date(Math.min(ay.end.getTime(), now.getTime()));

  // Datumbereik voor de beheertabel (via URL), standaard vandaag → einde huidig academiejaar.
  const { end: currentAyEnd } = academicYearRange(now);
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const defaultTo = new Date(currentAyEnd.getFullYear(), currentAyEnd.getMonth(), currentAyEnd.getDate() - 1);
  const rangeStart = parseLocalDay(fromParam) ?? defaultFrom;
  const rangeToDay = parseLocalDay(toParam) ?? defaultTo;
  // `to` is inclusief: tel er een dag bij op voor de exclusieve bovengrens.
  const rangeEnd = new Date(rangeToDay.getFullYear(), rangeToDay.getMonth(), rangeToDay.getDate() + 1);

  const [shiftsRaw, rankingRaw, rewardsRaw, shiftBounds] = await Promise.all([
    canEdit
      ? prisma.shift.findMany({
          where: { startTime: { gte: rangeStart, lt: rangeEnd } },
          orderBy: { startTime: "asc" },
          include: {
            participants: {
              select: { userId: true, payedOut: true, user: { select: { name: true, email: true } } },
            },
          },
        })
      : Promise.resolve([]),
    canRanking
      ? prisma.shiftParticipant.findMany({
          where: { shift: { endTime: { gte: ay.start, lt: completedBefore } } },
          select: { userId: true, user: { select: { name: true } }, shift: { select: { post: true } } },
        })
      : Promise.resolve([]),
    canReward
      ? prisma.shiftParticipant.findMany({
          where: { shift: { endTime: { gte: ay.start, lt: completedBefore } } },
          select: {
            userId: true,
            shiftId: true,
            payedOut: true,
            user: { select: { name: true, email: true } },
            shift: { select: { reward: true } },
          },
        })
      : Promise.resolve([]),
    canRanking || canReward
      ? prisma.shift.aggregate({ _min: { startTime: true }, _max: { endTime: true } })
      : Promise.resolve(null),
  ]);

  // Beschikbare academiejaren voor de jaarkiezer: van het vroegste tot het laatste
  // shift-jaar, plus het huidige en het geselecteerde jaar.
  const yearsSet = new Set<number>([currentAcademicYear(now), selectedYear]);
  const minYear = shiftBounds?._min.startTime ? currentAcademicYear(shiftBounds._min.startTime) : selectedYear;
  const maxYear = shiftBounds?._max.endTime ? currentAcademicYear(shiftBounds._max.endTime) : selectedYear;
  for (let y = minYear; y <= maxYear; y += 1) yearsSet.add(y);
  const availableYears = [...yearsSet].sort((a, b) => b - a);

  const shifts = shiftsRaw.map((s) => ({
    id: s.id,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    location: s.location,
    description: s.description,
    maxParticipants: s.maxParticipants,
    reward: s.reward,
    post: s.post,
    participants: s.participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      payedOut: p.payedOut,
    })),
  }));

  // Ranglijst: aantal voltooide shiften per (user, post).
  const rankingMap = new Map<string, { userId: string; name: string; post: string; count: number }>();
  for (const { userId, user, shift } of rankingRaw) {
    const post = shift.post ?? "GEEN";
    const key = `${userId}::${post}`;
    const entry = rankingMap.get(key);
    if (entry) entry.count += 1;
    else rankingMap.set(key, { userId, name: user.name, post, count: 1 });
  }
  const ranking = [...rankingMap.values()];

  // Vergoedingen per user voor het gekozen academiejaar: betaald vs onbetaald.
  const rewardMap = new Map<
    string,
    {
      userId: string;
      name: string;
      email: string;
      claimedShifts: number;
      claimedReward: number;
      unclaimedShifts: number;
      unclaimedReward: number;
      unclaimedShiftIds: string[];
    }
  >();
  for (const { userId, shiftId, payedOut, user, shift } of rewardsRaw) {
    const entry =
      rewardMap.get(userId) ??
      {
        userId,
        name: user.name,
        email: user.email,
        claimedShifts: 0,
        claimedReward: 0,
        unclaimedShifts: 0,
        unclaimedReward: 0,
        unclaimedShiftIds: [],
      };
    if (payedOut) {
      entry.claimedShifts += 1;
      entry.claimedReward += shift.reward;
    } else {
      entry.unclaimedShifts += 1;
      entry.unclaimedReward += shift.reward;
      entry.unclaimedShiftIds.push(shiftId);
    }
    rewardMap.set(userId, entry);
  }
  const rewards = [...rewardMap.values()];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{locale === "nl" ? "Shiften" : "Shifts"}</h1>
      <ShiftAdmin
        locale={locale}
        capabilities={{ canEdit, canReward, canRanking }}
        shifts={shifts}
        ranking={ranking}
        rewards={rewards}
        postOptions={Object.values(GroupCode)}
        from={format(rangeStart, "yyyy-MM-dd")}
        to={format(rangeToDay, "yyyy-MM-dd")}
        year={selectedYear}
        years={availableYears}
      />
    </div>
  );
}
