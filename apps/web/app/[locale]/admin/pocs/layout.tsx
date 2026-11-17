import { notFound } from "next/navigation";
import { AtSign, House, MessageCircle, Users } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { discordGuildConfigured } from "@/lib/discord/bot";
import { ModuleAdminShell, type ModuleTab } from "@/components/admin/ModuleAdminShell";

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

/**
 * Beheer van de POC's (`pocs.manage`), in tabbladen zoals Tickets: de POC's
 * met hun vertegenwoordigers per werkingsjaar (het werk van elk jaar, dus
 * eerst), de groepsadressen, de band op de homepage, en Discord. Dat stond als
 * vier kaarten onder elkaar, met de POC's zelf onderaan.
 */
export default async function AdminPocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("pocs.manage");
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/pocs`;

  const tabs: ModuleTab[] = [
    { href: base, label: nl ? "POC's" : "POCs", icon: <Users {...ICON} />, segments: [null] },
    { href: `${base}/mail`, label: nl ? "Groepsadressen" : "Group addresses", icon: <AtSign {...ICON} />, segments: ["mail"] },
    { href: `${base}/homepage`, label: "Homepage", icon: <House {...ICON} />, segments: ["homepage"] },
  ];
  if (discordGuildConfigured()) {
    tabs.push({ href: `${base}/discord`, label: "Discord", icon: <MessageCircle {...ICON} />, segments: ["discord"] });
  }

  return (
    <ModuleAdminShell
      title={nl ? "POC's" : "POCs"}
      lead={
        nl
          ? "Aanspreekpunten per studierichting. Vertegenwoordigers gelden per werkingsjaar."
          : "Points of contact per study track. Representatives apply per working year."
      }
      navLabel={nl ? "POC's" : "POCs"}
      tabs={tabs}
    >
      {children}
    </ModuleAdminShell>
  );
}
