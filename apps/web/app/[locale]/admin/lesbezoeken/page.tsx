import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { LesbezoekBoardPage } from "./LesbezoekBoardPage";

/** Tabblad Aanvragen: de werklijst met wat er nog moet gebeuren. */
export default async function AdminLesbezoekenPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; jaar?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const base = `${locale === "nl" ? "" : "/en"}/admin/lesbezoeken`;
  const { tab, jaar } = await searchParams;

  // De tabbladen waren eerst `?tab=...`; een bladwijzer van toen komt nog aan.
  const moved: Record<string, string> = {
    verwerkt: "verwerkt",
    goedgekeurd: "verwerkt",
    processed: "verwerkt",
    kalender: "kalender",
    instellingen: "organisaties",
  };
  if (tab && moved[tab]) redirect(`${base}/${moved[tab]}${jaar ? `?jaar=${jaar}` : ""}`);

  return <LesbezoekBoardPage locale={locale} jaar={jaar} mode="queue" path={base} />;
}
