import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { RequestsBoard } from "./RequestsBoard";
import { loadCourses, loadOpenFollow, loadRequests, loadRooms, loadTagSuggestions } from "./data";

/** Tabblad Aanvragen: het werkbakje met wat nog beslist moet worden, het langst wachtende bovenaan. */
export default async function AdminPalPlusPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; jaar?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("pal.manage");

  // De tabbladen waren eerst `?tab=...`; een bladwijzer van toen komt nog aan.
  const { tab, jaar } = await searchParams;
  if (tab && ["sessies", "tutors", "verwerkt", "vakken"].includes(tab)) {
    redirect(`${base}/admin/pal-plus/${tab}${tab === "tutors" && jaar ? `?jaar=${jaar}` : ""}`);
  }

  const [requests, courses, rooms, openFollow, tags] = await Promise.all([
    loadRequests("queue", locale),
    loadCourses(locale),
    loadRooms(),
    loadOpenFollow(locale),
    loadTagSuggestions(),
  ]);
  return (
    <RequestsBoard
      nl={nl}
      base={base}
      mode="queue"
      requests={requests}
      courses={courses.options}
      rooms={rooms}
      openFollow={openFollow}
      tags={tags}
    />
  );
}
