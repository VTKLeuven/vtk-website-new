import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { POC_BAND_SETTING, readPocBandSetting } from "@/lib/home/pocBand";
import { PocBandAdminCard } from "../PocBandAdminCard";

/** Tabblad Homepage: de band met de POC's van jouw richting op de homepage. */
export default async function AdminPocsHomepage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("pocs.manage");
  const row = await prisma.setting.findUnique({ where: { key: POC_BAND_SETTING } });
  return <PocBandAdminCard setting={readPocBandSetting(row?.value)} locale={locale} />;
}
