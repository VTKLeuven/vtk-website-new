import type { ReactNode } from "react";
import { Card } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { DailyChart, type ChartSeries } from "@/components/admin/DailyChart";
import { RECENT_DAYS, formatShare, type CareerStats, type SegmentRow } from "@/lib/careerStats";
import { STUDY_PROGRAMMES, STUDY_YEARS } from "@/lib/profile";
import { formatWorkingYear, studyConfirmationStart } from "@/lib/workingYear";

type Dict = ReturnType<typeof getDictionary>;

/** Eén regel in een uitsplitsing: label links, getal rechts. */
function Row({
  label,
  hint,
  value,
  share,
  kind = "plain",
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  share?: string;
  /**
   * `minus`: een deel dat eraf gaat; `result`: wat overblijft; `sub` en `subsub`:
   * een deel van de regel erboven, zonder dat het eraf gaat.
   */
  kind?: "plain" | "minus" | "result" | "sub" | "subsub";
}) {
  const strong = kind === "result";
  const indent = kind === "subsub" ? "pl-8" : kind === "minus" || kind === "sub" ? "pl-4" : "";
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${indent}`}>
      <dt className={`text-sm ${strong ? "font-medium text-vtk-ink" : "text-[#34405e]"}`}>
        {label}
        {hint ? <span className="block text-xs text-[#5c667f]">{hint}</span> : null}
      </dt>
      <dd
        className={`shrink-0 text-sm tabular-nums ${strong ? "font-semibold text-vtk-ink" : "font-medium text-vtk-ink"}`}
      >
        {kind === "minus" ? `−${value}` : value}
        {share ? (
          <span className="ml-2 inline-flex items-center rounded-full bg-vtk-blue/10 px-2 py-0.5 text-xs font-medium text-vtk-ink">
            {share}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-4 divide-y divide-vtk-blue/10 border-y border-vtk-blue/10">{children}</dl>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 text-xs font-medium uppercase tracking-wide text-[#5c667f]">{children}</p>
  );
}

function CardHead({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <>
      <h3 className="font-medium text-vtk-ink">{title}</h3>
      {intro ? <p className="mt-1 max-w-2xl text-sm text-[#5c667f]">{intro}</p> : null}
    </>
  );
}

/**
 * De Career-cijfers op /admin/mailinglijsten, in de volgorde van de vragen die
 * het bestuur erover stelt: wie staat erop (en waarom de rest niet), hoeveel
 * van onze studenten bereiken we, welk scherm vult de lijst, en hoe loopt de
 * bevestigingsronde met de Career-vraag erop. Elke uitsplitsing sluit: de
 * delen tellen op tot het getal erboven, zodat geen enkel getal onverklaard
 * naast een ander staat.
 */
export function CareerStatsSection({ stats, locale }: { stats: CareerStats; locale: Locale }) {
  const dict: Dict = getDictionary(locale);
  const t = dict.mailinglists;
  const nl = locale === "nl";
  const lang = nl ? "nl" : "en";
  const num = new Intl.NumberFormat(nl ? "nl-BE" : "en-GB");
  const n = (value: number) => num.format(value);
  const share = (part: number, whole: number) => formatShare(whole === 0 ? 0 : part / whole, lang);
  const date = (value: Date | string) =>
    (typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value).toLocaleDateString(
      nl ? "nl-BE" : "en-GB",
      { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" },
    );
  const yearLabel = formatWorkingYear(stats.year);
  const confirmationLabel = formatWorkingYear(stats.confirmationYear);
  const fill = (text: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);

  const chartLabels = { table: t.chartTable, day: t.chartDay, total: t.chartTotal };
  const { list, reach, bySource, round, segments, charts } = stats;

  // De kleur hoort bij het scherm, in beide staafgrafieken dezelfde: blauw is
  // de onboarding, amber het bevestigingsscherm, groen de accountpagina.
  const sourceSeries: ChartSeries[] = [
    { key: "ONBOARDING", label: t.careerSourceOnboarding, color: "var(--chart-1)", values: charts.optInsPerDay.series.ONBOARDING },
    { key: "STUDY_CONFIRMATION", label: t.careerSourceConfirmation, color: "var(--chart-2)", values: charts.optInsPerDay.series.STUDY_CONFIRMATION },
    { key: "ACCOUNT", label: t.careerSourceAccount, color: "var(--chart-3)", values: charts.optInsPerDay.series.ACCOUNT },
  ];
  const roundSeries: ChartSeries[] = [
    { key: "ONBOARDING", label: t.roundViaOnboarding, color: "var(--chart-1)", values: charts.confirmationsPerDay.series.ONBOARDING },
    { key: "CONFIRMATION", label: t.roundViaConfirmation, color: "var(--chart-2)", values: charts.confirmationsPerDay.series.CONFIRMATION },
    { key: "ACCOUNT", label: t.roundViaAccount, color: "var(--chart-3)", values: charts.confirmationsPerDay.series.ACCOUNT },
  ];
  // De lijst is waar het om gaat, dus die draagt de kleur; Career aan staat er
  // als grijze context naast.
  const listSeries: ChartSeries[] = [
    {
      key: "total",
      label: t.chartListTotal,
      color: "var(--chart-context)",
      values: charts.list.total.values,
      reconstructedUntil: charts.list.total.reconstructedUntil,
    },
    { key: "onList", label: t.chartListOnList, color: "var(--navy)", values: charts.list.onList.values },
  ];

  const gateNotAsked = Math.max(0, round.gate.total - round.gate.before - round.gate.asked);
  const segmentLabel = (row: SegmentRow, labels: Record<string, string>) =>
    row.key === "NONE" ? t.segNoYear : (labels[row.key] ?? row.key);
  const order = (rows: SegmentRow[], keys: readonly string[]) =>
    [...rows].sort((a, b) => {
      const ia = keys.indexOf(a.key);
      const ib = keys.indexOf(b.key);
      return (ia === -1 ? keys.length : ia) - (ib === -1 ? keys.length : ib);
    });

  const segmentTable = (rows: SegmentRow[], head: string, labels: Record<string, string>) => (
    <div className="overflow-x-auto">
      <table className="vtk-seg-table">
        <thead>
          <tr>
            <th scope="col">{head}</th>
            <th scope="col">{t.segConfirmed}</th>
            <th scope="col">{t.segOnList}</th>
            <th scope="col">{t.segShare}</th>
            <th scope="col">{t.segAsked}</th>
            <th scope="col">{t.segChosen}</th>
            <th scope="col">{t.segConversion}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{segmentLabel(row, labels)}</th>
              <td data-label={t.segConfirmed}>{n(row.confirmed)}</td>
              <td data-label={t.segOnList}>{n(row.onList)}</td>
              <td data-label={t.segShare}>{row.confirmed ? share(row.onList, row.confirmed) : "–"}</td>
              <td data-label={t.segAsked}>{n(row.asked)}</td>
              <td data-label={t.segChosen}>{n(row.chosen)}</td>
              <td data-label={t.segConversion}>{row.asked ? share(row.chosen, row.asked) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-vtk-ink">{t.careerSectionTitle}</h2>
        <p className="mt-1 max-w-2xl text-sm text-[#5c667f]">{t.careerSectionIntro}</p>
      </div>

      {/* 1. De lijst zelf: van alle opt-ins naar het getal bij Career hierboven. */}
      <Card className="p-5">
        <CardHead title={t.careerListTitle} intro={fill(t.careerListIntro, { year: confirmationLabel })} />
        <Rows>
          <Row label={t.careerListTotal} value={n(list.total)} />
          <Row kind="minus" label={t.careerListNotFaculty} value={n(list.notAtFaculty)} />
          <Row
            kind="minus"
            label={fill(t.careerListAwaiting, { year: confirmationLabel })}
            hint={t.careerListAwaitingHint}
            value={n(list.awaitingConfirmation)}
          />
          <Row kind="minus" label={t.careerListUnsubscribed} value={n(list.unsubscribed)} />
          <Row kind="result" label={t.careerListOnList} value={n(list.onList)} />
        </Rows>

        <SubHeading>{t.chartListTitle}</SubHeading>
        <DailyChart
          kind="lines"
          days={charts.list.days}
          series={listSeries}
          locale={lang}
          title={t.chartListTitle}
          labels={{ ...chartLabels, reconstructed: t.chartListReconstructed }}
        />
        <p className="mt-2 max-w-2xl text-xs text-[#5c667f]">
          {charts.list.measuredSince
            ? fill(t.chartListNote, { date: date(charts.list.measuredSince) })
            : t.chartListNoteEmpty}
        </p>
      </Card>

      {/* 2. Bereik: van alle studentaccounts naar onze studenten. */}
      <Card className="p-5">
        <CardHead title={t.careerReachTitle} intro={t.careerReachIntro} />
        <Rows>
          <Row label={t.careerStudentAccounts} hint={t.careerStudentAccountsHint} value={n(reach.studentAccounts)} />
          <Row kind="minus" label={t.careerNotOnboarded} value={n(reach.notOnboarded)} />
          <Row kind="minus" label={t.careerNotAtFaculty} value={n(reach.notAtFaculty)} />
          <Row kind="minus" label={t.careerNoProgramme} value={n(reach.noProgramme)} />
          <Row kind="result" label={t.careerOurStudents} hint={t.careerOurStudentsHint} value={n(reach.ourStudents)} />
          <Row
            kind="sub"
            label={t.careerWithCareer}
            value={n(reach.ourStudentsWithCareer)}
            share={formatShare(reach.ourStudentsShare, lang)}
          />
        </Rows>
        <Rows>
          <Row
            label={t.careerFirw}
            hint={fill(t.careerFirwHint, { count: n(reach.firwOurStudents) })}
            value={n(reach.firwStudents)}
          />
        </Rows>
      </Card>

      {/* 3. Welk scherm de lijst vult. */}
      <Card className="p-5">
        <CardHead title={t.careerBySourceTitle} intro={t.careerBySourceIntro} />
        <Rows>
          <Row
            label={t.careerSourceOnboarding}
            hint={t.careerSourceOnboardingHint}
            value={n(bySource.ONBOARDING)}
            share={share(bySource.ONBOARDING, list.total)}
          />
          <Row label={t.careerSourceAccount} value={n(bySource.ACCOUNT)} share={share(bySource.ACCOUNT, list.total)} />
          <Row
            label={t.careerSourceConfirmation}
            value={n(bySource.STUDY_CONFIRMATION)}
            share={share(bySource.STUDY_CONFIRMATION, list.total)}
          />
          <Row kind="result" label={t.careerTotalOptIns} value={n(list.total)} />
        </Rows>

        <SubHeading>{fill(t.chartSourceTitle, { days: RECENT_DAYS })}</SubHeading>
        <DailyChart
          kind="bars"
          days={charts.optInsPerDay.days}
          series={sourceSeries}
          locale={lang}
          title={fill(t.chartSourceTitle, { days: RECENT_DAYS })}
          labels={chartLabels}
        />
        <p className="mt-2 max-w-2xl text-xs text-[#5c667f]">{t.chartSourceNote}</p>
      </Card>

      {/* 4. De bevestigingsronde en de Career-vraag erop. */}
      <Card className="p-5">
        <CardHead
          title={fill(t.roundTitle, { year: yearLabel })}
          intro={fill(t.roundIntro, { date: date(studyConfirmationStart(stats.year)) })}
        />
        <Rows>
          <Row label={t.roundStudents} value={n(round.students)} />
          <Row
            kind="sub"
            label={fill(t.roundConfirmed, { year: yearLabel })}
            value={n(round.confirmed)}
            share={share(round.confirmed, round.students)}
          />
          <Row
            kind="sub"
            label={t.roundPending}
            hint={t.roundPendingHint}
            value={n(round.pending)}
            share={share(round.pending, round.students)}
          />
          <Row
            kind="subsub"
            label={t.roundPendingCareer}
            hint={t.roundPendingCareerHint}
            value={n(round.pendingWithCareer)}
          />
          <Row
            kind="subsub"
            label={t.roundPendingWithoutCareer}
            hint={t.roundPendingWithoutCareerHint}
            value={n(round.pendingWithoutCareer)}
          />
        </Rows>

        <SubHeading>{t.roundVia}</SubHeading>
        <Rows>
          <Row label={t.roundViaConfirmation} value={n(round.via.CONFIRMATION)} share={share(round.via.CONFIRMATION, round.confirmed)} />
          <Row label={t.roundViaOnboarding} value={n(round.via.ONBOARDING)} share={share(round.via.ONBOARDING, round.confirmed)} />
          <Row label={t.roundViaAccount} value={n(round.via.ACCOUNT)} share={share(round.via.ACCOUNT, round.confirmed)} />
          <Row
            label={t.roundViaUntracked}
            hint={t.roundViaUntrackedHint}
            value={n(round.untracked)}
            share={share(round.untracked, round.confirmed)}
          />
          <Row kind="result" label={fill(t.roundConfirmed, { year: yearLabel })} value={n(round.confirmed)} />
        </Rows>
        <p className="mt-2 text-xs text-[#5c667f]">
          {round.trackedSince
            ? fill(t.roundTrackedSince, { date: date(round.trackedSince) })
            : t.roundNotTrackedYet}
        </p>

        <SubHeading>{t.chartRoundTitle}</SubHeading>
        <DailyChart
          kind="bars"
          days={charts.confirmationsPerDay.days}
          series={roundSeries}
          locale={lang}
          title={t.chartRoundTitle}
          labels={chartLabels}
        />

        <SubHeading>{t.roundGateTitle}</SubHeading>
        <Rows>
          <Row label={t.roundGateTotal} value={n(round.gate.total)} />
          <Row kind="minus" label={t.roundGateBefore} value={n(round.gate.before)} />
          <Row kind="minus" label={t.roundGateNotAsked} hint={t.roundGateNotAskedHint} value={n(gateNotAsked)} />
          <Row kind="result" label={t.roundGateAsked} value={n(round.gate.asked)} />
          <Row
            kind="sub"
            label={t.roundGateChosen}
            value={n(round.gate.chosen)}
            share={share(round.gate.chosen, round.gate.asked)}
          />
        </Rows>
        {round.gateOptInsBeforeTracking > 0 ? (
          <Rows>
            <Row
              label={t.roundGateBeforeTracking}
              hint={t.roundGateBeforeTrackingHint}
              value={n(round.gateOptInsBeforeTracking)}
            />
          </Rows>
        ) : null}

        <SubHeading>{t.roundOnboardingTitle}</SubHeading>
        <Rows>
          <Row label={t.roundOnboardingTotal} value={n(round.onboarding.total)} />
          <Row
            kind="sub"
            label={t.roundOnboardingChosen}
            value={n(round.onboarding.chosen)}
            share={share(round.onboarding.chosen, round.onboarding.total)}
          />
        </Rows>
      </Card>

      {/* 5. Per studiejaar en per richting, voor wie een bedrijf een doelgroep wil noemen. */}
      <Card className="p-5">
        <CardHead title={t.segmentsTitle} intro={fill(t.segmentsIntro, { year: yearLabel })} />
        {segments.years.length === 0 ? (
          <p className="mt-4 text-sm text-[#5c667f]">{fill(t.segEmpty, { year: yearLabel })}</p>
        ) : (
          <div className="mt-4 space-y-6">
            {segmentTable(order(segments.years, [...STUDY_YEARS, "NONE"]), t.segYear, dict.onboarding.years)}
            {segmentTable(order(segments.programmes, STUDY_PROGRAMMES), t.segProgramme, dict.onboarding.programmes)}
          </div>
        )}
      </Card>
    </section>
  );
}
