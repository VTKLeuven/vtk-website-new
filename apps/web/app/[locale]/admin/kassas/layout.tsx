import { notFound } from "next/navigation";
import { BookOpen, ClipboardCheck, FilePlus2, Inbox, LayoutList, Settings2, Store } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { accessFor, permanentTabLabel } from "@/lib/kassas/server";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Kassa's in tabbladen zoals Tickets: het overzicht, de controle en het
 * kasboek voor Beheer, de vaste kassa's (voor Beheer en de posten die er een hebben), je
 * eigen aanvragen, een kassa aanvragen, en de instellingen. Elk tabblad volgt
 * een recht; de pagina's zeggen zelf wanneer je geen toegang hebt.
 */
export default async function AdminCashRegistersLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/kassas`;
  const session = await getCurrentSession();
  const access = session ? accessFor(session) : null;
  const permanentLabel = access ? permanentTabLabel(access, locale) : null;

  const tabs: ModuleTab[] = [];
  if (access?.canManage) {
    // Een kassa openen (`/kassas/<id>`) hoort bij het overzicht.
    tabs.push({ href: base, label: nl ? "Overzicht" : "Overview", icon: <LayoutList {...ICON} />, segments: [null], fallback: true });
  }
  if (access?.canCheckIncome) {
    tabs.push({ href: `${base}/controle`, label: nl ? "Controle" : "Check", icon: <ClipboardCheck {...ICON} />, segments: ["controle"] });
  }
  if (access?.canManage) {
    // Het cash van Beheer zelf: stortingen, afhalingen en aankopen.
    tabs.push({ href: `${base}/kasboek`, label: nl ? "Kasboek" : "Cash book", icon: <BookOpen {...ICON} />, segments: ["kasboek"] });
  }
  if (permanentLabel) {
    tabs.push({ href: `${base}/vast`, label: permanentLabel, icon: <Store {...ICON} />, segments: ["vast"] });
  }
  if (access?.canRequest) {
    tabs.push(
      {
        href: `${base}/mijn`,
        label: nl ? "Mijn aanvragen" : "My requests",
        icon: <Inbox {...ICON} />,
        segments: ["mijn"],
        // Zonder overzicht opent een aanvrager zijn kassa vanuit zijn aanvragen.
        fallback: !access.canManage,
      },
      {
        href: `${base}/aanvragen`,
        label: nl ? "Kassa aanvragen" : "Request a register",
        icon: <FilePlus2 {...ICON} />,
        segments: ["aanvragen"],
      },
    );
  }
  if (access?.canManage) {
    tabs.push({ href: `${base}/instellingen`, label: nl ? "Instellingen" : "Settings", icon: <Settings2 {...ICON} />, segments: ["instellingen"] });
  }

  return (
    <ModuleAdminShell title={nl ? "Kassa's" : "Cash registers"} navLabel={nl ? "Kassa's" : "Cash registers"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
