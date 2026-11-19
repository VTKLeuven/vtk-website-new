import { notFound } from "next/navigation";
import { Activity, Clock, Footprints } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De 24 urenloop (`urenloop.manage`) in tabbladen zoals Tickets: de
 * tijdstippen, de live tussenstand van de piste, en de rondes per loper.
 */
export default async function AdminUrenloopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("urenloop.manage");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/24urenloop`;

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Tijdstippen" : "Schedule", icon: <Clock {...ICON} />, segments: [null] },
    { href: `${base}/live`, label: nl ? "Live tussenstand" : "Live standings", icon: <Activity {...ICON} />, segments: ["live"] },
    { href: `${base}/rondes`, label: nl ? "Rondes per loper" : "Laps per runner", icon: <Footprints {...ICON} />, segments: ["rondes"] },
  ];

  return (
    <ModuleAdminShell title={nl ? "24 urenloop" : "24-hour run"} navLabel={nl ? "24 urenloop" : "24-hour run"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
