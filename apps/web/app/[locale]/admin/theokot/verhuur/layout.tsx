import { notFound } from "next/navigation";
import { CalendarDays, CheckCheck, ExternalLink, FileText, Inbox, Mail, Settings2 } from "lucide-react";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { siteBaseUrl } from "@/lib/calendar/feeds";
import { getRentalFeedToken } from "@/lib/theokotVerhuur-server";
import { isOpenRental } from "@/lib/theokotVerhuur";
import { currentWorkingYear, workingYearStart } from "@/lib/workingYear";
import { RentalCalendarSubscribe } from "@/components/theokot/RentalCalendarSubscribe";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

import "@/app/design/vtk-theokot-verhuur.css";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Beheer van de Theokot-verhuur in tabbladen zoals Tickets. De volgorde volgt
 * de weg die een aanvraag aflegt (aanvragen, verwerkt, kalender), daarna de
 * vaste gegevens: instellingen, de mails, en de contracten met de richtlijnen.
 * Die drie stonden samen onder Instellingen. Zie docs/design-decisions.md
 * ("Theokot-verhuur").
 */
export default async function AdminTheokotRentalsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requireAnyPermission(["theokot.rentals.view", "theokot.rentals.manage"]);
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/theokot/verhuur`;
  const feedToken = await getRentalFeedToken();
  const feedBaseUrl = `${siteBaseUrl()}/api/theokot/verhuur/feed/${feedToken}.ics`;
  // Wat dit werkingsjaar nog werk vraagt: het getal naast Aanvragen.
  const year = currentWorkingYear();
  const statuses = await prisma.theokotRental.findMany({
    where: { startsAt: { gte: workingYearStart(year), lt: workingYearStart(year + 1) } },
    select: { status: true },
  });
  const openCount = statuses.filter((row) => isOpenRental(row.status)).length;

  const tabs: ModuleTab[] = [
    { href: base, label: `${nl ? "Aanvragen" : "Requests"}${openCount > 0 ? ` (${openCount})` : ""}`, icon: <Inbox {...ICON} />, segments: [null] },
    { href: `${base}/verwerkt`, label: nl ? "Verwerkt" : "Processed", icon: <CheckCheck {...ICON} />, segments: ["verwerkt"] },
    { href: `${base}/kalender`, label: nl ? "Kalender" : "Calendar", icon: <CalendarDays {...ICON} />, segments: ["kalender"] },
    { href: `${base}/instellingen`, label: nl ? "Instellingen" : "Settings", icon: <Settings2 {...ICON} />, segments: ["instellingen"] },
    { href: `${base}/mails`, label: nl ? "Mails" : "Mail", icon: <Mail {...ICON} />, segments: ["mails"] },
    { href: `${base}/documenten`, label: nl ? "Documenten" : "Documents", icon: <FileText {...ICON} />, segments: ["documenten"] },
  ];

  const publicLabel = nl ? "Het publieke formulier bekijken" : "View the public form";
  return (
    <ModuleAdminShell
      title={nl ? "Theokot · Verhuur" : "Theokot · Rentals"}
      navLabel={nl ? "Theokot-verhuur" : "Theokot rentals"}
      tabs={tabs}
      preserveParams={["jaar"]}
      actions={
        <>
          <RentalCalendarSubscribe feedBaseUrl={feedBaseUrl} locale={locale} />
          <a
            className="ticket-admin-icon-button"
            href={`${nl ? "" : "/en"}/theokot/verhuur`}
            target="_blank"
            rel="noreferrer"
            aria-label={publicLabel}
            title={publicLabel}
          >
            <ExternalLink aria-hidden="true" size={17} />
          </a>
        </>
      }
    >
      {children}
    </ModuleAdminShell>
  );
}
