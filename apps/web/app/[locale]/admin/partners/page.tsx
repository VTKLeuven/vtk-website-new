import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { publicUrl } from "@/lib/storage";
import { NewPartnerForm } from "./NewPartnerForm";
import { PartnersGrid, type PartnerTile } from "./PartnersGrid";

export default async function AdminPartners({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("partners.manage");

  const partners = await prisma.partner.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
  const tiles: PartnerTile[] = partners.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url,
    logoKey: p.logoKey,
    logoUrl: publicUrl(p.logoKey),
    active: p.active,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{locale === "nl" ? "Partners beheren" : "Manage partners"}</h1>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">{locale === "nl" ? "Nieuwe partner" : "New partner"}</h2>
        <NewPartnerForm locale={locale} />
      </Card>

      <Card className="space-y-4 p-5">
        <PartnersGrid locale={locale} partners={tiles} />
      </Card>
    </div>
  );
}
