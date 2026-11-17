import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { currentWorkingYear } from "@/lib/workingYear";
import { loadGrocomeetSummary } from "@/lib/meetingAdmin";
import { GrocomeetSummaryCard } from "@/components/meetings/GrocomeetSummaryCard";

/** Tabblad Overzicht: wat er al gegeten en gedronken is, voor de herbegroting. */
export default async function AdminGrocomeetSummaryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  await requirePermission("grocomeet.manage");

  const workingYear = currentWorkingYear();
  const summary = await loadGrocomeetSummary(workingYear, locale);

  return (
    <GrocomeetSummaryCard
      nl={nl}
      summary={summary}
      workingYear={workingYear}
      exportHref={`/api/admin/grocomeet/export${nl ? "" : "?taal=en"}`}
    />
  );
}
