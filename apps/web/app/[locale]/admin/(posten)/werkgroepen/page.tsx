import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { WerkingenAdmin } from "./WerkingenAdmin";

export default async function AdminWerkgroepen({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale } = await params;
  const { jaar } = await searchParams;
  if (!hasLocale(locale)) notFound();
  return <WerkingenAdmin kind="WERKGROEP" locale={locale} jaar={jaar} />;
}
