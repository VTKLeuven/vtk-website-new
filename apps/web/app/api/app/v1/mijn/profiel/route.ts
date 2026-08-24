import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";

import { academicYearRange } from "@/lib/shift";
import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appLocaleFrom, type AppProfile } from "@/lib/app-api/contract";
import { absoluteMediaUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Het profielscherm: wie je bent, en je shiften.
 *
 * De shiften zitten hier bij en niet in een eigen endpoint, om dezelfde reden als
 * bij `bootstrap`: het is één scherm, en drie aanvragen voor één scherm voel je
 * op een mobiele verbinding wel degelijk. Bestellingen en tickets hebben wel hun
 * eigen endpoint, want die schermen staan op zichzelf.
 *
 * `unpaidShiftsThisYear` is dezelfde telling als `/api/shift/history` doet: een
 * shift telt als onbetaald zolang `rewardPaid` onder de beloning zit en de shift
 * in het huidige academiejaar eindigde.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    const now = new Date();

    const [user, participations] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true, rNumber: true, avatarKey: true, studyProgrammes: true },
      }),
      prisma.shiftParticipant.findMany({
        where: { userId: session.user.id },
        select: {
          rewardPaid: true,
          shift: {
            select: {
              id: true,
              name: true,
              location: true,
              startTime: true,
              endTime: true,
              post: true,
              reward: true,
            },
          },
        },
      }),
    ]);

    const { start, end } = academicYearRange();
    let unpaid = 0;
    for (const { rewardPaid, shift } of participations) {
      if (rewardPaid < shift.reward && shift.endTime >= start && shift.endTime < end) unpaid += 1;
    }

    const payload: AppProfile = {
      name: user?.name ?? session.user.name,
      email: user?.email ?? session.user.email,
      rNumber: user?.rNumber ?? null,
      avatarUrl: absoluteMediaUrl(request, user?.avatarKey ?? session.user.avatarKey),
      studyProgrammes: user?.studyProgrammes ?? [],
      groups: session.groups.map((group) => ({
        id: group.id,
        code: group.code,
        slug: group.slug,
        name: pick(group.nameNl, group.nameEn, locale),
        type: group.type,
        role: group.role,
      })),
      upcomingShifts: participations
        .filter(({ shift }) => shift.endTime >= now)
        .map(({ shift }) => ({
          id: shift.id,
          name: shift.name,
          location: shift.location,
          start: shift.startTime.toISOString(),
          end: shift.endTime.toISOString(),
          post: shift.post,
          reward: shift.reward,
        }))
        .sort((a, b) => a.start.localeCompare(b.start)),
      unpaidShiftsThisYear: unpaid,
      totalShifts: participations.length,
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
