import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { ShiftAdminPage } from "./ShiftAdminPage";

/** Tabblad Beheer: de shiften in een periode, aanmaken en bewerken. */
export default async function AdminShifts({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; year?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <ShiftAdminPage locale={locale} tab="manage" searchParams={searchParams} />;
}
