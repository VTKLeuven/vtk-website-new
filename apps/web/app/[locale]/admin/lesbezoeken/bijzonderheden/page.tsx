import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { lesbezoekAccess } from "../access";
import { PeculiaritiesCard } from "../PeculiaritiesCard";

/** Tabblad Bijzonderheden: wat je per professor of vak moet weten voor je een bezoek goedkeurt. */
export default async function AdminLesbezoekenPeculiaritiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const { canManage } = await lesbezoekAccess();
  const rows = await prisma.lesbezoekPeculiarity.findMany({ orderBy: { subject: "asc" } });
  return (
    <PeculiaritiesCard
      nl={locale === "nl"}
      canManage={canManage}
      peculiarities={rows.map((row) => ({ id: row.id, subject: row.subject, note: row.note }))}
    />
  );
}
