import { notFound } from "next/navigation";
import { ClipboardList, MousePointerClick, Tags, Users } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Het shiftenoverzicht van het praesidium (`shift.praesidium`) in tabbladen
 * zoals Tickets: de shiftenlijsten van de grote evenementen (en een lijst
 * openen), de praesidiumshiften, de shiften op /shift aanduiden, en de
 * bijnamen. Het werkingsjaar (`?jaar=`) reist mee naar elk tabblad.
 */
export default async function AdminShiftOverviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("shift.praesidium");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/shiftenoverzicht`;

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Shiftenlijsten" : "Shift lists", icon: <ClipboardList {...ICON} />, segments: [null, "lijst"] },
    {
      href: `${base}/praesidiumshiften`,
      label: nl ? "Praesidiumshiften" : "Praesidium shifts",
      icon: <Users {...ICON} />,
      segments: ["praesidiumshiften"],
    },
    {
      href: `${base}/siteshiften`,
      label: nl ? "Shiften op /shift" : "Shifts on /shift",
      icon: <MousePointerClick {...ICON} />,
      segments: ["siteshiften"],
    },
    { href: `${base}/bijnamen`, label: nl ? "Bijnamen" : "Nicknames", icon: <Tags {...ICON} />, segments: ["bijnamen"] },
  ];

  return (
    <ModuleAdminShell
      title={nl ? "Shiftenoverzicht praesidium" : "Praesidium shift overview"}
      navLabel={nl ? "Shiftenoverzicht" : "Shift overview"}
      tabs={tabs}
      preserveParams={["jaar"]}
    >
      {children}
    </ModuleAdminShell>
  );
}
