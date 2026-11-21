import "server-only";

import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { getCurrentSession } from "@/lib/session";
import { loadRoster } from "@/lib/praesidiumShifts/server";
import { meetingLabel } from "../dossiers";
import type { MinutesEntry } from "./parse";
import { buildAttendance, type AttendanceOverview } from "./stats";

/**
 * Wie de aanwezigheden mag zien: de rol admin (IT en Groep 5) via
 * `bestuursorgaan.attendance`, en Groep 5 ook via de rol Bestuursorgaan. Een
 * superadmin altijd (`hasPermission`).
 */
export async function canViewAttendance(): Promise<boolean> {
  const session = await getCurrentSession();
  if (!session) return false;
  return hasPermission(session, "bestuursorgaan.attendance") || hasPermission(session, "bestuursorgaan.manage");
}

/** Een BO-map en wat er van haar verslag te zeggen valt, ook als er geen aanwezigheden uit kwamen. */
export type MeetingFile = {
  id: string;
  label: string;
  folderName: string;
  folderUrl: string;
  date: Date | null;
  kind: "MEETING" | "BUDGET_MEETING" | "WRITTEN";
  /** De BO moet nog komen: dan is er nog geen verslag te verwachten. */
  upcoming: boolean;
  minutes: { name: string; url: string; error: string | null; missing: boolean; people: number } | null;
};

export type AttendanceData = AttendanceOverview & {
  year: number;
  /** Elke BO-map van het jaar, ook zonder (leesbaar) verslag: voor "Na te kijken". */
  files: MeetingFile[];
};

export async function loadAttendance(year: number, nl: boolean): Promise<AttendanceData> {
  const [rows, roster] = await Promise.all([
    prisma.boMeeting.findMany({
      where: { workingYear: year, missingSince: null },
      orderBy: [{ date: "asc" }, { number: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        number: true,
        date: true,
        webUrl: true,
        minutes: {
          select: { name: true, webUrl: true, title: true, attendance: true, error: true, missingSince: true },
        },
      },
    }),
    loadRoster(year, nl ? "nl" : "en"),
  ]);

  const now = Date.now();
  const files: MeetingFile[] = rows.map((row) => {
    const entries = (row.minutes?.attendance as MinutesEntry[] | null) ?? [];
    return {
      id: row.id,
      label: meetingLabel(row, nl),
      folderName: row.name,
      folderUrl: row.webUrl,
      date: row.date,
      kind: row.kind,
      upcoming: row.date !== null && row.date.getTime() > now,
      minutes: row.minutes
        ? {
            name: row.minutes.name,
            url: row.minutes.webUrl,
            error: row.minutes.error,
            missing: row.minutes.missingSince !== null,
            people: entries.length,
          }
        : null,
    };
  });

  const overview = buildAttendance(
    rows
      .filter((row) => Array.isArray(row.minutes?.attendance) && (row.minutes!.attendance as unknown[]).length > 0)
      .map((row) => ({
        id: row.id,
        label: meetingLabel(row, nl),
        date: row.date,
        title: row.minutes!.title,
        minutesUrl: row.minutes!.webUrl,
        entries: row.minutes!.attendance as MinutesEntry[],
      })),
    roster,
  );
  return { ...overview, year, files };
}

/** Werkingsjaren met minstens één gelezen verslag, nieuwste eerst. */
export async function attendanceYears(): Promise<number[]> {
  const rows = await prisma.boMeeting.findMany({
    where: { minutes: { isNot: null } },
    distinct: ["workingYear"],
    select: { workingYear: true },
  });
  return rows.map((r) => r.workingYear).sort((a, b) => b - a);
}
