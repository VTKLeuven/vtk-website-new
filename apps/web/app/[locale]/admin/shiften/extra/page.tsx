import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { ShiftAdminPage } from "../ShiftAdminPage";

/** Tabblad Extra shiften: shiften die buiten /shift toegekend werden. */
export default async function AdminShiftsManual({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; year?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <ShiftAdminPage locale={locale} tab="manual" searchParams={searchParams} />;
}
