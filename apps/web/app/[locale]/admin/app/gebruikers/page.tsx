import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { BellOff, Smartphone, UsersRound } from "lucide-react";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { currentStudyYear, currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import {
  appUserTotals,
  filterAppUsers,
  loadAppUsers,
  parsePopulation,
  parseStatus,
  type AppUserPopulation,
  type AppUserStatus,
} from "@/lib/app-users";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { formatNumber, formatPercent } from "@/components/ticketing/admin/format";
import { MemberSearch } from "../../(leden)/leden/MemberSearch";

/**
 * Admin › Website › App › Wie heeft de app: per persoon of die de app heeft,
 * op welk toestel en wanneer laatst geopend. Voor het praesidium (standaard: wie
 * moet ze zeker hebben), de leden van dit academiejaar, of elk account met de
 * app. De statistieken zelf blijven totalen; wat iemand in de app deed, staat
 * hier niet. Zie `lib/app-users.ts` en docs/app-gebruik.md.
 */
export default async function AdminAppUsers({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groep?: string; status?: string; zoek?: string }>;
}) {
  const [{ locale: localeParam }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("home.edit");
  await requirePermission("users.view");
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const t = (dutch: string, english: string) => (nl ? dutch : english);

  const now = new Date();
  const population = parsePopulation(filters.groep);
  // Elk account zonder de app is gewoon elk account op de site: die lijst zegt niets.
  const status: AppUserStatus = population === "alle" ? "met" : parseStatus(filters.status);
  const query = (filters.zoek ?? "").trim().slice(0, 100);

  const everyone = await loadAppUsers(population, locale, now);
  const totals = appUserTotals(everyone, now);
  const rows = filterAppUsers(everyone, status, query);

  const n = (value: number) => formatNumber(value, locale);
  const pct = (part: number, total: number) => (total > 0 ? formatPercent(part / total, locale) : "–");
  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const dayKey = (value: Date) => value.toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const lastOpened = (value: Date) => {
    const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(value))) / 86_400_000);
    if (days === 0) return t("vandaag", "today");
    if (days === 1) return t("gisteren", "yesterday");
    if (days < 7) return t(`${days} dagen geleden`, `${days} days ago`);
    return dateFmt.format(value);
  };

  const href = (next: { groep?: AppUserPopulation; status?: AppUserStatus }) => {
    const search = new URLSearchParams();
    const groep = next.groep ?? population;
    if (groep !== "praesidium") search.set("groep", groep);
    const nextStatus = next.status ?? (next.groep ? "alle" : status);
    if (nextStatus !== "alle" && groep !== "alle") search.set("status", nextStatus);
    if (query) search.set("zoek", query);
    const qs = search.toString();
    return `${base}/admin/app/gebruikers${qs ? `?${qs}` : ""}`;
  };

  const populations: Array<{ key: AppUserPopulation; label: string }> = [
    { key: "praesidium", label: t(`Praesidium ${formatWorkingYear(currentWorkingYear(now))}`, `Praesidium ${formatWorkingYear(currentWorkingYear(now))}`) },
    { key: "leden", label: t(`Leden ${formatWorkingYear(currentStudyYear(now))}`, `Members ${formatWorkingYear(currentStudyYear(now))}`) },
    { key: "alle", label: t("Elk account met de app", "Every account with the app") },
  ];
  const statuses: Array<{ key: AppUserStatus; label: string }> = [
    { key: "alle", label: t("Iedereen", "Everyone") },
    { key: "met", label: t("Met de app", "With the app") },
    { key: "zonder", label: t("Zonder de app", "Without the app") },
  ];
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm ${
      active ? "border-vtk-ink bg-vtk-ink text-vtk-surface" : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
    }`;
  const groupName = populations.find((entry) => entry.key === population)?.label ?? "";
  const showPosts = population === "praesidium";

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-zinc-500">
        {t(
          "Wie de VTK-app heeft en wie niet. De app hebben betekent hier: ooit ingelogd in de app. Wie de app installeerde maar nooit inlogde, is niet te herkennen en staat bij zonder de app. Wat iemand in de app doet, staat hier niet; dat blijft bij de totalen van de statistieken.",
          "Who has the VTK app and who does not. Having the app means here: signed in to the app at some point. Someone who installed it but never signed in cannot be recognised and is listed without the app. What someone does in the app is not shown here; that stays in the totals of the statistics.",
        )}
      </p>

      <nav className="flex flex-wrap gap-2" aria-label={t("Groep", "Group")}>
        {populations.map((option) => (
          <Link key={option.key} href={href({ groep: option.key })} aria-current={population === option.key ? "page" : undefined} className={chip(population === option.key)}>
            {option.label}
          </Link>
        ))}
      </nav>

      <div className="ticket-admin">
        <div className="ticket-admin-metrics" aria-label={t("Wie heeft de app", "Who has the app")}>
          {population === "alle" ? (
            <AdminMetric icon={UsersRound} label={t("Accounts met de app", "Accounts with the app")} value={n(totals.withApp)} />
          ) : (
            <AdminMetric
              icon={UsersRound}
              label={t("Heeft de app", "Has the app")}
              value={pct(totals.withApp, totals.total)}
              detail={t(`${n(totals.withApp)} van ${n(totals.total)}; ${n(totals.total - totals.withApp)} zonder`, `${n(totals.withApp)} of ${n(totals.total)}; ${n(totals.total - totals.withApp)} without`)}
              tone={totals.total > 0 && totals.withApp / totals.total >= 0.5 ? "success" : "default"}
            />
          )}
          <AdminMetric
            icon={Smartphone}
            label="iPhone / Android"
            value={`${n(totals.ios)} / ${n(totals.android)}`}
            detail={t("wie beide heeft, telt dubbel", "both counted twice")}
          />
          <AdminMetric
            icon={BellOff}
            label={t("Niet meer geopend", "Not opened lately")}
            value={n(totals.dormant)}
            detail={t("30 dagen niet geopend", "not opened in 30 days")}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MemberSearch
          key={population}
          initialQuery={query}
          placeholder={showPosts ? t("Zoek op naam, e-mail of post", "Search by name, email or post") : t("Zoek op naam, e-mail of r-nummer", "Search by name, email or r-number")}
          ariaLabel={t("Personen zoeken", "Search people")}
        />
        {population !== "alle" ? (
          <nav className="flex flex-wrap gap-2" aria-label={t("Met of zonder de app", "With or without the app")}>
            {statuses.map((option) => (
              <Link key={option.key} href={href({ status: option.key })} aria-current={status === option.key ? "page" : undefined} className={chip(status === option.key)}>
                {option.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <p className="text-sm text-zinc-500">
        {t(`${n(rows.length)} van ${n(everyone.length)} in ${groupName}.`, `${n(rows.length)} of ${n(everyone.length)} in ${groupName}.`)}
        {status === "alle" ? ` ${t("Wie de app niet heeft, staat bovenaan.", "Those without the app are listed first.")}` : null}
      </p>

      <div className="ticket-admin-table-wrap">
        <table className="ticket-admin-table vtk-appusers-table" data-compact>
          <thead>
            <tr>
              <th>{t("Naam", "Name")}</th>
              {showPosts ? <th>{t("Post", "Post")}</th> : null}
              <th>App</th>
              <th>{t("Laatst geopend", "Last opened")}</th>
              <th>{t("Meldingen", "Notifications")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <LinkedRow key={row.userId} href={`${base}/admin/gebruikers/${row.userId}`}>
                <td data-wrap="true" data-wide>
                  <Link href={`${base}/admin/gebruikers/${row.userId}`} className="font-medium text-vtk-ink">
                    {row.name}
                  </Link>
                  <span className="block text-xs text-[#5c667f]">{row.email}</span>
                </td>
                {showPosts ? <td data-wrap="true" data-wide data-label={t("Post", "Post")}>{row.posts.join(", ")}</td> : null}
                <td data-wrap="true" data-wide data-label="App">
                  {row.app ? (
                    <>
                      <strong>{row.app.platforms.map((platform) => (platform === "ios" ? "iPhone" : "Android")).join(" en ")}</strong>
                      <span className="block text-xs text-[#5c667f]">
                        {t("sinds", "since")} {dateFmt.format(row.app.firstSeenAt)}
                        {row.app.appVersion ? ` · ${t("versie", "version")} ${row.app.appVersion}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-[#5c667f]">{t("Geen app", "No app")}</span>
                  )}
                </td>
                <td data-label={t("Laatst geopend", "Last opened")}>{row.app ? lastOpened(row.app.lastSeenAt) : "–"}</td>
                <td data-label={t("Meldingen", "Notifications")}>{row.app ? (row.app.pushEnabled === null ? t("niet gevraagd", "not asked") : row.app.pushEnabled ? t("aan", "on") : t("uit", "off")) : "–"}</td>
              </LinkedRow>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showPosts ? 5 : 4} className="py-6 text-center text-[#5c667f]">
                  {query
                    ? t("Niemand die past bij deze zoekterm.", "Nobody matches this search.")
                    : status === "zonder"
                      ? t("Iedereen in deze groep heeft de app.", "Everyone in this group has the app.")
                      : status === "met"
                        ? t("Niemand in deze groep heeft de app.", "Nobody in this group has the app.")
                        : t("Deze groep is nog leeg.", "This group is still empty.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
