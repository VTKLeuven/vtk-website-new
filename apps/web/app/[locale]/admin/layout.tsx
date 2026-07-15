import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { canAccessAnyTicketEvent } from "@/lib/ticketing/authorization";

import "@/app/design/vtk-admin.css";

const sections = [
  { key: "dashboard", href: "" },
  { key: "content", href: "/inhoud", anyPerm: ["pages.edit", "header.manage"] },
  { key: "calendar", href: "/kalender", perm: "calendar.create" },
  { key: "tickets", href: "/tickets", ticketing: true },
  { key: "albums", href: "/albums", perm: "photos.manageAlbums" },
  { key: "media", href: "/media", perm: "media.manage" },
  { key: "pocs", href: "/pocs", perm: "pocs.manage" },
  { key: "partners", href: "/partners", perm: "partners.manage" },
  { key: "users", href: "/gebruikers", perm: "users.view" },
  { key: "mailinglists", href: "/mailinglijsten", perm: "mailinglists.export" },
  { key: "groups", href: "/groepen", perm: "groups.manage" },
  { key: "roles", href: "/roles", perm: "roles.manage" },
  { key: "home", href: "/home", perm: "home.edit" },
  { key: "dashboardTiles", href: "/dashboard-tiles", perm: "dashboard.manage" },
  { key: "shortlinks", href: "/links", perm: "shortlinks.manage" },
  { key: "shift", href: "/shiften", anyPerm: ["shift.edit", "shift.reward", "shift.ranking"] },
  { key: "theokot", href: "/theokot", anyPerm: ["theokot.manage", "theokot.pickup"] },
  { key: "it", href: "/it", superAdminOnly: true },
] as const;

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

// Icons zijn gekozen zodat je in een oogopslag de juiste tab herkent.
const icons: Record<string, ReactNode> = {
  // dashboard: overzichtstegels (landing page)
  dashboard: (
    <Svg>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Svg>
  ),
  // content: navigatiebalk bovenaan met de pagina's eronder
  content: (
    <Svg>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M7 13h10" />
      <path d="M7 17h6" />
    </Svg>
  ),
  // calendar: kalender
  calendar: (
    <Svg>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </Svg>
  ),
  // albums: foto
  albums: (
    <Svg>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Svg>
  ),
  // pocs: studentenvertegenwoordigers -> studentenmuts
  pocs: (
    <Svg>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5" />
    </Svg>
  ),
  // partners: bedrijven/sponsors -> aktetas
  partners: (
    <Svg>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </Svg>
  ),
  // users: individuele gebruiker
  users: (
    <Svg>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  ),
  // mailinglists: envelop
  mailinglists: (
    <Svg>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </Svg>
  ),
  // groups: meerdere gebruikers
  groups: (
    <Svg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
  // roles: rechtenbundel -> schild met vinkje
  roles: (
    <Svg>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  // home: huis
  home: (
    <Svg>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Svg>
  ),
  // dashboardTiles: raster van tegels
  dashboardTiles: (
    <Svg>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  // shortlinks: link/ketting
  shortlinks: (
    <Svg>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Svg>
  ),
  // shift: shiften -> klok
  shift: (
    <Svg>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Svg>
  ),
  // theokot: eten & drinken -> koffiebeker
  theokot: (
    <Svg>
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M6 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
    </Svg>
  ),
  // it: terminal
  it: (
    <Svg>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </Svg>
  ),
};

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

  const visibleSections = sections.filter((s) => {
    // Ticketing-tab hangt af van ticket-toegang (eigen grant of globale perm),
    // niet van de gewone admin-permissies. canAccessTickets dekt superadmins al.
    if ("ticketing" in s && s.ticketing) return canAccessTickets;
    if (session.user.isSuperAdmin) return true;
    if ("superAdminOnly" in s && s.superAdminOnly) return false;
    if ("anyPerm" in s) return s.anyPerm.some((p) => session.permissions.includes(p));
    if (!("perm" in s) || !s.perm) return true;
    return session.permissions.includes(s.perm);
  });

  // Dashboard blijft bovenaan (landing page); de rest alfabetisch op label.
  const orderedSections = [...visibleSections].sort((a, b) => {
    if (a.key === "dashboard") return -1;
    if (b.key === "dashboard") return 1;
    return adminDict[a.key].localeCompare(adminDict[b.key], locale);
  });

  return (
    <div className="vtk-admin-surface">
      <div className="vtk-admin-surface-inner">
        <aside className="md:sticky md:top-24 self-start">
          <h2 className="vtk-admin-nav-title">{dict.admin.title}</h2>
          <nav className="vtk-admin-nav">
            {orderedSections.map((s) => (
              <Link
                key={s.key}
                href={`${base}/admin${s.href}`}
                className="inline-flex items-center gap-2"
              >
                {icons[s.key]}
                <span>{adminDict[s.key]}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <section className="vtk-admin-main">{children}</section>
      </div>
    </div>
  );
}
