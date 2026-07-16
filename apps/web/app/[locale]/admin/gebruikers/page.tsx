import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { IconLink, RowActions } from "@/components/ui/IconButton";
import { PencilIcon } from "@/components/ui/icons";
import { userErrorMessages } from "./messages";
import { UsersToolbar } from "./UsersToolbar";

const PAGE_SIZE = 25;
type SortKey = "name" | "email" | "rNumber";
const SORT_KEYS: SortKey[] = ["name", "email", "rNumber"];

export default async function AdminUsers({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const { locale: localeParam } = await params;
  const sp = await searchParams;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requirePermission("users.view");
  const dict = getDictionary(locale);
  const canEdit = session.user.isSuperAdmin || session.permissions.includes("users.edit");
  const canBulkImport = canEdit && session.permissions.includes("users.bulkImport");

  const q = (sp.q ?? "").trim();
  const sortKey: SortKey = SORT_KEYS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "name";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const rawPage = Math.max(1, Number(sp.page) || 1);

  // Zoeken gebeurt in de DB (niet op een geladen lijst): match op naam, e-mail of
  // r-nummer. Met paginatie (take/skip) blijft dit schaalbaar bij 24k+ gebruikers.
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { rNumber: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(rawPage, totalPages);

  // Enkel de kolommen die de tabel toont; memberships worden bewust NIET geladen.
  const users = await prisma.user.findMany({
    where,
    orderBy: { [sortKey]: dir } as Prisma.UserOrderByWithRelationInput,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, name: true, email: true, rNumber: true, isSuperAdmin: true, active: true },
  });

  const buildParams = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("sort", sortKey);
    params.set("dir", dir);
    return params;
  };
  const sortHref = (key: SortKey) => {
    const params = buildParams();
    params.set("sort", key);
    params.set("dir", sortKey === key && dir === "asc" ? "desc" : "asc");
    return `${base}/admin/gebruikers?${params.toString()}`;
  };
  const pageHref = (p: number) => {
    const params = buildParams();
    params.set("page", String(p));
    return `${base}/admin/gebruikers?${params.toString()}`;
  };

  const colCount = canEdit ? 4 : 3;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const newUserLabels = {
    submitLabel: nl ? "Aanmaken" : "Create",
    savingLabel: dict.common.saving,
    savedMessage: nl ? "Gebruiker aangemaakt" : "User created",
    fallbackErrorMessage: dict.common.saveError,
    errorMessages: userErrorMessages(locale),
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Gebruikers" : "Users"}</h1>
        <p className="mt-1 text-sm text-[#5c667f]">
          {nl
            ? "Zoek een lid op naam, e-mail of r-nummer. Bewerken opent het profiel op een eigen pagina."
            : "Search a member by name, email or r-number. Editing opens the profile on its own page."}
        </p>
      </div>

      <UsersToolbar
        locale={nl ? "nl" : "en"}
        canEdit={canEdit}
        canBulkImport={canBulkImport}
        initialQuery={q}
        newUserLabels={newUserLabels}
      />

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <SortableTh href={sortHref("name")} label={nl ? "Naam" : "Name"} active={sortKey === "name"} dir={dir} />
              <SortableTh href={sortHref("rNumber")} label={nl ? "R-nummer" : "R-number"} active={sortKey === "rNumber"} dir={dir} />
              <SortableTh href={sortHref("email")} label="Email" active={sortKey === "email"} dir={dir} />
              {canEdit && <th aria-hidden />}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">
                  {u.name}
                  {u.isSuperAdmin && (
                    <span className="ml-2 rounded bg-vtk-yellow px-1 text-xs text-vtk-blue">admin</span>
                  )}
                  {!u.active && (
                    <span className="ml-2 rounded bg-zinc-300 px-1 text-xs text-zinc-700">
                      {nl ? "inactief" : "inactive"}
                    </span>
                  )}
                </td>
                <td className="tabular-nums text-[#5c667f]">{u.rNumber ?? "—"}</td>
                <td className="text-[#5c667f]">{u.email}</td>
                {canEdit && (
                  <td className="text-right">
                    <RowActions>
                      <IconLink
                        href={`${base}/admin/gebruikers/${u.id}`}
                        label={nl ? "Bewerken" : "Edit"}
                        srLabel={`${nl ? "Bewerken" : "Edit"}: ${u.name}`}
                      >
                        <PencilIcon />
                      </IconLink>
                    </RowActions>
                  </td>
                )}
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-[#5c667f]">
                  {q ? (nl ? "Geen gebruikers gevonden." : "No users found.") : nl ? "Nog geen gebruikers." : "No users yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginatie */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#5c667f]">
        <span>
          {total === 0
            ? nl
              ? "0 gebruikers"
              : "0 users"
            : nl
              ? `${from}–${to} van ${total} gebruikers`
              : `${from}–${to} of ${total} users`}
        </span>
        <div className="flex items-center gap-2">
          <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
            {nl ? "Vorige" : "Previous"}
          </PageLink>
          <span className="tabular-nums">
            {nl ? `Pagina ${page} van ${totalPages}` : `Page ${page} of ${totalPages}`}
          </span>
          <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
            {nl ? "Volgende" : "Next"}
          </PageLink>
        </div>
      </div>
    </div>
  );
}

function SortableTh({ href, label, active, dir }: { href: string; label: string; active: boolean; dir: "asc" | "desc" }) {
  return (
    <th>
      <Link href={href} className="inline-flex items-center gap-1" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        <span>{label}</span>
        <Caret active={active} dir={dir} />
      </Link>
    </th>
  );
}

function Caret({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={active ? "text-vtk-ink" : "text-zinc-300"}
    >
      {active && dir === "desc" ? <polyline points="6 9 12 15 18 9" /> : <polyline points="18 15 12 9 6 15" />}
    </svg>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return <span className="rounded-full border border-vtk-blue/10 px-3 py-1 text-zinc-300">{children}</span>;
  }
  return (
    <Link href={href} className="rounded-full border border-vtk-blue/20 px-3 py-1 text-vtk-ink hover:bg-vtk-blue-soft/50">
      {children}
    </Link>
  );
}
