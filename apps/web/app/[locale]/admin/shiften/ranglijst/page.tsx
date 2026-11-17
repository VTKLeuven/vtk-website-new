import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { ShiftAdminPage } from "../ShiftAdminPage";

/** Tabblad Ranglijst: wie hoeveel shiften deed in een academiejaar. */
export default async function AdminShiftsRanking({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; year?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <ShiftAdminPage locale={locale} tab="ranking" searchParams={searchParams} />;
}
