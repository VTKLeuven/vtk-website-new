import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { RequestsBoard } from "../RequestsBoard";
import { loadCourses, loadRequests } from "../data";

/** Tabblad Verwerkt: de aanvragen die gepland, afgesloten of ingetrokken zijn, het recentste eerst. */
export default async function AdminPalPlusProcessedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  await requirePermission("pal.manage");
  const [requests, courses] = await Promise.all([loadRequests("processed", locale), loadCourses(locale)]);
  return (
    <RequestsBoard
      nl={nl}
      base={nl ? "" : "/en"}
      mode="processed"
      requests={requests}
      courses={courses.options}
      rooms={[]}
      openFollow={[]}
      tags={{ presets: [], byCourse: {} }}
    />
  );
}
