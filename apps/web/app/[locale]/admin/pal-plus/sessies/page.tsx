import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import { SessionsBoard } from "../SessionsBoard";
import { loadCourses, loadRooms, loadSessions, loadTagSuggestions } from "../data";

/** Tabblad Sessies: wat gepland staat, en de sessies van de laatste weken. */
export default async function AdminPalPlusSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("pal.manage");
  const [sessions, courses, rooms, tags] = await Promise.all([
    loadSessions(locale),
    loadCourses(locale),
    loadRooms(),
    loadTagSuggestions(),
  ]);
  return (
    <SessionsBoard
      nl={locale === "nl"}
      todayKey={ymdKey(brusselsYMD(new Date()))}
      {...sessions}
      courses={courses.options}
      rooms={rooms}
      tags={tags}
    />
  );
}
