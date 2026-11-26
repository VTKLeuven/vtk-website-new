import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { BarChart3, Link2, UsersRound } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Admin › Website › App in tabbladen: de statistieken, wie de app heeft en de
 * links naar de winkels.
 *
 * "Wie heeft de app" toont namen en e-mailadressen en volgt daarom ook
 * `users.view`, naast `home.edit` van de module zelf; de pagina controleert
 * beide nog eens.
 */
export default async function AdminAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/app`;
  const session = await getCurrentSession();
  const can = (perm: Parameters<typeof hasPermission>[1]) => Boolean(session && hasPermission(session, perm));

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Statistieken" : "Statistics", icon: <BarChart3 {...ICON} />, segments: [null] },
  ];
  if (can("users.view")) {
    tabs.push({
      href: `${base}/gebruikers`,
      label: nl ? "Wie heeft de app" : "Who has the app",
      icon: <UsersRound {...ICON} />,
      segments: ["gebruikers"],
    });
  }
  tabs.push({ href: `${base}/links`, label: nl ? "Links naar de winkels" : "Store links", icon: <Link2 {...ICON} />, segments: ["links"] });

  return (
    <ModuleAdminShell title="App" navLabel="App" tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
