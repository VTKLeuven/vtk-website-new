import { notFound } from "next/navigation";
import { CalendarRange, Network, UsersRound, Vote } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { postenAccess } from "@/lib/postenAccess";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Posten, werkgroepen, jaarwerkingen en de kiesploeg in tabbladen zoals
 * Tickets: vier lijsten van wie in welke ploeg zit, die elk een eigen item in
 * de zijbalk waren. Een route-groep: de adressen blijven /admin/groepen,
 * /admin/werkgroepen, /admin/jaarwerkingen en /admin/kiesploeg. Welk tabblad
 * iemand ziet, staat in `lib/postenAccess.ts`.
 */
export default async function AdminPostsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin`;
  const access = await postenAccess(await getCurrentSession());

  const tabs: ModuleTab[] = [];
  if (access.posts) {
    tabs.push({ href: `${base}/groepen`, label: nl ? "Posten" : "Posts", icon: <Network {...ICON} />, segments: ["groepen"] });
  }
  if (access.werkgroepen) {
    tabs.push({ href: `${base}/werkgroepen`, label: nl ? "Werkgroepen" : "Working groups", icon: <UsersRound {...ICON} />, segments: ["werkgroepen"] });
  }
  if (access.jaarwerkingen) {
    tabs.push({ href: `${base}/jaarwerkingen`, label: nl ? "Jaarwerkingen" : "Yearly events", icon: <CalendarRange {...ICON} />, segments: ["jaarwerkingen"] });
  }
  if (access.kiesploeg) {
    tabs.push({ href: `${base}/kiesploeg`, label: "Kiesploeg", icon: <Vote {...ICON} />, segments: ["kiesploeg"] });
  }

  const title = nl ? "Posten & werkgroepen" : "Posts & working groups";
  return (
    <ModuleAdminShell title={title} navLabel={title} tabs={tabs} preserveParams={["jaar"]}>
      {children}
    </ModuleAdminShell>
  );
}
