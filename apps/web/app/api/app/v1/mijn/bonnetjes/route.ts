import { prisma } from "@vtk/db";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appLocaleFrom, type AppShiftTier, type AppShiftYear, type AppVouchers } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";
import { createPassToken, PASS_TTL_SECONDS } from "@/lib/app-api/tokens";
import { voucherOverview } from "@/lib/app-api/vouchers";
import { shiftDeductions } from "@/lib/shift/deductions";
import { buildShiftHistory } from "@/lib/shift/history";
import { SHIFT_TIERS, type ShiftTier } from "@/lib/shift/tiers";
import { praesidiumYears } from "@/lib/shift/voucherEligibility";
import { PRESALE_SHIFT_THRESHOLD } from "@/lib/ticketing/presale";
import { currentWorkingYear } from "@/lib/workingYear";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Jouw bonnetjes, en de pas waarmee je ze uitgeeft.
 *
 * De pas zit in dezelfde aanvraag als het saldo omdat ze samen op één scherm
 * staan: je haalt je telefoon boven aan de toog en er moet meteen een code op
 * staan. Twee rondjes voor één scherm voel je daar wel degelijk.
 *
 * Hij leeft twee minuten. De app haalt hem opnieuw op zodra hij verlopen is; dat
 * is met opzet kort, want een QR die uren geldig blijft, staat na één keer tonen
 * in de groepschat. Wat je verliest is de mogelijkheid om je pas offline te
 * tonen, en dat is aanvaardbaar: aan de toog staat altijd iemand met netwerk.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const now = new Date();

    const userId = session.user.id;
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));

    const [overview, participations, deductions, praesidium] = await Promise.all([
      voucherOverview(userId, now),
      prisma.shiftParticipant.findMany({
        where: { userId, shift: { endTime: { lt: now } } },
        select: {
          shift: {
            select: { id: true, name: true, startTime: true, endTime: true, location: true, post: true, reward: true },
          },
        },
      }),
      shiftDeductions({ userIds: [userId] }),
      praesidiumYears([userId]),
    ]);

    // Dezelfde telling als /shift/history; het huidige jaar staat er altijd in.
    const currentYear = currentWorkingYear();
    const year = buildShiftHistory({
      userId,
      shifts: participations.map((participation) => participation.shift),
      deductions,
      praesidium,
      currentYear,
    }).find((entry) => entry.year === currentYear)!;
    const tierOf = (tier: ShiftTier): AppShiftTier => ({ min: tier.min, name: locale === "en" ? tier.en : tier.nl });
    const shiftYear: AppShiftYear = {
      label: `${currentYear}-${currentYear + 1}`,
      count: year.count,
      vouchers: year.vouchers,
      praesidium: year.praesidium,
      tier: year.tier ? tierOf(year.tier) : null,
      next: year.next ? tierOf(year.next) : null,
      tiers: [...SHIFT_TIERS].reverse().map(tierOf),
      presaleAt: PRESALE_SHIFT_THRESHOLD,
      inPraesidiumNow: session.groups.some((group) => group.type === "PRAESIDIUM"),
    };

    const expiresAt = new Date(now.getTime() + PASS_TTL_SECONDS * 1000);

    const payload: AppVouchers = {
      balance: overview.balance,
      earnedThisYear: overview.earnedThisYear,
      earned: overview.earned,
      used: overview.used,
      shiftYear,
      history: overview.history,
      pass: createPassToken(session.user.id, expiresAt),
      passExpiresAt: expiresAt.toISOString(),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
