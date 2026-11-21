import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { CalendarCheck, LayoutDashboard, UsersRound } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { canViewAttendance } from "@/lib/bo/attendance/server";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";
import { ScanButton } from "../../bestuursorgaan/BoControls";
import { boErrorMessages } from "../../bestuursorgaan/messages";
import { attendanceBase } from "./parts";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Aanwezigheden op het Bestuursorgaan, uit de verslagen in de BO-map (zie
 * docs/bestuursorgaan.md, "Aanwezigheden"). Enkel IT en Groep 5. Drie
 * tabbladen: het overzicht, per persoon en per vergadering, elk met een
 * detailpagina. "Nu lezen" leest de hele BO-map, ook de budgetten; dat mag
 * enkel Groep 5, de rest wacht op de scan van het halfuur.
 */
export default async function AttendanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  if (!(await canViewAttendance())) notFound();
  const nl = locale === "nl";
  const base = attendanceBase(nl);
  const session = await getCurrentSession();
  const canScan = Boolean(session && hasPermission(session, "bestuursorgaan.manage"));

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Overzicht" : "Overview", icon: <LayoutDashboard {...ICON} />, segments: [null] },
    { href: `${base}/personen`, label: nl ? "Personen" : "People", icon: <UsersRound {...ICON} />, segments: ["personen"] },
    {
      href: `${base}/vergaderingen`,
      label: nl ? "Vergaderingen" : "Meetings",
      icon: <CalendarCheck {...ICON} />,
      segments: ["vergaderingen"],
    },
  ];

  return (
    <ModuleAdminShell
      title={nl ? "Aanwezigheden" : "Attendance"}
      lead={
        nl
          ? "Wie er op het Bestuursorgaan was, gelezen uit de kleuren in de verslagen in de BO-map."
          : "Who attended the board meeting, read from the colours in the minutes in the board folder."
      }
      actions={canScan ? <ScanButton locale={locale} errorMessages={boErrorMessages(locale)} /> : undefined}
      navLabel={nl ? "Aanwezigheden" : "Attendance"}
      tabs={tabs}
      preserveParams={["jaar"]}
    >
      {children}
    </ModuleAdminShell>
  );
}
