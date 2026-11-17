import { notFound } from "next/navigation";
import { House, Newspaper, Settings2 } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Nieuws (`news.manage`) in tabbladen zoals Tickets: wat nu op de homepage
 * staat, de zelf geschreven berichten, en de instellingen van de band. Een
 * bericht schrijven of bewerken klapt op elk tabblad open.
 */
export default async function AdminNewsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("news.manage");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/nieuws`;

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Op de homepage" : "On the homepage", icon: <House {...ICON} />, segments: [null] },
    { href: `${base}/berichten`, label: nl ? "Berichten" : "Posts", icon: <Newspaper {...ICON} />, segments: ["berichten"] },
    { href: `${base}/instellingen`, label: nl ? "Instellingen" : "Settings", icon: <Settings2 {...ICON} />, segments: ["instellingen"] },
  ];

  return (
    <ModuleAdminShell title={nl ? "Nieuws" : "News"} navLabel={nl ? "Nieuws" : "News"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
