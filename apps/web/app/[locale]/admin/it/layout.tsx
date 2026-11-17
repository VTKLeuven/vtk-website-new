import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { Eye, HardDrive, Inbox, MessageSquareText, MonitorSmartphone, ScrollText, Settings2, Smartphone } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Alles onder /admin/it in tabbladen zoals Tickets. Elk tabblad volgt zijn
 * eigen recht, zoals in de zijbalk: de meeste zijn voor superadmins, het
 * adminlogboek voor `audit.view`, de 24UL-app voor `urenloopApp.manage` en de
 * feedback voor `feedback.manage`. Elke pagina controleert dat zelf nog eens.
 *
 * Een autorisatievoorbeeld zet `isSuperAdmin` op false: dan vallen de
 * superadmin-tabbladen weg, net zoals de pagina's zelf dan een 404 geven.
 */
export default async function AdminItLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/it`;
  const session = await getCurrentSession();
  const superAdmin = Boolean(session?.user.isSuperAdmin);
  const can = (perm: Parameters<typeof hasPermission>[1]) => Boolean(session && hasPermission(session, perm));

  const tabs: ModuleTab[] = [];
  if (superAdmin) {
    tabs.push(
      { href: base, label: nl ? "Configuratie" : "Configuration", icon: <Settings2 {...ICON} />, segments: [null] },
      { href: `${base}/storage`, label: "Storage", icon: <HardDrive {...ICON} />, segments: ["storage"] },
    );
  }
  if (can("audit.view")) {
    tabs.push({ href: `${base}/logboek`, label: nl ? "Adminlogboek" : "Admin log", icon: <ScrollText {...ICON} />, segments: ["logboek"] });
  }
  if (superAdmin) {
    tabs.push(
      { href: `${base}/email-logboek`, label: nl ? "E-maillogboek" : "Email log", icon: <Inbox {...ICON} />, segments: ["email-logboek"] },
      { href: `${base}/preview`, label: nl ? "Autorisatievoorbeeld" : "Authorization preview", icon: <Eye {...ICON} />, segments: ["preview"] },
      { href: `${base}/flows`, label: nl ? "Mails & schermen" : "Emails & screens", icon: <MonitorSmartphone {...ICON} />, segments: ["flows"] },
    );
  }
  if (can("urenloopApp.manage")) {
    tabs.push({ href: `${base}/24ul-app`, label: "24UL App Download", icon: <Smartphone {...ICON} />, segments: ["24ul-app"] });
  }
  if (can("feedback.manage")) {
    tabs.push({ href: `${base}/feedback`, label: "Feedback", icon: <MessageSquareText {...ICON} />, segments: ["feedback"] });
  }

  return (
    <ModuleAdminShell title="IT" navLabel="IT" tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
