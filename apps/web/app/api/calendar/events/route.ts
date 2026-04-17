import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const groups = url.searchParams.getAll("group").filter(Boolean);

  const where: Prisma.CalendarEventWhereInput = {
    visibility: "PUBLIC",
  };

  if (start && end) {
    where.start = { lte: new Date(end) };
    where.end = { gte: new Date(start) };
  }

  if (groups.length > 0) {
    where.group = { code: { in: groups as never } };
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    include: { group: true },
    orderBy: { start: "asc" },
  });

  const payload = events.map((e) => ({
    id: e.id,
    title: e.titleNl,
    titleEn: e.titleEn,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    allDay: e.allDay,
    url: e.url,
    location: e.location,
    extendedProps: {
      groupCode: e.group.code,
      groupSlug: e.group.slug,
      groupNameNl: e.group.nameNl,
      groupNameEn: e.group.nameEn,
      descriptionNl: e.descriptionNl,
      descriptionEn: e.descriptionEn,
    },
  }));

  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
