import { notFound } from "next/navigation";
import { Building2, CalendarDays, CheckCheck, Download, Inbox, Mail, NotebookPen } from "lucide-react";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { isOpenStatus } from "@/lib/lesbezoeken";
import { currentWorkingYear, workingYearStart } from "@/lib/workingYear";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";
import { lesbezoekAccess } from "./access";

import "@/app/design/vtk-lesbezoeken.css";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Beheer van de lesbezoeken, in tabbladen zoals Tickets. De volgorde volgt de
 * weg die een aanvraag aflegt (aanvragen, verwerkt, kalender), daarna de vaste
 * gegevens eromheen: organisaties, bijzonderheden per professor en de mails.
 * Die drie stonden samen onder "Organisaties & mails"; zie
 * docs/design-decisions.md ("Lesbezoeken").
 *
 * Dit vervangt een Google Form, een Sheet met acht tabbladen en een mailmerge.
 */
export default async function AdminLesbezoekenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await lesbezoekAccess();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/lesbezoeken`;

  // Wat er nog moet gebeuren, dit werkingsjaar: het getal naast Aanvragen.
  const year = currentWorkingYear();
  const statuses = await prisma.lesbezoek.findMany({
    where: { startsAt: { gte: workingYearStart(year), lt: workingYearStart(year + 1) } },
    select: { status: true },
  });
  const openCount = statuses.filter((row) => isOpenStatus(row.status)).length;

  const tabs: ModuleTab[] = [
    {
      href: base,
      label: `${nl ? "Aanvragen" : "Requests"}${openCount > 0 ? ` (${openCount})` : ""}`,
      icon: <Inbox {...ICON} />,
      segments: [null],
    },
    { href: `${base}/verwerkt`, label: nl ? "Verwerkt" : "Processed", icon: <CheckCheck {...ICON} />, segments: ["verwerkt"] },
    { href: `${base}/kalender`, label: nl ? "Kalender" : "Calendar", icon: <CalendarDays {...ICON} />, segments: ["kalender"] },
    {
      href: `${base}/organisaties`,
      label: nl ? "Organisaties" : "Organisations",
      icon: <Building2 {...ICON} />,
      segments: ["organisaties"],
    },
    {
      href: `${base}/bijzonderheden`,
      label: nl ? "Bijzonderheden" : "Peculiarities",
      icon: <NotebookPen {...ICON} />,
      segments: ["bijzonderheden"],
    },
    { href: `${base}/mails`, label: nl ? "Mails" : "Mail", icon: <Mail {...ICON} />, segments: ["mails"] },
  ];

  const icsLabel = nl ? "Agenda downloaden (.ics)" : "Download calendar (.ics)";
  return (
    <ModuleAdminShell
      title={nl ? "Lesbezoeken" : "Classroom visits"}
      navLabel={nl ? "Lesbezoeken" : "Classroom visits"}
      tabs={tabs}
      actions={
        <a className="ticket-admin-icon-button" href={`${nl ? "" : "/en"}/api/admin/lesbezoeken/ics`} aria-label={icsLabel} title={icsLabel}>
          <Download aria-hidden="true" size={17} />
        </a>
      }
    >
      {children}
    </ModuleAdminShell>
  );
}
