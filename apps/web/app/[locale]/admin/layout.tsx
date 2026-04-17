import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";

const sections = [
  { key: "dashboard", href: "" },
  { key: "pages", href: "/paginas", perm: "pages.edit" },
  { key: "header", href: "/header", perm: "header.manage" },
  { key: "calendar", href: "/kalender", perm: "calendar.create" },
  { key: "albums", href: "/albums", perm: "photos.manageAlbums" },
  { key: "pocs", href: "/pocs", perm: "pocs.manage" },
  { key: "partners", href: "/partners", perm: "partners.manage" },
  { key: "users", href: "/gebruikers", perm: "users.view" },
  { key: "groups", href: "/groepen", perm: "groups.manage" },
  { key: "home", href: "/home", perm: "home.edit" },
] as const;

type DictAdmin = ReturnType<typeof getDictionary>["admin"];

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requireSession(`${locale === "nl" ? "" : "/en"}/inloggen?next=${locale === "nl" ? "" : "/en"}/admin`);
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";

  const adminDict = dict.admin as DictAdmin & { [key: string]: string };

  const visibleSections = sections.filter(
    (s) =>
      !("perm" in s) ||
      !s.perm ||
      session.user.isSuperAdmin ||
      session.permissions.includes(s.perm)
  );

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <aside className="md:sticky md:top-20 self-start">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-vtk-blue/50">
            {dict.admin.title}
          </h2>
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {visibleSections.map((s) => (
              <Link
                key={s.key}
                href={`${base}/admin${s.href}`}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-vtk-blue/85 transition hover:bg-vtk-blue-soft hover:text-vtk-blue"
              >
                {adminDict[s.key]}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
