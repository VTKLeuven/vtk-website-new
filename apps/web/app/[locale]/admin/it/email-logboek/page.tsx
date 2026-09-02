import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import {
  EMAIL_LOG_RETENTION_DAYS,
  EMAIL_SOURCES,
  pruneEmailLog,
  type EmailSource,
} from "@/lib/email";

const PAGE_SIZE = 30;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["SENT", "PARTIAL", "FAILED", "SIMULATED"] as const;
type Status = (typeof STATUSES)[number];

type Search = {
  q?: string;
  source?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: string;
};

function dayBoundary(day: string, edge: "start" | "end"): Date | null {
  if (!DAY.test(day)) return null;
  try {
    return localDateTimeToUtc(`${day}T${edge === "start" ? "00:00:00" : "23:59:59"}`);
  } catch {
    return null;
  }
}

const STATUS_LABELS: Record<Status, { nl: string; en: string }> = {
  SENT: { nl: "Verstuurd", en: "Sent" },
  PARTIAL: { nl: "Deels geweigerd", en: "Partially rejected" },
  FAILED: { nl: "Mislukt", en: "Failed" },
  SIMULATED: { nl: "Lokaal gesimuleerd", en: "Simulated locally" },
};

const STATUS_CLASS: Record<Status, string> = {
  SENT: "bg-emerald-100 text-emerald-800",
  PARTIAL: "bg-amber-100 text-amber-900",
  FAILED: "bg-red-100 text-red-800",
  SIMULATED: "bg-zinc-100 text-zinc-700",
};

