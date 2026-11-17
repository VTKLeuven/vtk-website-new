import { notFound } from "next/navigation";
import { Award, Settings2, UserPlus, Users } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Leden (`leden.manage`) in tabbladen zoals Tickets: de leden van een
 * academiejaar, de ereleden (die waren `?lijst=ereleden`), iemand lid maken,
 * en de instellingen van het lidgeld.
 */
export default async function AdminLedenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("leden.manage");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/leden`;

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Leden" : "Members", icon: <Users {...ICON} />, segments: [null] },
    { href: `${base}/ereleden`, label: nl ? "Ereleden" : "Honorary members", icon: <Award {...ICON} />, segments: ["ereleden"] },
    { href: `${base}/lid-maken`, label: nl ? "Lid maken" : "Grant membership", icon: <UserPlus {...ICON} />, segments: ["lid-maken"] },
    { href: `${base}/instellingen`, label: nl ? "Instellingen" : "Settings", icon: <Settings2 {...ICON} />, segments: ["instellingen"] },
  ];

  return (
    <ModuleAdminShell title={nl ? "Leden" : "Members"} navLabel={nl ? "Leden" : "Members"} tabs={tabs} preserveParams={["jaar"]}>
      {children}
    </ModuleAdminShell>
  );
}
