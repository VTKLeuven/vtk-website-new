import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { lesbezoekAccess } from "../access";
import { OrganisationsCard } from "../OrganisationsCard";

/** Tabblad Organisaties: wie een lesbezoek kan aanvragen, met kleur en contact. */
export default async function AdminLesbezoekenOrganisationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const { canManage } = await lesbezoekAccess();
  const rows = await prisma.lesbezoekOrganisation.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      colour: true,
      contactEmail: true,
      note: true,
      active: true,
      _count: { select: { visits: true } },
    },
  });
  return (
    <OrganisationsCard
      nl={locale === "nl"}
      canManage={canManage}
      organisations={rows.map((row) => ({
        id: row.id,
        name: row.name,
        colour: row.colour,
        contactEmail: row.contactEmail,
        note: row.note,
        active: row.active,
        visitCount: row._count.visits,
      }))}
    />
  );
}