export default async function EmailLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const nl = localeParam === "nl";
  const base = nl ? "" : "/en";

  const session = await requireSession();
  if (!session.user.isSuperAdmin) notFound();

  // Ook een rechtstreeks bezoek aan dit scherm handhaaft de bewaartermijn;
  // snoeien gebeurt daarnaast hoogstens elk uur wanneer er mail vertrekt.
  await pruneEmailLog().catch(() => null);

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 200);
  const sourceKeys = Object.keys(EMAIL_SOURCES) as EmailSource[];
  const source = sourceKeys.includes(sp.source as EmailSource) ? (sp.source as EmailSource) : null;
  const status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : null;
  const from = sp.from && DAY.test(sp.from) ? sp.from : "";
  const to = sp.to && DAY.test(sp.to) ? sp.to : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const now = new Date();
  const retentionStart = new Date(now.getTime() - EMAIL_LOG_RETENTION_DAYS * 86_400_000);
  const fromDate = from ? dayBoundary(from, "start") : null;
  const toDate = to ? dayBoundary(to, "end") : null;
  const where: Prisma.EmailLogWhereInput = {
    createdAt: {
      gte: fromDate && fromDate > retentionStart ? fromDate : retentionStart,
      ...(toDate ? { lte: toDate } : {}),
    },
    ...(source ? { source } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" as const } },
            { from: { contains: q, mode: "insensitive" as const } },
            { to: { contains: q, mode: "insensitive" as const } },
            { cc: { contains: q, mode: "insensitive" as const } },
            { replyTo: { contains: q, mode: "insensitive" as const } },
            { text: { contains: q, mode: "insensitive" as const } },
            { providerMessageId: { contains: q, mode: "insensitive" as const } },
            { error: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, rows, statusCounts] = await Promise.all([
    prisma.emailLog.count({ where }),
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        completedAt: true,
        durationMs: true,
        status: true,
        source: true,
        from: true,
        to: true,
        cc: true,
        subject: true,
        rejected: true,
      },
    }),
    prisma.emailLog.groupBy({
      by: ["status"],
      where: { createdAt: { gte: retentionStart } },
      _count: { _all: true },
    }),
  ]);

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const path = `${base}/admin/it/email-logboek`;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || source || status || from || to);
  const label = (entry: { nl: string; en: string }) => (nl ? entry.nl : entry.en);
  const countFor = (key: Status) =>
    statusCounts.find((row) => row.status === key)?._count._all ?? 0;
  const buildHref = (patch: Partial<Search>) => {
    const next = new URLSearchParams();
    const current: Search = {
      q: q || undefined,
      source: source ?? undefined,
      status: status ?? undefined,
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

  const fieldClass =
    "w-full rounded-xl border border-vtk-blue/20 bg-white px-3 py-2 text-sm text-vtk-ink";
  const labelClass = "mb-1 block text-xs font-medium text-[#5c667f]";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-vtk-ink">
          {nl ? "Email-logboek" : "Email log"}
        </h1>
        <p className="mt-1 max-w-4xl text-sm text-[#5c667f]">
          {nl
            ? `Elke verzendpoging vanuit de website, inclusief inhoud, SMTP-resultaat en bijlagemetadata. "Verstuurd" betekent dat de mailserver het bericht aanvaardde; aflevering in de inbox kan hij niet bevestigen. Omdat mails persoonsgegevens en eenmalige links kunnen bevatten, is dit scherm enkel voor superadmins en worden regels na ${EMAIL_LOG_RETENTION_DAYS} dagen verwijderd.`
            : `Every send attempt from the website, including content, SMTP result and attachment metadata. “Sent” means the mail server accepted the message; it cannot confirm delivery to the inbox. Because emails can contain personal data and one-time links, this page is limited to superadmins and entries are deleted after ${EMAIL_LOG_RETENTION_DAYS} days.`}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map((key) => (
          <Link
            key={key}
            href={buildHref({ status: key, page: undefined })}
            className="rounded-2xl border border-vtk-blue/12 bg-white p-4 transition hover:border-vtk-blue/30"
          >
            <div className="text-2xl font-semibold tabular-nums text-vtk-ink">{countFor(key)}</div>
            <div className="mt-1 text-xs text-[#5c667f]">{label(STATUS_LABELS[key])}</div>
          </Link>
        ))}
      </div>

      <form
        method="get"
        action={path}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-vtk-blue/12 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="sm:col-span-2 lg:col-span-4">
          <label className={labelClass} htmlFor="email-log-q">
            {nl ? "Zoeken" : "Search"}
          </label>
          <input
            id="email-log-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={
              nl
                ? "Onderwerp, adres, inhoud, message-id of foutmelding..."
                : "Subject, address, content, message ID or error..."
            }
            className={fieldClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="email-log-source">
            {nl ? "Herkomst" : "Source"}
          </label>
          <select id="email-log-source" name="source" defaultValue={source ?? ""} className={fieldClass}>
            <option value="">{nl ? "Alle onderdelen" : "All sources"}</option>
            {sourceKeys.map((key) => (
              <option key={key} value={key}>
                {label(EMAIL_SOURCES[key])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="email-log-status">
            Status
          </label>
          <select id="email-log-status" name="status" defaultValue={status ?? ""} className={fieldClass}>
            <option value="">{nl ? "Alle statussen" : "All statuses"}</option>
            {STATUSES.map((key) => (
              <option key={key} value={key}>
                {label(STATUS_LABELS[key])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="email-log-from">
            {nl ? "Vanaf" : "From"}
          </label>
          <input id="email-log-from" name="from" type="date" defaultValue={from} className={fieldClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="email-log-to">
            {nl ? "Tot en met" : "Up to and including"}
          </label>
          <input id="email-log-to" name="to" type="date" defaultValue={to} className={fieldClass} />
        </div>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded-full bg-vtk-ink px-4 py-2 text-sm font-medium text-white">
            {nl ? "Filteren" : "Filter"}
          </button>
          {filtered && (
            <Link href={path} className="rounded-full border border-vtk-blue/20 px-4 py-2 text-sm text-[#5c667f]">
              {nl ? "Wissen" : "Clear"}
            </Link>
          )}
        </div>
      </form>

      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-sm font-semibold text-vtk-ink">
          {nl ? "Verzendpogingen" : "Send attempts"}{" "}
          <span className="font-normal text-[#5c667f]">({total})</span>
        </h2>

        {rows.length === 0 ? (
          <p className="text-sm text-[#5c667f]">
            {filtered
              ? nl
                ? "Geen mails die aan deze filter voldoen."
                : "No emails match this filter."
              : nl
                ? "Nog geen mails geregistreerd."
                : "No emails recorded yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#5c667f]">
                  <th className="py-2 pr-3">{nl ? "Datum" : "Date"}</th>
                  <th className="py-2 pr-3">{nl ? "Tijd" : "Time"}</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">{nl ? "Onderwerp" : "Subject"}</th>
                  <th className="py-2 pr-3">{nl ? "Afzender" : "Sender"}</th>
                  <th className="py-2 pr-3">{nl ? "Ontvangers" : "Recipients"}</th>
                  <th className="py-2">{nl ? "Herkomst" : "Source"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowStatus = row.status as Status;
                  const sourceLabel = EMAIL_SOURCES[row.source as EmailSource];
                  return (
                    <tr key={row.id} className="border-t border-vtk-blue/10 align-top">
                      <td className="whitespace-nowrap py-3 pr-3 tabular-nums text-[#34405e]">
                        {dateFmt.format(row.completedAt)}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 tabular-nums text-[#34405e]">
                        {timeFmt.format(row.completedAt)}
                        <span className="ml-1 text-[11px] text-zinc-400">({row.durationMs} ms)</span>
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[rowStatus]}`}>
                          {label(STATUS_LABELS[rowStatus])}
                        </span>
                        {row.rejected.length > 0 && (
                          <div className="mt-1 text-[11px] text-red-700">
                            {row.rejected.length} {nl ? "geweigerd" : "rejected"}
                          </div>
                        )}
                      </td>
                      <td className="max-w-sm py-3 pr-3 font-medium text-vtk-ink">
                        <Link href={`${path}/${row.id}`} className="underline decoration-vtk-blue/30 underline-offset-2">
                          {row.subject}
                        </Link>
                      </td>
                      <td className="max-w-52 break-words py-3 pr-3 text-[#34405e]">{row.from}</td>
                      <td className="max-w-64 break-words py-3 pr-3 text-[#34405e]">
                        <div>{row.to}</div>
                        {row.cc && <div className="mt-1 text-xs text-[#5c667f]">CC: {row.cc}</div>}
                      </td>
                      <td className="whitespace-nowrap py-3 text-xs text-[#5c667f]">
                        {sourceLabel ? label(sourceLabel) : row.source}
                      </td>
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
                <Link href={buildHref({ page: String(page - 1) })} className="rounded-full border border-vtk-blue/20 px-3 py-1">
                  {nl ? "Vorige" : "Previous"}
                </Link>
              )}
              {page < totalPages && (
                <Link href={buildHref({ page: String(page + 1) })} className="rounded-full border border-vtk-blue/20 px-3 py-1">
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
