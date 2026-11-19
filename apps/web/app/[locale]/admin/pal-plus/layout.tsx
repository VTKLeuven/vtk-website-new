import { notFound } from "next/navigation";
import { CalendarClock, CheckCheck, GraduationCap, Inbox, ListChecks } from "lucide-react";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { PAL_PLUS_ACTIVE_STATUSES } from "@/lib/palPlus";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

import "@/app/design/vtk-palplus.css";
// Het maandraster van de agenda is dat van de Theokot-verhuur
// (`components/theokot/RentalMonthGrid`), met zijn stijl.
import "@/app/design/vtk-theokot-verhuur.css";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Beheer van PAL+ door VTK Onderwijs, in tabbladen zoals Tickets: het
 * werkbakje met wat nog beslist moet worden, de sessies, de tutors, wat al
 * afgehandeld is, en de lijsten die Onderwijs bijhoudt (vakken, snelle tags).
 * Zie docs/design-decisions.md ("PAL+").
 */
export default async function AdminPalPlusLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("pal.manage");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/pal-plus`;

  const [queueCount, roomPendingCount] = await Promise.all([
    prisma.palPlusRequest.count({ where: { status: { in: [...PAL_PLUS_ACTIVE_STATUSES] } } }),
    prisma.palPlusSession.count({
      where: { cancelledAt: null, startsAt: { gt: new Date() }, roomId: null, roomText: null },
    }),
  ]);

  const tabs: ModuleTab[] = [
    {
      href: base,
      label: `${nl ? "Aanvragen" : "Requests"}${queueCount > 0 ? ` (${queueCount})` : ""}`,
      icon: <Inbox {...ICON} />,
      segments: [null],
    },
    {
      href: `${base}/sessies`,
      label: `${nl ? "Sessies" : "Sessions"}${
        roomPendingCount > 0 ? (nl ? ` (${roomPendingCount} zonder lokaal)` : ` (${roomPendingCount} without room)`) : ""
      }`,
      icon: <CalendarClock {...ICON} />,
      segments: ["sessies"],
    },
    { href: `${base}/tutors`, label: "Tutors", icon: <GraduationCap {...ICON} />, segments: ["tutors"] },
    { href: `${base}/verwerkt`, label: nl ? "Verwerkt" : "Processed", icon: <CheckCheck {...ICON} />, segments: ["verwerkt"] },
    { href: `${base}/vakken`, label: nl ? "Lijsten" : "Lists", icon: <ListChecks {...ICON} />, segments: ["vakken"] },
  ];

  return (
    <ModuleAdminShell title="PAL+" navLabel="PAL+" tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
