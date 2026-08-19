import { prisma } from "@vtk/db";
import { icsResponse } from "@/lib/calendar/http";
import { buildLesbezoekIcs } from "@/lib/lesbezoekenIcs";
import { authErrorResponse, requireAnyPermission } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De goedgekeurde lesbezoeken als downloadbaar `.ics`-bestand.
 *
 * Een download en geen abonneerbare feed: de URL draagt geen geheim, dus wie ze
 * eenmaal heeft zou er blijvend namen van professoren uit kunnen lezen. Wie de
 * lesbezoeken doet, importeert het bestand één keer in zijn agenda; dat was in de
 * oude app ook de bedoeling.
 */
export async function GET() {
  try {
    await requireAnyPermission(["lesbezoeken.view", "lesbezoeken.manage"]);
  } catch (err) {
    return authErrorResponse(err);
  }

  const visits = await prisma.lesbezoek.findMany({
    where: { status: "APPROVED" },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      course: true,
      audience: true,
      subject: true,
      teacherName: true,
      teacherEmail: true,
      status: true,
      updatedAt: true,
      organisation: { select: { name: true } },
    },
  });

  return icsResponse(buildLesbezoekIcs(visits), "vtk-lesbezoeken.ics", {
    private: true,
    download: true,
  });
}
