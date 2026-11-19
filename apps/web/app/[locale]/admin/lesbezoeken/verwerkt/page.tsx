import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { LesbezoekBoardPage } from "../LesbezoekBoardPage";

/** Tabblad Verwerkt: wat goedgekeurd, geweigerd of geannuleerd is. */
export default async function AdminLesbezoekenVerwerktPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const { jaar } = await searchParams;
  const path = `${locale === "nl" ? "" : "/en"}/admin/lesbezoeken/verwerkt`;
  return <LesbezoekBoardPage locale={locale} jaar={jaar} mode="processed" path={path} />;
}
