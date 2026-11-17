import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { LesbezoekBoardPage } from "../LesbezoekBoardPage";

/** Tabblad Kalender: dezelfde bezoeken per maand, week of dag. */
export default async function AdminLesbezoekenKalenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const { jaar } = await searchParams;
  const path = `${locale === "nl" ? "" : "/en"}/admin/lesbezoeken/kalender`;
  return <LesbezoekBoardPage locale={locale} jaar={jaar} mode="calendar" path={path} />;
}
