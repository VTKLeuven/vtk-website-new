import { notFound } from "next/navigation";
import { History, KeyRound } from "lucide-react";
import { getDictionary } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De deur in tabbladen zoals Tickets: het gebruik met de tijdelijke toegang,
 * en het toegangslog. De filters (dagen, enkel geweigerd) reizen mee.
 */
export default async function AdminDoorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/deur`;
  await requireSession(`${nl ? "" : "/en"}/inloggen?next=${base}`);

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Toegang" : "Access", icon: <KeyRound {...ICON} />, segments: [null] },
    { href: `${base}/log`, label: nl ? "Toegangslog" : "Access log", icon: <History {...ICON} />, segments: ["log"] },
  ];

  return (
    <ModuleAdminShell title={getDictionary(locale).admin.door} navLabel={getDictionary(locale).admin.door} tabs={tabs} preserveParams={["days", "result"]}>
      {children}
    </ModuleAdminShell>
  );
}
