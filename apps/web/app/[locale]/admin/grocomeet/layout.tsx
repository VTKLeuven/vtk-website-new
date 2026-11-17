import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { ModuleAdminShell } from "@/components/admin/ModuleAdminShell";
import { meetingAdminTabs } from "@/components/meetings/MeetingAdminPages";

import "@/app/design/vtk-basic.css";

/**
 * Beheer van de grocomeets (`grocomeet.manage`: admin en de verantwoordelijke
 * van Theokot), in tabbladen zoals Tickets: de vergaderingen (een lijst, en per
 * vergadering wat er uitgedeeld moet worden), de planning (kalender en losse
 * vergaderingen), wie nog wat verschuldigd is, het overzicht voor de
 * herbegroting, en de drankjes. Het bureau van Onderwijs draait op dezelfde
 * code onder /admin/bureau; zie components/meetings/MeetingAdminPages.tsx.
 */
export default async function AdminGrocomeetLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("grocomeet.manage");
  const nl = locale === "nl";

  return (
    <ModuleAdminShell
      title={`Grocomeet · ${formatWorkingYear(currentWorkingYear())}`}
      navLabel="Grocomeet"
      tabs={meetingAdminTabs("GROCOMEET", nl)}
    >
      {children}
    </ModuleAdminShell>
  );
}
