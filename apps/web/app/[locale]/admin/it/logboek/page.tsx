import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AUDIT_GROUPS,
  AUDIT_RETENTION_DAYS,
  pruneAuditLog,
  type AuditAction,
  type AuditEntity,
  type AuditGroup,
} from "@/lib/audit";

const PAGE_SIZE = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Search = {
  q?: string;
  actor?: string;
  group?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
};

/** Start (00:00) of einde (23:59:59) van een dag in Brussel, als UTC-moment. */
function dayBoundary(day: string, edge: "start" | "end"): Date | null {
  if (!DAY.test(day)) return null;
  try {
    return localDateTimeToUtc(`${day}T${edge === "start" ? "00:00:00" : "23:59:59"}`);
  } catch {
    return null;
  }
}

/**
 * Wegnemen valt op, de rest niet: wie dit scherm opent zoekt meestal wat er
 * verdwenen of ingetrokken is. Eén afwijkende kleur volstaat daarvoor; elke
 * actie een eigen kleur geven maakt de tabel enkel drukker.
 */
const DESTRUCTIVE: ReadonlySet<string> = new Set(["delete", "revoke", "cancel", "refund"]);

const entityKeys = Object.keys(AUDIT_ENTITIES) as AuditEntity[];
const actionKeys = Object.keys(AUDIT_ACTIONS) as AuditAction[];
const groupKeys = Object.keys(AUDIT_GROUPS) as AuditGroup[];

/**
 * Adminlogboek: wie deed wat in de admin, over de laatste
 * {@link AUDIT_RETENTION_DAYS} dagen.
 *
 * Alles staat in de URL (filters, zoekterm, pagina), zodat een bevinding
 * deelbaar is als link en de pagina zonder client-JS werkt.
 */
