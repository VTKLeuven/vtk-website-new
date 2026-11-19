import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getMeetingDrinks } from "@/lib/meetings-server";
import { MeetingDrinksCard } from "@/components/meetings/MeetingDrinksCard";

/** Tabblad Drankjes: welke drankjes er op het formulier staan, en hun prijs. */
export default async function AdminBureauDrinksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  await requirePermission("bureau.manage");

  const drinks = await getMeetingDrinks();
  return <MeetingDrinksCard nl={nl} kind="BUREAU" items={drinks.items} priceCents={drinks.priceCents} />;
}
