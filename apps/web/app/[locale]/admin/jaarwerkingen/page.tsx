import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { WerkingenAdmin } from "../werkgroepen/WerkingenAdmin";

/** Zelfde scherm als /admin/werkgroepen; zie `WerkingenAdmin` en `lib/groupKinds.ts`. */
export default async function AdminJaarwerkingen({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale } = await params;
  const { jaar } = await searchParams;
  if (!hasLocale(locale)) notFound();
  return <WerkingenAdmin kind="JAARWERKING" locale={locale} jaar={jaar} />;
}
