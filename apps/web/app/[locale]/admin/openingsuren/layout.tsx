import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";
import { openingHoursLabel, visibleOpeningHoursServices } from "./OpeningHoursAdminView";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De openingsuren op de homepage, een tabblad per dienst. Elke post ziet
 * enkel haar eigen dienst; een superadmin ziet ze alle drie.
 */
export default async function OpeningHoursAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const session = await requirePermission("openingHours.manageOwn");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/openingsuren`;
  const tabs: ModuleTab[] = visibleOpeningHoursServices(session).map((service) => ({
    href: `${base}/${service}`,
    label: openingHoursLabel(service),
    icon: <Clock {...ICON} />,
    segments: [service],
  }));

  return (
    <ModuleAdminShell title={nl ? "Openingsuren" : "Opening hours"} navLabel={nl ? "Openingsuren" : "Opening hours"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
