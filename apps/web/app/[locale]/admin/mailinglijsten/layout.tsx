import { notFound } from "next/navigation";
import { BriefcaseBusiness, ListChecks } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De mailinglijsten (`mailinglists.export`) in tabbladen zoals Tickets: de
 * lijsten met de koppeling, en de Career-lijst apart, omdat bedrijven ervoor
 * betalen en de vraag op drie schermen staat.
 */
export default async function AdminMailingListsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("mailinglists.export");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/mailinglijsten`;

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Lijsten" : "Lists", icon: <ListChecks {...ICON} />, segments: [null] },
    { href: `${base}/career`, label: "Career", icon: <BriefcaseBusiness {...ICON} />, segments: ["career"] },
  ];

  return (
    <ModuleAdminShell title={nl ? "Mailinglijsten" : "Mailing lists"} navLabel={nl ? "Mailinglijsten" : "Mailing lists"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
