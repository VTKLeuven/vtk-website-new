import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { canAccessAnyTicketEvent } from "@/lib/ticketing/authorization";

import "@/app/design/vtk-admin.css";

const sections = [
  { key: "dashboard", href: "" },
  { key: "pages", href: "/paginas", perm: "pages.edit" },
  { key: "header", href: "/header", perm: "header.manage" },
  { key: "calendar", href: "/kalender", perm: "calendar.create" },
  { key: "tickets", href: "/tickets", ticketing: true },
  { key: "albums", href: "/albums", perm: "photos.manageAlbums" },
  { key: "pocs", href: "/pocs", perm: "pocs.manage" },
  { key: "partners", href: "/partners", perm: "partners.manage" },
  { key: "users", href: "/gebruikers", perm: "users.view" },
  { key: "groups", href: "/groepen", perm: "groups.manage" },
  { key: "home", href: "/home", perm: "home.edit" },
  { key: "dashboardTiles", href: "/dashboard-tiles", perm: "dashboard.manage" },
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
  const canAccessTickets =
    session.user.isSuperAdmin ||
    session.permissions.includes("tickets.create") ||
    session.permissions.includes("tickets.manageAll") ||
    (await canAccessAnyTicketEvent());

  const visibleSections = sections.filter(
    (s) =>
      (!("ticketing" in s) || !s.ticketing || canAccessTickets) &&
      (!("perm" in s) ||
        !s.perm ||
        session.user.isSuperAdmin ||
        session.permissions.includes(s.perm))
  );

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
