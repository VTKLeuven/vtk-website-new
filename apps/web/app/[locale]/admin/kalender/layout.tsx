import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { CalendarDays, MessageCircle, Tags } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De kalender in tabbladen zoals Tickets: de evenementen (en een evenement
 * openen of aanmaken), en voor wie alle evenementen beheert de categorieën en
 * de Discord-webhooks. Die twee waren een link en een knop naast "Nieuw
 * evenement".
 */
export default async function AdminCalendarLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/kalender`;
  const session = await getCurrentSession();
  const canAll = Boolean(session && (session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll")));

  const tabs: ModuleTab[] = [
    // Een evenement openen (`/kalender/<id>`) of aanmaken hoort bij de lijst.
    { href: base, label: nl ? "Evenementen" : "Events", icon: <CalendarDays {...ICON} />, segments: [null, "new"], fallback: true },
  ];
  if (canAll) {
    tabs.push(
      { href: `${base}/categorieen`, label: nl ? "Categorieën" : "Categories", icon: <Tags {...ICON} />, segments: ["categorieen"] },
      { href: `${base}/discord`, label: "Discord webhooks", icon: <MessageCircle {...ICON} />, segments: ["discord"] },
    );
  }

  return (
    <ModuleAdminShell title={nl ? "Kalender" : "Calendar"} navLabel={nl ? "Kalender" : "Calendar"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
