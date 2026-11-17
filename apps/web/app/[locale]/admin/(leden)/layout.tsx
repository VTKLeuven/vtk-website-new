import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { Award, GraduationCap, Settings2, Users } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Leden in tabbladen zoals Tickets: de leden van een academiejaar (met iemand
 * lid maken bovenaan, zoals bij de ereleden), de ereleden, de alumni en de
 * instellingen van het lidgeld. Een route-groep: de adressen blijven
 * /admin/leden en /admin/alumni.
 *
 * Alumni was een eigen item in de zijbalk; het is ook een lijst van mensen die
 * bij de kring horen, dus het staat hier. Het volgt zijn eigen recht
 * (`alumni.manage`), los van `leden.manage`, en elke pagina controleert dat
 * zelf nog eens.
 */
export default async function AdminMembersLayout({
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
  const session = await getCurrentSession();
  const can = (perm: Parameters<typeof hasPermission>[1]) => Boolean(session && hasPermission(session, perm));

  const tabs: ModuleTab[] = [];
  if (can("leden.manage")) {
    tabs.push(
      { href: `${base}/leden`, label: nl ? "Leden" : "Members", icon: <Users {...ICON} />, segments: ["leden"] },
      { href: `${base}/leden/ereleden`, label: nl ? "Ereleden" : "Honorary members", icon: <Award {...ICON} />, segments: ["leden/ereleden"] },
    );
  }
  if (can("alumni.manage")) {
    // `jaar` is hier een lichting, geen academiejaar: dat reist niet mee.
    tabs.push({ href: `${base}/alumni`, label: "Alumni", icon: <GraduationCap {...ICON} />, segments: ["alumni"], isolated: true });
  }
  if (can("leden.manage")) {
    tabs.push({ href: `${base}/leden/instellingen`, label: nl ? "Instellingen" : "Settings", icon: <Settings2 {...ICON} />, segments: ["leden/instellingen"] });
  }

  return (
    <ModuleAdminShell title={nl ? "Leden" : "Members"} navLabel={nl ? "Leden" : "Members"} tabs={tabs} preserveParams={["jaar"]}>
      {children}
    </ModuleAdminShell>
  );
}
