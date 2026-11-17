import { notFound } from "next/navigation";
import { Ban, BarChart3, CalendarRange, ClipboardList, HandPlatter, ListChecks, Settings2 } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De broodjes van Theokot in tabbladen zoals Tickets. Een route-groep, zodat
 * Verhuur en Shiften (die onder /admin/theokot hangen maar een eigen menu-item
 * en een eigen recht hebben) deze kop niet krijgen. `theokot.manage` ziet
 * alles, `theokot.pickup` enkel wat de balie nodig heeft.
 */
export default async function AdminTheokotSandwichesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/theokot`;
  const session = await getCurrentSession();
  const has = (code: string) => Boolean(session && (session.user.isSuperAdmin || session.permissions.includes(code)));
  const manage = has("theokot.manage");
  const pickup = has("theokot.pickup");

  const tabs: ModuleTab[] = [
    ...(manage
      ? [{ href: base, label: nl ? "Sessies" : "Sessions", icon: <CalendarRange {...ICON} />, segments: [null] }]
      : []),
    ...(pickup
      ? [
          { href: `${base}/afhalen`, label: nl ? "Afhaalbalie" : "Pickup counter", icon: <HandPlatter {...ICON} />, segments: ["afhalen"] },
          { href: `${base}/overzicht`, label: nl ? "Overzicht per dag" : "Daily overview", icon: <ClipboardList {...ICON} />, segments: ["overzicht"] },
          {
            href: `${base}/turflijst`,
            label: nl ? "Lijst bestelde broodjes" : "Ordered sandwiches list",
            icon: <ListChecks {...ICON} />,
            segments: ["turflijst"],
          },
        ]
      : []),
    ...(manage
      ? [
          { href: `${base}/statistieken`, label: nl ? "Statistieken" : "Statistics", icon: <BarChart3 {...ICON} />, segments: ["statistieken"] },
          { href: `${base}/bans`, label: "Bans & no-shows", icon: <Ban {...ICON} />, segments: ["bans"] },
          { href: `${base}/instellingen`, label: nl ? "Instellingen" : "Settings", icon: <Settings2 {...ICON} />, segments: ["instellingen"] },
        ]
      : []),
  ];

  return (
    <ModuleAdminShell title={nl ? "Theokot · Broodjes" : "Theokot · Sandwiches"} navLabel="Theokot" tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
