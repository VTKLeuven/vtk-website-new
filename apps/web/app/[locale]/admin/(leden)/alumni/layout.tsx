import { notFound } from "next/navigation";
import { GraduationCap, UserPlus } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { ModuleTabNav, type ModuleTab } from "@/components/admin/ModuleTabs";

const ICON = { "aria-hidden": true, size: 14, strokeWidth: 1.8 } as const;

/**
 * Het tabblad Alumni onder Leden (`alumni.manage`), met een tweede rij: de
 * alumni met de mailinglijst per lichting, en alumni toevoegen (één of een
 * geplakte lijst).
 */
export default async function AdminAlumniLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("alumni.manage");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/alumni`;

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Overzicht" : "Overview", icon: <GraduationCap {...ICON} />, segments: [null] },
    { href: `${base}/toevoegen`, label: nl ? "Toevoegen" : "Add", icon: <UserPlus {...ICON} />, segments: ["toevoegen"] },
  ];

  return (
    <div className="space-y-5">
      <ModuleTabNav label="Alumni" tabs={tabs} variant="sub" />
      {children}
    </div>
  );
}
