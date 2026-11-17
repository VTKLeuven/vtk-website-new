import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { ShiftAdminPage } from "../ShiftAdminPage";

/** Tabblad Bonnetjes: wie welke bonnetjes verdiende en kreeg. */
export default async function AdminShiftsRewards({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; year?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <ShiftAdminPage locale={locale} tab="rewards" searchParams={searchParams} />;
}
