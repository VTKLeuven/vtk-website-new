import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { getCurrentSession } from "@/lib/session";
import { adminAttendeeList, attendeesToCsv } from "@/lib/calendar/interest";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    select: { id: true, titleNl: true, groupId: true },
  });
  if (!event) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const canAll = session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  const canManage = canAll || session.groups.some((g) => g.id === event.groupId);
  if (!canManage) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const rows = await adminAttendeeList(event.id);
  const url = new URL(request.url);
  const locale = url.searchParams.get("lang") === "en" ? "en" : "nl";
  const csv = attendeesToCsv(rows, locale);

  const slug = event.titleNl
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const filename = `geinteresseerden-${slug || event.id}.csv`;

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
