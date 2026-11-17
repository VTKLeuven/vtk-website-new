import { notFound } from "next/navigation";
import { Mail, MonitorSmartphone } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { ModuleTabNav, type ModuleTab } from "@/components/admin/ModuleTabs";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * IT › Mails & schermen in twee: de schermen en de mails, als tweede rij
 * onder de tabbladen van IT. Zie CLAUDE.md, "Wat je niet kan zien, zet je in
 * /admin/it/flows". De pagina's controleren zelf of je superadmin bent.
 */
export default async function AdminFlowsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/it/flows`;
  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "Schermen" : "Screens", icon: <MonitorSmartphone {...ICON} />, segments: [null] },
    { href: `${base}/mails`, label: nl ? "Mails" : "Emails", icon: <Mail {...ICON} />, segments: ["mails"] },
  ];
  return (
    <div className="space-y-5">
      <ModuleTabNav label={nl ? "Mails & schermen" : "Emails & screens"} tabs={tabs} variant="sub" />
      {children}
    </div>
  );
}
