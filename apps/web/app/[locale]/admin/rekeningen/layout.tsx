import { notFound } from "next/navigation";
import { FilePlus2, LayoutList, Receipt, Settings2 } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getExpenseAccess } from "@/lib/rekeningen/server";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Rekeningen in tabbladen zoals Tickets: het overzicht (wie beheert), je eigen
 * rekeningen, indienen, en de instellingen. Elk tabblad volgt een recht; de
 * pagina's zeggen zelf wanneer je geen toegang hebt. Zie
 * docs/design-decisions.md, "Beheermodules in tabbladen".
 */
export default async function AdminExpensesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/rekeningen`;
  const access = await getExpenseAccess();

  const tabs: ModuleTab[] = [];
  if (access?.canSeeOverview) {
    tabs.push({ href: base, label: nl ? "Overzicht" : "Overview", icon: <LayoutList {...ICON} />, segments: [null] });
  }
  if (access?.canSubmit) {
    tabs.push(
      { href: `${base}/mijn`, label: nl ? "Mijn rekeningen" : "My expenses", icon: <Receipt {...ICON} />, segments: ["mijn"] },
      { href: `${base}/indienen`, label: nl ? "Indienen" : "Submit", icon: <FilePlus2 {...ICON} />, segments: ["indienen"] },
    );
  }
  if (access?.canManageAll) {
    tabs.push({
      href: `${base}/instellingen`,
      label: nl ? "Instellingen" : "Settings",
      icon: <Settings2 {...ICON} />,
      segments: ["instellingen"],
    });
  }

  return (
    <ModuleAdminShell title={nl ? "Rekeningen" : "Expenses"} navLabel={nl ? "Rekeningen" : "Expenses"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
