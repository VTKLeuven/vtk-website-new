import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { Button, Card } from "@vtk/ui";
import { deleteEventAction } from "@/app/actions/calendar";

export default async function AdminCalendar({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requireSession();
  const base = locale === "nl" ? "" : "/en";

  const canAll = session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  const canCreate = canAll || hasPermission(session, "calendar.create");

  if (!canCreate) {
    return <p>{locale === "nl" ? "Geen toegang." : "No access."}</p>;
  }

  const where = canAll
    ? {}
    : { groupId: { in: session.groups.map((g) => g.id) } };

  const events = await prisma.calendarEvent.findMany({
    where,
    include: { group: true },
    orderBy: { start: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{locale === "nl" ? "Evenementen" : "Events"}</h1>
        <Link href={`${base}/admin/kalender/new`}>
          <Button>{locale === "nl" ? "Nieuw evenement" : "New event"}</Button>
        </Link>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th className="px-4 py-2">{locale === "nl" ? "Titel" : "Title"}</th>
              <th className="px-4 py-2">{locale === "nl" ? "Groep" : "Group"}</th>
              <th className="px-4 py-2">{locale === "nl" ? "Start" : "Start"}</th>
              <th className="px-4 py-2">{locale === "nl" ? "Einde" : "End"}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-zinc-200">
                <td className="px-4 py-2 font-medium">{e.titleNl}</td>
                <td className="px-4 py-2 text-zinc-500">{locale === "nl" ? e.group.nameNl : e.group.nameEn}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {e.start.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB")}
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {e.end.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB")}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`${base}/admin/kalender/${e.id}`}
                      className="text-vtk-blue hover:underline text-sm"
                    >
                      {locale === "nl" ? "Bewerken" : "Edit"}
                    </Link>
                    <form action={deleteEventAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-red-600 hover:underline text-sm" type="submit">
                        {locale === "nl" ? "Verwijderen" : "Delete"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  {locale === "nl" ? "Nog geen evenementen" : "No events yet"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
