import { hasLocale } from "@/lib/locale";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { requireSession } from "@/lib/session";
import { Card } from "@vtk/ui";

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requireSession();
  const dict = getDictionary(locale);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{dict.admin.dashboard}</h1>
        <p className="text-sm text-zinc-500">
          {locale === "nl" ? "Welkom" : "Welcome"}, {session.user.name}.
        </p>
      </header>
      <Card className="p-5">
        <h2 className="font-semibold mb-2">
          {locale === "nl" ? "Jouw rechten" : "Your permissions"}
        </h2>
        {session.user.isSuperAdmin ? (
          <p className="text-sm">
            {locale === "nl" ? "Superadmin – alle rechten." : "Super admin – all permissions."}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-xs">
            {session.permissions.length === 0 ? (
              <li className="text-zinc-500">—</li>
            ) : (
              session.permissions.map((p) => (
                <li key={p} className="rounded bg-vtk-blue-soft px-2 py-1">
                  {p}
                </li>
              ))
            )}
          </ul>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold mb-2">
          {locale === "nl" ? "Groepen" : "Groups"}
        </h2>
        <ul className="flex flex-wrap gap-2 text-xs">
          {session.groups.length === 0 ? (
            <li className="text-zinc-500">—</li>
          ) : (
            session.groups.map((g) => (
              <li key={g.id} className="rounded bg-vtk-blue/10 text-vtk-blue px-2 py-1">
                {locale === "nl" ? g.nameNl : g.nameEn} · {g.role}
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