export default async function AdminAuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  await requirePermission("audit.view");

  // De bewaartermijn moet ook echt een bewaartermijn zijn, niet enkel een
  // vensterfilter. `logAudit` snoeit hoogstens één keer per uur per proces; dit
  // vangt de stille periodes op waarin er niets bijkomt.
  await pruneAuditLog().catch(() => null);

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 200);
  const actor = (sp.actor ?? "").trim();
  const group = groupKeys.includes(sp.group as AuditGroup) ? (sp.group as AuditGroup) : null;
  const action = actionKeys.includes(sp.action as AuditAction) ? (sp.action as AuditAction) : null;
  const from = sp.from && DAY.test(sp.from) ? sp.from : "";
  const to = sp.to && DAY.test(sp.to) ? sp.to : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const now = new Date();
  const retentionStart = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000);
  const fromDate = from ? dayBoundary(from, "start") : null;
  const toDate = to ? dayBoundary(to, "end") : null;

  const where: Prisma.AdminAuditLogWhereInput = {
    createdAt: {
      gte: fromDate && fromDate > retentionStart ? fromDate : retentionStart,
      ...(toDate ? { lte: toDate } : {}),
    },
    ...(actor ? { actorId: actor } : {}),
    ...(action ? { action } : {}),
    ...(group
      ? { entity: { in: entityKeys.filter((key) => AUDIT_ENTITIES[key].group === group) } }
      : {}),
    ...(q
      ? {
          OR: [
            { target: { contains: q, mode: "insensitive" as const } },
            { summary: { contains: q, mode: "insensitive" as const } },
            { actorName: { contains: q, mode: "insensitive" as const } },
            { entityId: q },
          ],
        }
      : {}),
  };

  const [total, rows, actors] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    // De personenlijst hangt bewust niet aan de andere filters: anders verdwijnt
    // de persoon waarop je zopas filterde uit zijn eigen keuzelijst.
    prisma.adminAuditLog.groupBy({
      by: ["actorId", "actorName"],
      where: { createdAt: { gte: retentionStart } },
      _count: { _all: true },
    }),
  ]);

  const collator = new Intl.Collator(nl ? "nl-BE" : "en-GB", { sensitivity: "base" });
  const people = actors
    .filter((row): row is typeof row & { actorId: string } => Boolean(row.actorId))
    .sort((a, b) => collator.compare(a.actorName, b.actorName));

  const dateTimeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const path = `${base}/admin/it/logboek`;
  const buildHref = (patch: Partial<Search>) => {
    const next = new URLSearchParams();
    const current: Search = {
      q: q || undefined,
      actor: actor || undefined,
      group: group ?? undefined,
      action: action ?? undefined,
      from: from || undefined,
      to: to || undefined,
      page: page > 1 ? String(page) : undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(current)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return `${path}${qs ? `?${qs}` : ""}`;
  };

  const filtered = Boolean(q || actor || group || action || from || to);
  const label = (entry: { nl: string; en: string }) => (nl ? entry.nl : entry.en);

  const fieldClass =
    "w-full rounded-xl border border-vtk-blue/20 bg-white px-3 py-2 text-sm text-vtk-ink";
  const labelClass = "mb-1 block text-xs font-medium text-[#5c667f]";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Adminlogboek" : "Admin log"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? `Wie in het beheer iets aanmaakte, wijzigde, verwijderde of toegang gaf. Alleen wijzigende acties; lezen, exporteren en de eigen instellingen van een lid staan er niet in. Regels worden ${AUDIT_RETENTION_DAYS} dagen bewaard en daarna verwijderd.`
            : `Who created, changed, deleted or granted access in the admin. Only changing actions; reading, exporting and a member's own settings are not recorded. Entries are kept for ${AUDIT_RETENTION_DAYS} days and then deleted.`}
        </p>
      </header>

      <form
        method="get"
        action={path}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-vtk-blue/12 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={labelClass} htmlFor="audit-q">
            {nl ? "Zoeken" : "Search"}
          </label>
          <input
            id="audit-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={
              nl
                ? "Naam van een evenement, pagina, persoon..."
                : "Name of an event, page, person..."
            }
            className={fieldClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="audit-actor">
            {nl ? "Persoon" : "Person"}
          </label>
          <select id="audit-actor" name="actor" defaultValue={actor} className={fieldClass}>
            <option value="">{nl ? "Iedereen" : "Everyone"}</option>
            {people.map((person) => (
              <option key={person.actorId} value={person.actorId}>
                {person.actorName} ({person._count._all})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="audit-group">
            {nl ? "Onderdeel" : "Section"}
          </label>
          <select id="audit-group" name="group" defaultValue={group ?? ""} className={fieldClass}>
            <option value="">{nl ? "Alle onderdelen" : "All sections"}</option>
            {groupKeys.map((key) => (
              <option key={key} value={key}>
                {label(AUDIT_GROUPS[key])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="audit-action">
            {nl ? "Soort actie" : "Kind of action"}
          </label>
          <select id="audit-action" name="action" defaultValue={action ?? ""} className={fieldClass}>
            <option value="">{nl ? "Alle acties" : "All actions"}</option>
            {actionKeys.map((key) => (
              <option key={key} value={key}>
                {label(AUDIT_ACTIONS[key])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="audit-from">
            {nl ? "Vanaf" : "From"}
          </label>
          <input
            id="audit-from"
            name="from"
            type="date"
            defaultValue={from}
            className={fieldClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="audit-to">
            {nl ? "Tot en met" : "Up to and including"}
          </label>
          <input id="audit-to" name="to" type="date" defaultValue={to} className={fieldClass} />
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-full bg-vtk-ink px-4 py-2 text-sm font-medium text-white"
          >
            {nl ? "Filteren" : "Filter"}
          </button>
          {filtered && (
            <Link
              href={path}
              className="rounded-full border border-vtk-blue/20 px-4 py-2 text-sm text-[#5c667f]"
            >
              {nl ? "Wissen" : "Clear"}
            </Link>
          )}
        </div>
      </form>

      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-vtk-ink">
            {nl ? "Acties" : "Actions"}{" "}
            <span className="font-normal text-[#5c667f]">
              ({total}
              {total === 1 ? (nl ? " regel" : " entry") : nl ? " regels" : " entries"})
            </span>
          </h2>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-[#5c667f]">
            {filtered
              ? nl
                ? "Geen acties die aan deze filter voldoen."
                : "No actions match this filter."
              : nl
                ? "Nog geen acties geregistreerd."
                : "No actions recorded yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#5c667f]">
                  <th className="py-2 pr-3">{nl ? "Wanneer" : "When"}</th>
                  <th className="py-2 pr-3">{nl ? "Wie" : "Who"}</th>
                  <th className="py-2 pr-3">{nl ? "Wat" : "What"}</th>
                  <th className="py-2 pr-3">{nl ? "Onderwerp" : "Subject"}</th>
                  <th className="py-2">{nl ? "Detail" : "Detail"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const entity = AUDIT_ENTITIES[row.entity as AuditEntity];
                  const kind = AUDIT_ACTIONS[row.action as AuditAction];
                  return (
                    <tr key={row.id} className="border-t border-vtk-blue/10 align-top">
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-[#34405e]">
                        {dateTimeFmt.format(row.createdAt)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-vtk-ink">
                        {row.actorId ? (
                          <Link
                            href={buildHref({ actor: row.actorId, page: undefined })}
                            className="underline decoration-vtk-blue/30 underline-offset-2"
                            title={
                              nl
                                ? `Toon alles van ${row.actorName}`
                                : `Show everything by ${row.actorName}`
                            }
                          >
                            {row.actorName}
                          </Link>
                        ) : (
                          row.actorName
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium " +
                            (DESTRUCTIVE.has(row.action)
                              ? "bg-red-100 text-red-800"
                              : "bg-vtk-blue-soft/60 text-[#34405e]")
                          }
                        >
                          {kind ? label(kind) : row.action}
                        </span>
                        <span className="ml-2 text-xs text-[#5c667f]">
                          {entity ? label(entity) : row.entity}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-vtk-ink">{row.target}</td>
                      <td className="py-2 text-xs text-[#5c667f]">{row.summary ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-[#5c667f]">
            <span>
              {nl ? "Pagina" : "Page"} {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={buildHref({ page: String(page - 1) })}
                  className="rounded-full border border-vtk-blue/20 px-3 py-1"
                >
                  {nl ? "Vorige" : "Previous"}
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildHref({ page: String(page + 1) })}
                  className="rounded-full border border-vtk-blue/20 px-3 py-1"
                >
                  {nl ? "Volgende" : "Next"}
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
