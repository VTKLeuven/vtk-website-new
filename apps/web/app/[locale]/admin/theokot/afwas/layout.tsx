import { notFound } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { canManageAfwas, ownAfwasGroupIds } from "@/lib/theokotAfwas-server";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

import "@/app/design/vtk-theokot-afwas.css";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De afwas in Theokot, de opvolger van de Excel "bekers afwassen": een post,
 * werkgroep of jaarwerking noteert wat er na een evenement af te wassen valt en
 * boekt een namiddag. Elk lid van een groep ziet het; Theokot en Logistiek
 * (`canManageAfwas`) zien en regelen alles. Eén tabblad, dus geen tabbalk. Zie
 * docs/design-decisions.md, "Theokot: afwasbeurten".
 */
export default async function TheokotAfwasLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const session = await requireSession();
  if (!canManageAfwas(session) && ownAfwasGroupIds(session).length === 0) notFound();
  const nl = locale === "nl";
  const tabs: ModuleTab[] = [
    {
      href: `${nl ? "" : "/en"}/admin/theokot/afwas`,
      label: nl ? "Planning" : "Schedule",
      icon: <CalendarCheck {...ICON} />,
      segments: [null],
    },
  ];
  return (
    <ModuleAdminShell
      title={nl ? "Theokot · Afwas" : "Theokot · Washing up"}
      lead={
        nl
          ? "De lijst bekers afwassen: wie na een evenement vuile bekers, glazen of kommetjes naar de loods bracht, noteert hier wat en boekt een namiddag in Theokot om ze af te wassen."
          : "The washing-up list: teams that brought dirty cups, glasses or bowls back to the warehouse after an event note them here and book an afternoon in Theokot to wash them."
      }
      navLabel="Theokot"
      tabs={tabs}
    >
      {children}
    </ModuleAdminShell>
  );
}
