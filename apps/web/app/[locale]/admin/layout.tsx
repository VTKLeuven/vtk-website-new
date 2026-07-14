import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";

import "@/app/design/vtk-admin.css";

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
  { key: "dashboardTiles", href: "/dashboard-tiles", perm: "dashboard.manage" },
  { key: "shortlinks", href: "/links", perm: "shortlinks.manage" },
  { key: "shift", href: "/shiften", anyPerm: ["shift.edit", "shift.reward", "shift.ranking"] },
  { key: "theokot", href: "/theokot", anyPerm: ["theokot.manage", "theokot.pickup"] },
  { key: "it", href: "/it", superAdminOnly: true },
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

  const visibleSections = sections.filter((s) => {
    if (session.user.isSuperAdmin) return true;
    if ("superAdminOnly" in s && s.superAdminOnly) return false;
    if ("anyPerm" in s) return s.anyPerm.some((p) => session.permissions.includes(p));
    if (!("perm" in s) || !s.perm) return true;
    return session.permissions.includes(s.perm);
  });

  return (
    <div className="vtk-admin-surface">
      <div className="vtk-admin-surface-inner">
        <aside className="md:sticky md:top-24 self-start">
          <h2 className="vtk-admin-nav-title">{dict.admin.title}</h2>
          <nav className="vtk-admin-nav">
            {visibleSections.map((s) => (
              <Link key={s.key} href={`${base}/admin${s.href}`}>
                {adminDict[s.key]}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="vtk-admin-main">{children}</section>
      </div>
    </div>
  );
}
