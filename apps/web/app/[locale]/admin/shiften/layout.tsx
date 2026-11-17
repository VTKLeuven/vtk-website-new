import { notFound } from "next/navigation";
import { CalendarCog, CopyPlus, LayoutTemplate, ListOrdered, PlusCircle, Ticket } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { canEditShifts } from "@/lib/shift/authorization";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Shiften in tabbladen zoals Tickets: beheer, ranglijst, bonnetjes en extra
 * shiften (die stonden als tabs in de pagina zelf), en de twee schermen rond
 * de sjablonen: een reeks neerzetten, en de sjablonen bewerken. Elk tabblad
 * volgt een recht.
 */
export default async function AdminShiftsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/shiften`;
  const session = await getCurrentSession();
  const has = (perm: string) => Boolean(session && (session.user.isSuperAdmin || session.permissions.includes(perm)));
  const canEdit = Boolean(session && canEditShifts(session));

  const tabs: ModuleTab[] = [];
  if (canEdit) tabs.push({ href: base, label: nl ? "Beheer" : "Manage", icon: <CalendarCog {...ICON} />, segments: [null] });
  if (has("shift.ranking")) {
    tabs.push({ href: `${base}/ranglijst`, label: nl ? "Ranglijst" : "Rankings", icon: <ListOrdered {...ICON} />, segments: ["ranglijst"] });
  }
  if (has("shift.reward")) {
    tabs.push({ href: `${base}/bonnetjes`, label: nl ? "Bonnetjes" : "Vouchers", icon: <Ticket {...ICON} />, segments: ["bonnetjes"] });
  }
  if (has("shift.manual")) {
    tabs.push({ href: `${base}/extra`, label: nl ? "Extra shiften" : "Extra shifts", icon: <PlusCircle {...ICON} />, segments: ["extra"] });
  }
  if (has("shift.edit") || has("shift.editAll")) {
    tabs.push({
      href: `${base}/sjablonen`,
      label: nl ? "Meerdere shiften" : "Multiple shifts",
      icon: <CopyPlus {...ICON} />,
      segments: ["sjablonen"],
    });
  }
  if (has("shift.templates")) {
    tabs.push({
      href: `${base}/sjablonen/beheer`,
      label: nl ? "Sjablonen beheren" : "Manage templates",
      icon: <LayoutTemplate {...ICON} />,
      segments: ["sjablonen/beheer"],
    });
  }

  return (
    <ModuleAdminShell title={nl ? "Shiften" : "Shifts"} navLabel={nl ? "Shiften" : "Shifts"} tabs={tabs}>
      {children}
    </ModuleAdminShell>
  );
}
