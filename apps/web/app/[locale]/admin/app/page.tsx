import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  Clock3,
  Download,
  Lightbulb,
  MonitorSmartphone,
  Repeat,
  ShoppingCart,
  Smartphone,
  Timer,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getAppLinks } from "@/lib/appLinks";
import { loadAppUsageStats, COHORT_WEEKS, type ChannelStats } from "@/lib/app-usage-stats";
import { screenLabel, tabLabel } from "@/lib/app-usage-labels";
import { currentWorkingYear, formatWorkingYear, workingYearStart } from "@/lib/workingYear";
import { SaveForm } from "@/components/ui/SaveForm";
import { DailyChart } from "@/components/admin/DailyChart";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { formatMoney, formatNumber, formatPercent } from "@/components/ticketing/admin/format";
import { saveAppLinksAction } from "./actions";

import "@/app/design/vtk-ticket-admin.css";

type Period = "7d" | "30d" | "90d" | "jaar" | "alles";

function periodFrom(raw: string | undefined): Period {
  return raw === "7d" || raw === "90d" || raw === "jaar" || raw === "alles" ? raw : "30d";
}

function SectionHead({ id, icon: Icon, title, intro }: { id: string; icon: LucideIcon; title: string; intro?: string }) {
  return (
    <div className="ticket-admin-section-head">
      <div className="ticket-admin-section-heading">
        <span className="ticket-admin-section-icon">
          <Icon aria-hidden="true" size={17} />
        </span>
        <div>
          <h2 id={id}>{title}</h2>
          {intro ? <p>{intro}</p> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Admin › Website › App: hoe de VTK-app gebruikt wordt, en de links naar de app
 * in de winkels.
 *
 * De statistieken beantwoorden de vraag of de app een succes is: hoeveel mensen
 * hebben ze, openen ze ze ook, komen ze terug, wat doen ze erin, en hoeveel van
 * wat er besteld wordt, komt uit de app in plaats van van de website. Wat
 * gemeten wordt en hoe, staat in docs/app-gebruik.md; het rekenwerk in
 * `lib/app-usage-stats.ts`.
 *
 * De links: `vtk.be/app` leest ze; de QR-code op de affiches wijst naar dat
 * adres en blijft dus dezelfde, wat er hier ook verandert.
 */
export default async function AdminApp({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ periode?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("home.edit");
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const t = (dutch: string, english: string) => (nl ? dutch : english);

  const period = periodFrom((await searchParams).periode);
  const now = new Date();
  const year = currentWorkingYear(now);
  const from =
    period === "7d"
      ? new Date(now.getTime() - 7 * 86_400_000)
      : period === "30d"
        ? new Date(now.getTime() - 30 * 86_400_000)
        : period === "90d"
          ? new Date(now.getTime() - 90 * 86_400_000)
          : period === "jaar"
            ? workingYearStart(year)
            : null;
  const [links, stats] = await Promise.all([getAppLinks(), loadAppUsageStats({ from, to: now }, now)]);

  const periods: Array<{ key: Period; label: string }> = [
    { key: "7d", label: t("Laatste 7 dagen", "Last 7 days") },
    { key: "30d", label: t("Laatste 30 dagen", "Last 30 days") },
    { key: "90d", label: t("Laatste 90 dagen", "Last 90 days") },
    { key: "jaar", label: t(`Werkingsjaar ${formatWorkingYear(year)}`, `Working year ${formatWorkingYear(year)}`) },
    { key: "alles", label: t("Alles", "All time") },
  ];

  const n = (value: number) => formatNumber(value, locale);
  const n1 = (value: number | null) => (value === null ? "–" : formatNumber(Math.round(value * 10) / 10, locale));
  const pct = (value: number | null) => (value === null ? "–" : formatPercent(value, locale));
  const ratio = (part: number, total: number) => (total > 0 ? part / total : null);
  const money = (cents: number | null) => (cents === null ? "–" : formatMoney(Math.round(cents), "EUR", locale));
  const seconds = (value: number | null) => {
    if (value === null) return "–";
    const total = Math.round(value);
    if (total < 60) return `${total} s`;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    if (minutes < 60) return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
    return `${Math.floor(minutes / 60)} ${t("u", "h")} ${minutes % 60} min`;
  };
  const day = (value: Date) =>
    value.toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" });
  const weekdayName = (index: number) =>
    new Date(Date.UTC(2026, 0, 5 + index, 12)).toLocaleDateString(nl ? "nl-BE" : "en-GB", { weekday: "long", timeZone: "UTC" });
  const chartLabels = { table: t("Toon als tabel", "Show as table"), day: t("Dag", "Day"), total: t("Totaal", "Total") };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">App</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          {t(
            "Hoe de VTK-app gebruikt wordt: hoeveel mensen ze hebben, hoe vaak ze ze openen, of ze terugkomen, wat ze erin doen en hoeveel er via de app besteld wordt in plaats van via de website. Onderaan staan de links naar de app in de winkels.",
            "How the VTK app is used: how many people have it, how often they open it, whether they come back, what they do in it and how much is ordered through the app instead of the website. The store links are at the bottom.",
          )}
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label={t("Periode", "Period")}>
        {periods.map((option) => (
          <Link
            key={option.key}
            href={`${base}/admin/app${option.key === "30d" ? "" : `?periode=${option.key}`}`}
            aria-current={period === option.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              period === option.key
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {stats ? (
        <div className="ticket-admin space-y-5">{statsBody(stats)}</div>
      ) : (
        <p className="ticket-admin-help">
          {t(
            "Nog geen gegevens. De app meldt haar gebruik sinds de update van 24 november 2026; zodra iemand die update opent, verschijnen hier de eerste cijfers.",
            "No data yet. The app reports its use since the update of 24 November 2026; as soon as someone opens that update, the first figures appear here.",
          )}
        </p>
      )}

      <section className="max-w-2xl space-y-3" aria-labelledby="app-links">
        <div>
          <h2 id="app-links" className="text-lg font-semibold">
            {t("Links naar de winkels", "Store links")}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t(
              "Waar de VTK-app te downloaden is. vtk.be/app stuurt een iPhone naar de App Store en een Android-toestel naar Google Play; een computer krijgt een pagina met beide knoppen. Zet dat adres in een QR-code op een affiche: het blijft geldig, ook als de links hier veranderen.",
              "Where to download the VTK app. vtk.be/app sends an iPhone to the App Store and an Android device to Google Play; a computer gets a page with both buttons. Put that address in a QR code on a poster: it stays valid, even when the links here change.",
            )}
          </p>
        </div>

        <SaveForm
          action={saveAppLinksAction}
          submitLabel={t("Opslaan", "Save")}
          savingLabel={t("Bezig met opslaan", "Saving")}
          savedMessage={t("De links zijn opgeslagen.", "The links are saved.")}
          errorMessages={{
            INVALID_LINK: t(
              "Een link moet een volledig adres zijn dat met https:// begint.",
              "A link has to be a full address starting with https://.",
            ),
          }}
          fallbackErrorMessage={t("Opslaan lukte niet.", "Saving failed.")}
          resetOnSuccess={false}
          className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5"
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">App Store (iPhone)</span>
            <input
              name="ios"
              type="url"
              inputMode="url"
              defaultValue={links.ios ?? ""}
              placeholder="https://apps.apple.com/be/app/vtk-leuven/id..."
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Google Play (Android)</span>
            <input
              name="android"
              type="url"
              inputMode="url"
              defaultValue={links.android ?? ""}
              placeholder="https://play.google.com/store/apps/details?id=..."
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <p className="text-sm text-zinc-500">
            {t("Leeg laten mag: dan toont vtk.be/app enkel de andere winkel.", "You can leave one empty: vtk.be/app then only shows the other store.")}
          </p>
        </SaveForm>

        <p className="text-sm">
          <a href={`/${locale === "en" ? "en/" : ""}app?toon=1`} className="underline">
            {t("Bekijk vtk.be/app zoals een computer hem ziet", "Preview vtk.be/app as a computer sees it")}
          </a>
        </p>
      </section>
    </div>
  );

  function statsBody(s: NonNullable<Awaited<ReturnType<typeof loadAppUsageStats>>>) {
    const weekly = s.unit === "week";
    const keyFormat = weekly ? "week" : "day";
    const perLabel = weekly ? t("per week", "per week") : t("per dag", "per day");
    const seriesLabels = { ...chartLabels, day: weekly ? t("Week", "Week") : chartLabels.day };
    const measuredLater = from === null || s.measuringSince > from;
    const channelName: Record<ChannelStats["key"], string> = {
      tickets: t("Tickets (betaalde bestellingen)", "Tickets (paid orders)"),
      theokot: t("Broodjes (bestellingen)", "Sandwiches (orders)"),
      shiften: t("Shiften (inschrijvingen)", "Shifts (sign-ups)"),
      piano: t("Piano (reservaties)", "Piano (reservations)"),
    };

    // ---- Opvallend: zinnen die uit de cijfers volgen
    const insights: string[] = [];
    if (s.activity.memberShare !== null && s.activity.membersActive30 >= 10) {
      insights.push(
        t(
          `${pct(s.activity.memberShare)} van de leden die de afgelopen 30 dagen ingelogd waren, gebruikte de app (${n(s.activity.members30)} van ${n(s.activity.membersActive30)}).`,
          `${pct(s.activity.memberShare)} of members who were signed in over the last 30 days used the app (${n(s.activity.members30)} of ${n(s.activity.membersActive30)}).`,
        ),
      );
    }
    if (s.activity.stickiness !== null && s.activity.mau >= 5) {
      insights.push(
        t(
          `Op een gemiddelde dag opent ${pct(s.activity.stickiness)} van de maandelijkse gebruikers de app. Boven 20% geldt een app als dagelijkse gewoonte.`,
          `On an average day ${pct(s.activity.stickiness)} of monthly users open the app. Above 20% an app counts as a daily habit.`,
        ),
      );
    }
    if (s.retention.day7.eligible >= 5) {
      insights.push(
        t(
          `${pct(ratio(s.retention.day7.back, s.retention.day7.eligible))} van wie de app in deze periode installeerde, opende ze een week later nog; na een maand ${pct(ratio(s.retention.day30.back, s.retention.day30.eligible))}.`,
          `${pct(ratio(s.retention.day7.back, s.retention.day7.eligible))} of those who installed the app in this period still opened it a week later; after a month ${pct(ratio(s.retention.day30.back, s.retention.day30.eligible))}.`,
        ),
      );
    }
    for (const channel of s.channels) {
      if (channel.total >= 10 && (channel.key === "tickets" || channel.key === "theokot")) {
        insights.push(
          t(
            `${pct(ratio(channel.app, channel.total))} van de ${channel.key === "tickets" ? "ticketbestellingen" : "broodjesbestellingen"} kwam uit de app.`,
            `${pct(ratio(channel.app, channel.total))} of ${channel.key === "tickets" ? "ticket orders" : "sandwich orders"} came from the app.`,
          ),
        );
      }
    }
    if (s.sessions.count >= 20) {
      const peak = s.hours.indexOf(Math.max(...s.hours));
      const peakDay = s.weekdays.indexOf(Math.max(...s.weekdays));
      insights.push(
        t(
          `De app wordt het vaakst geopend tussen ${peak}u en ${peak + 1}u, en op ${weekdayName(peakDay)}.`,
          `The app is opened most between ${peak}:00 and ${peak + 1}:00, and on ${weekdayName(peakDay)}.`,
        ),
      );
    }
    const topScreen = s.screens.find((row) => !["home", "kalender", "studies", "tickets", "meer"].includes(row.screen));
    if (topScreen && topScreen.views >= 10) {
      insights.push(
        t(
          `Na de tabs zelf is ${screenLabel(topScreen.screen)} het meest geopende scherm: ${n(topScreen.views)} keer, door ${n(topScreen.installs)} toestellen.`,
          `After the tabs themselves, ${screenLabel(topScreen.screen)} is the most opened screen: ${n(topScreen.views)} times, by ${n(topScreen.installs)} devices.`,
        ),
      );
    }

    const freqTotal = s.frequency.total;
    const frequencyRows = [
      { label: t("1 sessie", "1 session"), value: s.frequency.once },
      { label: t("2 tot 4 sessies", "2 to 4 sessions"), value: s.frequency.few },
      { label: t("5 tot 19 sessies", "5 to 19 sessions"), value: s.frequency.regular },
      { label: t("20 of meer", "20 or more"), value: s.frequency.heavy },
    ];
    const maxScreenViews = Math.max(1, ...s.screens.map((row) => row.views));
    const maxTabViews = Math.max(1, ...s.tabs.map((row) => row.views));
    const activeTotal = Math.max(1, s.installs.active30);

    return (
      <>
        {measuredLater ? (
          <p className="ticket-admin-help">
            {t(`Gemeten sinds ${day(s.measuringSince)}.`, `Measured since ${day(s.measuringSince)}.`)}{" "}
            {t(
              "Wat de app vóór die dag deed, is niet bekend; de periode begint daar.",
              "What the app did before that day is unknown; the period starts there.",
            )}
          </p>
        ) : null}

        <div className="ticket-admin-metrics" aria-label={t("Wie heeft de app", "Who has the app")}>
          <AdminMetric
            icon={Smartphone}
            label={t("Installaties", "Installs")}
            value={n(s.installs.total)}
            detail={`iPhone ${n(s.installs.ios)} · Android ${n(s.installs.android)}`}
          />
          <AdminMetric
            icon={Activity}
            label={t("Actief, laatste 30 dagen", "Active, last 30 days")}
            value={n(s.activity.mau)}
            detail={`${pct(ratio(s.installs.active30, s.installs.total))} ${t("van alle installaties", "of all installs")} · ${n(s.installs.dormant)} ${t("slapend", "dormant")}`}
          />
          <AdminMetric
            icon={CalendarDays}
            label={t("Vandaag actief", "Active today")}
            value={n(s.activity.dau)}
            detail={`${n(s.activity.wau)} ${t("deze week", "this week")} · ${t("gem.", "avg.")} ${n1(s.activity.avgDau30)} ${t("per dag", "per day")}`}
          />
          <AdminMetric
            icon={UsersRound}
            label={t("Leden met de app", "Members with the app")}
            value={n(s.installs.members)}
            detail={
              s.activity.memberShare !== null
                ? `${pct(s.activity.memberShare)} ${t("van wie de laatste 30 dagen inlogde", "of those who signed in over the last 30 days")}`
                : `${pct(ratio(s.installs.signedIn, s.installs.total))} ${t("van de installaties is ingelogd", "of installs are signed in")}`
            }
            tone={s.activity.memberShare !== null && s.activity.memberShare >= 0.5 ? "success" : "default"}
          />
        </div>

        <div className="ticket-admin-metrics" aria-label={t("In deze periode", "In this period")}>
          <AdminMetric
            icon={Download}
            label={t("Nieuwe installaties", "New installs")}
            value={n(s.installs.newInPeriod)}
            detail={`iPhone ${n(s.installs.newIos)} · Android ${n(s.installs.newAndroid)}`}
          />
          <AdminMetric
            icon={BarChart3}
            label={t("Sessies", "Sessions")}
            value={n(s.sessions.count)}
            detail={`${n1(s.sessions.perInstall)} ${t("per actief toestel", "per active device")} · ${n(s.sessions.members)} ${t("leden", "members")}`}
          />
          <AdminMetric
            icon={Timer}
            label={t("Duur van een sessie", "Session length")}
            value={seconds(s.sessions.medianSeconds)}
            detail={`${t("mediaan; gemiddeld", "median; average")} ${seconds(s.sessions.avgSeconds)} · ${n1(s.sessions.avgScreens)} ${t("schermen", "screens")}`}
          />
          <AdminMetric
            icon={Repeat}
            label={t("Komt terug", "Comes back")}
            value={pct(ratio(s.frequency.multiDay, s.frequency.total))}
            detail={t("van de actieve toestellen opende de app op 2 of meer dagen", "of active devices opened the app on 2 or more days")}
            tone={(ratio(s.frequency.multiDay, s.frequency.total) ?? 0) >= 0.5 ? "success" : "default"}
          />
        </div>

        {insights.length > 0 ? (
          <section className="ticket-admin-section" aria-labelledby="app-insights">
            <SectionHead id="app-insights" icon={Lightbulb} title={t("Opvallend", "Worth noting")} />
            <ul className="grid gap-2 text-sm text-[#34405e]">
              {insights.map((insight) => (
                <li key={insight} className="border-l-2 border-vtk-yellow pl-3">
                  {insight}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="ticket-admin-grid" data-columns="2">
          <section className="ticket-admin-section" aria-labelledby="app-active">
            <SectionHead
              id="app-active"
              icon={Activity}
              title={t(`Actieve gebruikers ${perLabel}`, `Active users ${perLabel}`)}
              intro={t(
                "Toestellen die de app openden, en hoeveel daarvan ingelogd waren als lid.",
                "Devices that opened the app, and how many of them were signed in as a member.",
              )}
            />
            <DailyChart
              kind="lines"
              days={s.keys}
              keyFormat={keyFormat}
              series={[
                { key: "installs", label: t("Toestellen", "Devices"), color: "var(--chart-1)", values: s.series.active.installs },
                { key: "members", label: t("Leden", "Members"), color: "var(--chart-3)", values: s.series.active.members },
              ]}
              locale={locale}
              title={t("Actieve gebruikers", "Active users")}
              labels={seriesLabels}
            />
          </section>
          <section className="ticket-admin-section" aria-labelledby="app-sessions">
            <SectionHead
              id="app-sessions"
              icon={BarChart3}
              title={t(`Sessies ${perLabel}`, `Sessions ${perLabel}`)}
              intro={t(
                "Een sessie is gebruik zonder pauze van een halfuur. Daarnaast: het aantal minuten dat de app open stond.",
                "A session is use without a break of half an hour. Next to it: the minutes the app was open.",
              )}
            />
            <DailyChart
              kind="bars"
              days={s.keys}
              keyFormat={keyFormat}
              series={[{ key: "sessions", label: t("Sessies", "Sessions"), color: "var(--chart-1)", values: s.series.active.sessions }]}
              locale={locale}
              title={t("Sessies", "Sessions")}
              labels={seriesLabels}
            />
            <DailyChart
              kind="bars"
              days={s.keys}
              keyFormat={keyFormat}
              series={[{ key: "minutes", label: t("Minuten in de app", "Minutes in the app"), color: "var(--chart-2)", values: s.series.active.minutes }]}
              locale={locale}
              title={t("Minuten in de app", "Minutes in the app")}
              labels={seriesLabels}
            />
          </section>
        </div>

        <div className="ticket-admin-grid" data-columns="2">
          <section className="ticket-admin-section" aria-labelledby="app-new">
            <SectionHead
              id="app-new"
              icon={Download}
              title={t(`Nieuwe installaties ${perLabel}`, `New installs ${perLabel}`)}
              intro={t(
                "Een installatie telt vanaf de eerste keer dat de app opent. Een herinstallatie is een nieuwe.",
                "An install counts from the first time the app opens. A reinstall counts as a new one.",
              )}
            />
            <DailyChart
              kind="bars"
              days={s.keys}
              keyFormat={keyFormat}
              series={[
                { key: "ios", label: "iPhone", color: "var(--chart-1)", values: s.series.installs.ios },
                { key: "android", label: "Android", color: "var(--chart-3)", values: s.series.installs.android },
              ]}
              locale={locale}
              title={t("Nieuwe installaties", "New installs")}
              labels={seriesLabels}
            />
          </section>
          <section className="ticket-admin-section" aria-labelledby="app-total">
            <SectionHead
              id="app-total"
              icon={Smartphone}
              title={t("Installaties in totaal", "Installs in total")}
              intro={t("Alle installaties tot en met die dag.", "All installs up to and including that day.")}
            />
            <DailyChart
              kind="lines"
              days={s.keys}
              keyFormat={keyFormat}
              series={[{ key: "total", label: t("Installaties", "Installs"), color: "var(--chart-1)", values: s.series.cumulative }]}
              locale={locale}
              title={t("Installaties in totaal", "Installs in total")}
              labels={seriesLabels}
            />
          </section>
        </div>

        <section className="ticket-admin-section" aria-labelledby="app-retention">
          <SectionHead
            id="app-retention"
            icon={Repeat}
            title={t("Terugkomen", "Coming back")}
            intro={t(
              "Blijven mensen de app gebruiken nadat ze ze installeerden? Bovenaan: van de installaties uit deze periode, wie de app een dag, een week of een maand later nog opende. Wie nog geen week geleden installeerde, telt voor de week niet mee.",
              "Do people keep using the app after installing it? At the top: of the installs from this period, who still opened the app a day, a week or a month later. Someone who installed less than a week ago does not count for the week.",
            )}
          />
          <div className="ticket-admin-metrics">
            <AdminMetric
              icon={Repeat}
              label={t("Na een dag", "After a day")}
              value={pct(ratio(s.retention.day1.back, s.retention.day1.eligible))}
              detail={`${n(s.retention.day1.back)} ${t("van", "of")} ${n(s.retention.day1.eligible)}`}
            />
            <AdminMetric
              icon={Repeat}
              label={t("Na een week", "After a week")}
              value={pct(ratio(s.retention.day7.back, s.retention.day7.eligible))}
              detail={`${n(s.retention.day7.back)} ${t("van", "of")} ${n(s.retention.day7.eligible)}`}
            />
            <AdminMetric
              icon={Repeat}
              label={t("Na een maand", "After a month")}
              value={pct(ratio(s.retention.day30.back, s.retention.day30.eligible))}
              detail={`${n(s.retention.day30.back)} ${t("van", "of")} ${n(s.retention.day30.eligible)}`}
            />
            <AdminMetric
              icon={Repeat}
              label={t("Meer dan één keer", "More than once")}
              value={pct(ratio(s.retention.twoSessions, s.retention.total))}
              detail={t("van de nieuwe installaties had 2 of meer sessies", "of new installs had 2 or more sessions")}
            />
          </div>

          <div className="ticket-admin-grid" data-columns="2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("Hoe vaak, per toestel in deze periode", "How often, per device in this period")}</h3>
              <div className="ticket-admin-table-wrap">
                <table className="ticket-admin-table ticket-stats-table" data-compact>
                  <thead>
                    <tr>
                      <th>{t("Sessies", "Sessions")}</th>
                      <th data-num>{t("Toestellen", "Devices")}</th>
                      <th data-num>{t("Aandeel", "Share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frequencyRows.map((row) => (
                      <tr key={row.label}>
                        <td data-wrap="true">
                          <span className="ticket-stats-bar-label">
                            <strong>{row.label}</strong>
                            <span className="ticket-stats-bar" style={{ width: `${Math.round((ratio(row.value, freqTotal) ?? 0) * 100)}%` }} aria-hidden="true" />
                          </span>
                        </td>
                        <td data-num>{n(row.value)}</td>
                        <td data-num>{pct(ratio(row.value, freqTotal))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ticket-admin-help mt-2">
                {t(
                  `Gemiddeld ${n1(s.frequency.avgSessions)} sessies op ${n1(s.frequency.avgDays)} verschillende dagen. ${n(s.frequency.sevenDays)} toestellen openden de app op 7 of meer dagen.`,
                  `On average ${n1(s.frequency.avgSessions)} sessions on ${n1(s.frequency.avgDays)} different days. ${n(s.frequency.sevenDays)} devices opened the app on 7 or more days.`,
                )}
              </p>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("Per installatieweek", "Per install week")}</h3>
              {s.cohorts.length === 0 ? (
                <p className="ticket-admin-help">{t("Nog geen installaties in de laatste weken.", "No installs in recent weeks yet.")}</p>
              ) : (
                <div className="ticket-admin-table-wrap">
                  <table className="ticket-admin-table" data-compact>
                    <thead>
                      <tr>
                        <th>{t("Week van", "Week of")}</th>
                        <th data-num>{t("Nieuw", "New")}</th>
                        {Array.from({ length: COHORT_WEEKS }, (_, week) => (
                          <th key={week} data-num>
                            {week === 0 ? t("W0", "W0") : `+${week}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.cohorts.map((row) => (
                        <tr key={row.week}>
                          <td>
                            {new Date(`${row.week}T12:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", {
                              day: "numeric",
                              month: "short",
                              timeZone: "UTC",
                            })}
                          </td>
                          <td data-num>{n(row.size)}</td>
                          {row.shares.map((value, week) => (
                            <td
                              key={week}
                              data-num
                              style={
                                value === null
                                  ? undefined
                                  : {
                                      background: `color-mix(in srgb, var(--chart-1) ${Math.round(value * 80)}%, var(--surface))`,
                                      color: value > 0.55 ? "#fff" : undefined,
                                    }
                              }
                            >
                              {value === null ? "" : pct(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="ticket-admin-help mt-2">
                {t(
                  "Elke rij is een week waarin mensen de app installeerden; elke kolom het deel daarvan dat de app die zoveelste week erna nog opende.",
                  "Each row is a week in which people installed the app; each column the share of them that still opened it that many weeks later.",
                )}
              </p>
            </div>
          </div>
        </section>

        <section className="ticket-admin-section" aria-labelledby="app-channels">
          <SectionHead
            id="app-channels"
            icon={ShoppingCart}
            title={t("App of website", "App or website")}
            intro={t(
              "Wat er in deze periode besteld of gereserveerd werd, en welk deel daarvan uit de app kwam. De rest kwam via de website.",
              "What was ordered or booked in this period, and which share of it came from the app. The rest came through the website.",
            )}
          />
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-stats-table" data-compact>
              <thead>
                <tr>
                  <th>{t("Wat", "What")}</th>
                  <th data-num>{t("Totaal", "Total")}</th>
                  <th data-num>{t("Via de app", "Via the app")}</th>
                  <th data-num>{t("Via de website", "Via the website")}</th>
                  <th data-num>{t("Aandeel app", "App share")}</th>
                  <th data-num>{t("Bedrag via de app", "Amount via the app")}</th>
                </tr>
              </thead>
              <tbody>
                {s.channels.map((channel) => (
                  <tr key={channel.key}>
                    <td data-wrap="true">
                      <span className="ticket-stats-bar-label">
                        <strong>{channelName[channel.key]}</strong>
                        <span
                          className="ticket-stats-bar"
                          style={{ width: `${Math.round((ratio(channel.app, channel.total) ?? 0) * 100)}%` }}
                          aria-hidden="true"
                        />
                      </span>
                    </td>
                    <td data-num>{n(channel.total)}</td>
                    <td data-num>{n(channel.app)}</td>
                    <td data-num>{n(channel.total - channel.app)}</td>
                    <td data-num>{pct(ratio(channel.app, channel.total))}</td>
                    <td data-num>
                      {channel.appCents === null ? "–" : `${money(channel.appCents)} / ${money(channel.totalCents)}`}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td data-wrap="true">
                    <strong>{t("Cursusdienst (reservaties)", "Course service (reservations)")}</strong>
                  </td>
                  <td data-num>–</td>
                  <td data-num>{n(s.actions.cudi.count)}</td>
                  <td data-num>–</td>
                  <td data-num>–</td>
                  <td data-num>–</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="ticket-admin-help mt-2">
            {t(
              `${n(s.actions.orderingMembers)} leden bestelden of reserveerden iets via de app. De cursusdienst houdt haar bestellingen zelf bij op cudi.vtk.be, dus daar staat enkel wat uit de app kwam. Tickets tellen als app-bestelling vanaf de update van 24 november 2026; ervoor stonden ze onder "VTK-app" of "niet gemeten" in de ticketstatistieken.`,
              `${n(s.actions.orderingMembers)} members ordered or booked something through the app. The course service keeps its own orders on cudi.vtk.be, so only what came from the app is shown. Tickets count as app orders since the update of 24 November 2026.`,
            )}
          </p>
          <DailyChart
            kind="lines"
            days={s.keys}
            keyFormat={keyFormat}
            series={[
              { key: "tickets", label: t("Tickets, % via de app", "Tickets, % via the app"), color: "var(--chart-1)", values: s.series.appShare.tickets },
              { key: "theokot", label: t("Broodjes, % via de app", "Sandwiches, % via the app"), color: "var(--chart-2)", values: s.series.appShare.theokot },
            ]}
            locale={locale}
            title={t("Aandeel van de app in de bestellingen", "App share of orders")}
            labels={seriesLabels}
          />
        </section>

        <div className="ticket-admin-grid" data-columns="2">
          <section className="ticket-admin-section" aria-labelledby="app-hours">
            <SectionHead
              id="app-hours"
              icon={Clock3}
              title={t("Per uur van de dag", "Per hour of day")}
              intro={t("Wanneer een sessie begint, in Brusselse tijd.", "When a session starts, in Brussels time.")}
            />
            <DailyChart
              kind="bars"
              days={Array.from({ length: 24 }, (_, hour) => String(hour))}
              keyFormat="hour"
              series={[{ key: "sessions", label: t("Sessies", "Sessions"), color: "var(--chart-1)", values: s.hours }]}
              locale={locale}
              title={t("Sessies per uur", "Sessions per hour")}
              labels={{ ...chartLabels, day: t("Uur", "Hour") }}
            />
          </section>
          <section className="ticket-admin-section" aria-labelledby="app-weekdays">
            <SectionHead id="app-weekdays" icon={CalendarDays} title={t("Per weekdag", "Per weekday")} />
            <DailyChart
              kind="bars"
              days={["1", "2", "3", "4", "5", "6", "7"]}
              keyFormat="weekday"
              series={[{ key: "sessions", label: t("Sessies", "Sessions"), color: "var(--chart-1)", values: s.weekdays }]}
              locale={locale}
              title={t("Sessies per weekdag", "Sessions per weekday")}
              labels={{ ...chartLabels, day: t("Weekdag", "Weekday") }}
            />
          </section>
        </div>

        <section className="ticket-admin-section" aria-labelledby="app-screens">
          <SectionHead
            id="app-screens"
            icon={MonitorSmartphone}
            title={t("Wat mensen openen", "What people open")}
            intro={t(
              "Per scherm hoe vaak het geopend werd en door hoeveel toestellen. Een tabblad binnen een scherm (Planning, Evenementen, Cursusdienst) telt apart.",
              "Per screen how often it was opened and by how many devices. A tab within a screen (Planning, Events, Course service) counts separately.",
            )}
          />
          <div className="ticket-admin-grid" data-columns="2">
            <div className="ticket-admin-table-wrap">
              <table className="ticket-admin-table ticket-stats-table" data-compact>
                <thead>
                  <tr>
                    <th>{t("Scherm", "Screen")}</th>
                    <th data-num>{t("Geopend", "Opened")}</th>
                    <th data-num>{t("Toestellen", "Devices")}</th>
                    <th data-num>{t("Van de actieve", "Of active")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.screens.map((row) => (
                    <tr key={`${row.screen}:${row.tab}`}>
                      <td data-wrap="true">
                        <span className="ticket-stats-bar-label">
                          <strong>
                            {screenLabel(row.screen)}
                            {row.tab && !["home", "kalender", "studies", "tickets", "meer"].includes(row.screen) && !row.screen.includes(":") ? (
                              <span className="ml-2 text-xs font-medium text-[#5c667f]">{tabLabel(row.tab)}</span>
                            ) : null}
                          </strong>
                          <span className="ticket-stats-bar" style={{ width: `${Math.round((row.views / maxScreenViews) * 100)}%` }} aria-hidden="true" />
                        </span>
                      </td>
                      <td data-num>{n(row.views)}</td>
                      <td data-num>{n(row.installs)}</td>
                      <td data-num>{pct(Math.min(1, row.installs / activeTotal))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ticket-admin-table-wrap self-start">
              <table className="ticket-admin-table ticket-stats-table" data-compact>
                <thead>
                  <tr>
                    <th>{t("Tab", "Tab")}</th>
                    <th data-num>{t("Schermen geopend", "Screens opened")}</th>
                    <th data-num>{t("Toestellen", "Devices")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.tabs.map((row) => (
                    <tr key={row.tab}>
                      <td data-wrap="true">
                        <span className="ticket-stats-bar-label">
                          <strong>{tabLabel(row.tab)}</strong>
                          <span className="ticket-stats-bar" style={{ width: `${Math.round((row.views / maxTabViews) * 100)}%` }} aria-hidden="true" />
                        </span>
                      </td>
                      <td data-num>{n(row.views)}</td>
                      <td data-num>{n(row.installs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="ticket-admin-section" aria-labelledby="app-devices">
          <SectionHead
            id="app-devices"
            icon={Smartphone}
            title={t("Toestellen en versies", "Devices and versions")}
            intro={t(
              "Van de toestellen die de app de laatste 30 dagen openden. De update is het begin van de id van de EAS Update die draait; leeg is de versie uit de build zelf.",
              "Of the devices that opened the app in the last 30 days. The update is the start of the id of the running EAS Update; empty is the version from the build itself.",
            )}
          />
          <div className="ticket-admin-metrics">
            <AdminMetric
              icon={Bell}
              label={t("Meldingen aan", "Notifications on")}
              value={pct(ratio(s.installs.pushOn, s.installs.pushAsked))}
              detail={`${n(s.installs.pushOn)} ${t("van", "of")} ${n(s.installs.pushAsked)} ${t("die het gevraagd werden", "who were asked")} · ${n(s.pushDevices)} ${t("pushtokens", "push tokens")}`}
            />
            <AdminMetric
              icon={Bell}
              label={t("Pushberichten geopend", "Push messages opened")}
              value={n(s.actions.pushOpen.count)}
              detail={t("tikken op een melding in deze periode", "taps on a notification in this period")}
            />
            <AdminMetric
              icon={Smartphone}
              label="iPhone / Android"
              value={`${pct(ratio(s.installs.ios, s.installs.total))} / ${pct(ratio(s.installs.android, s.installs.total))}`}
              detail={`${n(s.installs.expoGo)} ${t("in Expo Go", "in Expo Go")} · ${n(s.installs.english)} ${t("in het Engels", "in English")}`}
            />
          </div>
          <div className="ticket-admin-grid" data-columns="2">
            <div className="ticket-admin-table-wrap self-start">
              <table className="ticket-admin-table" data-compact>
                <thead>
                  <tr>
                    <th>{t("Versie", "Version")}</th>
                    <th>{t("Kanaal", "Channel")}</th>
                    <th>Update</th>
                    <th data-num>{t("Toestellen", "Devices")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.versions.map((row) => (
                    <tr key={`${row.version}:${row.channel}:${row.update}`}>
                      <td>{row.version ?? "?"}</td>
                      <td>{row.channel ?? "–"}</td>
                      <td>
                        <code>{row.update ?? t("build", "build")}</code>
                      </td>
                      <td data-num>{n(row.installs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 self-start">
              <div className="ticket-admin-table-wrap">
                <table className="ticket-admin-table" data-compact>
                  <thead>
                    <tr>
                      <th>{t("Besturingssysteem", "Operating system")}</th>
                      <th data-num>{t("Toestellen", "Devices")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.systems.map((row) => (
                      <tr key={`${row.platform}:${row.os}`}>
                        <td>
                          {row.platform === "ios" ? "iOS" : "Android"} {row.os}
                        </td>
                        <td data-num>{n(row.installs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {s.models.length > 0 ? (
                <div className="ticket-admin-table-wrap">
                  <table className="ticket-admin-table" data-compact>
                    <thead>
                      <tr>
                        <th>{t("Android-toestel", "Android device")}</th>
                        <th data-num>{t("Toestellen", "Devices")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.models.map((row) => (
                        <tr key={row.model}>
                          <td>{row.model}</td>
                          <td data-num>{n(row.installs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </>
    );
  }
}
