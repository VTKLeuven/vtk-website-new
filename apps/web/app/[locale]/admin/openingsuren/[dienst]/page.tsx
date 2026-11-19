import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import type { OpeningHoursService } from "@/lib/openingHoursSettings";
import { OPENING_HOURS_SERVICES, OpeningHoursAdminView } from "../OpeningHoursAdminView";

/** Eén dienst: de kaart op de homepage en de uren. */
export default async function OpeningHoursServicePage({
  params,
}: {
  params: Promise<{ locale: string; dienst: string }>;
}) {
  const { locale, dienst } = await params;
  if (!hasLocale(locale)) notFound();
  if (!(OPENING_HOURS_SERVICES as string[]).includes(dienst)) notFound();
  return <OpeningHoursAdminView locale={locale} service={dienst as OpeningHoursService} />;
}
