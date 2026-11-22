import { notFound } from "next/navigation";
import { ArrowRightLeft, ClipboardList, LayoutList, ListOrdered, Settings2, Upload } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { countUnassigned } from "@/lib/inkomsten/server";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Online inkomsten (`income.manage`) in tabbladen zoals Tickets. Het getal bij
 * "Na te kijken" telt de transacties zonder boekhoudcode. Zie docs/inkomsten.md.
 */
export default async function AdminIncomeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("income.manage");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/inkomsten`;
  const openCount = await countUnassigned();

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Overzicht" : "Overview", icon: <LayoutList {...ICON} />, segments: [null] },
    { href: `${base}/opladen`, label: nl ? "Uploaden" : "Upload", icon: <Upload {...ICON} />, segments: ["opladen"] },
    {
      href: `${base}/na-te-kijken`,
      label: `${nl ? "Na te kijken" : "To review"}${openCount > 0 ? ` (${openCount})` : ""}`,
      icon: <ClipboardList {...ICON} />,
      segments: ["na-te-kijken"],
    },
    { href: `${base}/transacties`, label: nl ? "Transacties" : "Transactions", icon: <ListOrdered {...ICON} />, segments: ["transacties"] },
    {
      href: `${base}/overschrijvingen`,
      label: nl ? "Overschrijvingen" : "Transfers",
      icon: <ArrowRightLeft {...ICON} />,
      segments: ["overschrijvingen"],
    },
    { href: `${base}/instellingen`, label: nl ? "Instellingen" : "Settings", icon: <Settings2 {...ICON} />, segments: ["instellingen"] },
  ];

  return (
    <ModuleAdminShell title={nl ? "Online inkomsten" : "Online income"} navLabel={nl ? "Online inkomsten" : "Online income"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
