import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { parseWorkingYear } from "@/lib/workingYear";
import { TutorsTab } from "../data";

/** Tabblad Tutors: wie in een werkingsjaar sessies gaf, met de beloning per sessie. */
export default async function AdminPalPlusTutorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  await requirePermission("pal.manage");
  const { jaar } = await searchParams;
  return <TutorsTab nl={nl} base={nl ? "" : "/en"} locale={locale} year={parseWorkingYear(jaar)} />;
}
