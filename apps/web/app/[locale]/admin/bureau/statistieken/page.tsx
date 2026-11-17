import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import type { Locale } from '@vtk/i18n';
import { Button, Card, Label, Select } from '@vtk/ui';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { currentWorkingYear, formatWorkingYear } from '@/lib/workingYear';
import { describeSource, SHAREABLE_SOURCES } from '@/lib/ticketing/source';
import {
  OTHER,
  UNMEASURED,
  cumulativeCurve,
  curveIndex,
  meetingCurve,
  seriesKeys,
  sourceRows,
  yearOverview,
  type Series,
} from '@/lib/meetingStats';
import { loadBureauStatsMeetings } from '@/lib/meetingStatsLoad';
import { DailyChart, type ChartSeries } from '@/components/admin/DailyChart';
import { BureauPromotionLog, type PromotionView } from '@/components/meetings/BureauPromotionLog';
import { brusselsYMD, ymdKey } from '@/lib/brussels';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];
const UNMEASURED_COLOR = 'color-mix(in srgb, var(--chart-context) 45%, var(--surface))';

/**
 * Statistieken van de VTK Bureaus van dit werkingsjaar: langs welk kanaal de
 * inschrijvingen binnenkwamen, voor één bureau en voor het jaar. Voor Onderwijs,
 * om te zien wat een mail of een story doet. Bewust drie blokken en niet meer;
 * zie docs/design-decisions.md ("Statistieken van het VTK Bureau").
 *
 * Telt wie nu ingeschreven is (`ACTIVE`), hetzelfde getal als "Ingeschreven"
 * op de tab Beheer. Wie annuleerde, is weg: annuleren wist de rij.
 */
export default async function AdminBureauStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ bureau?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  await requirePermission('bureau.manage');

  const { bureau: bureauParam } = await searchParams;
  const workingYear = currentWorkingYear();
  const meetings = await loadBureauStatsMeetings(workingYear);

  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    timeZone: 'Europe/Brussels',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const dateTime = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const shortDate = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const startsAt = new Map(meetings.map((meeting) => [meeting.id, meeting.startsAt]));
  const percent = new Intl.NumberFormat(nl ? 'nl-BE' : 'en-GB', { style: 'percent', maximumFractionDigits: 0 });

  // Standaard het eerstvolgende bureau; is het jaar voorbij, dan het laatste.
  const selected =
    meetings.find((meeting) => meeting.id === bureauParam) ??
    meetings.find((meeting) => meeting.startsAt >= now) ??
    meetings.at(-1) ??
    null;

  const sourceLabel = (key: string) =>
    key === UNMEASURED
      ? nl
        ? 'Niet gemeten (oudere inschrijvingen)'
        : 'Not measured (older registrations)'
      : key === OTHER
        ? nl
          ? 'Andere'
          : 'Other'
        : describeSource(key, locale).label;
  // Eén indeling in reeksen voor het hele jaar, en dus één kleur per kanaal:
  // mail is in de grafiek van een bureau dezelfde kleur als in het jaar. Per
  // bureau gerangschikt zou het grootste kanaal van dat bureau telkens de
  // eerste kleur krijgen, ook als dat een ander kanaal is dan in het jaar.
  const yearKeys = seriesKeys(meetings.flatMap((meeting) => meeting.reservations));
  const colourOf = new Map<string, string>();
  let colour = 0;
  for (const key of yearKeys) {
    // Andere en niet gemeten zijn geen kanaal en dragen dus geen kleur, maar
    // moeten wel van elkaar te onderscheiden zijn: niet gemeten is lichter.
    colourOf.set(
      key,
      key === UNMEASURED
        ? UNMEASURED_COLOR
        : key === OTHER
          ? 'var(--chart-context)'
          : (COLORS[colour++] ?? 'var(--chart-context)')
    );
  }
  const toChart = (series: Series[]): ChartSeries[] =>
    series
      // Een kanaal dat bij dit bureau niet voorkomt, hoort niet in zijn legende.
      .filter((s) => s.values.some((value) => value > 0))
      .map((s) => ({
        key: s.key,
        label: sourceLabel(s.key),
        color: colourOf.get(s.key) ?? 'var(--chart-context)',
        values: s.values,
      }));
  const chartLabels = {
    table: nl ? 'Toon als tabel' : 'Show as table',
    day: nl ? 'Dag' : 'Day',
    total: nl ? 'Totaal' : 'Total',
  };

  const promotions = selected
    ? await prisma.meetingPromotion.findMany({ where: { meetingId: selected.id }, orderBy: { at: 'asc' } })
    : [];
  const curve = selected
    ? meetingCurve(selected, now, { promotions: promotions.map((promotion) => promotion.at), keys: yearKeys })
    : null;
  const running = selected
    ? cumulativeCurve(
        selected,
        now,
        promotions.map((promotion) => promotion.at)
      )
    : null;
  // Nummers in de volgorde van de tijd, enkel voor wat op de lijn staat: een
  // moment na nu krijgt geen lijn en dus geen nummer, anders mist er een cijfer.
  let markerNumber = 0;
  const placed = promotions.map((promotion) => {
    const index = running ? curveIndex(running, promotion.at) : null;
    return { promotion, index, number: index === null ? null : ++markerNumber };
  });
  const markers = placed.flatMap(({ promotion, index, number }) =>
    index === null || number === null ? [] : [{ index, number, label: promotion.label }]
  );
  const promotionItems: PromotionView[] = placed.map(({ promotion, number }) => ({
    id: promotion.id,
    number,
    atLabel: dateTime.format(promotion.at),
    label: promotion.label,
    linkLabel: promotion.source
      ? [describeSource(promotion.source, locale).label, promotion.sourceCampaign].filter(Boolean).join(' · ')
      : null,
  }));
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const defaultAt = `${ymdKey(brusselsYMD(now))}T${hhmm}`;
  const origins = selected ? sourceRows(selected.reservations) : [];
  const year = yearOverview(meetings);
  const yearHasRegistrations = year.meetings.some((meeting) => meeting.total > 0);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#5c667f]">
        {nl
          ? 'Langs welk kanaal de inschrijvingen binnenkwamen. Een link maak je bij een bureau op de tab Beheer, met het linkicoon. Wie zich uitschreef, telt niet mee.'
          : 'Which channel the registrations came in through. Create a link for a bureau on the Manage tab, with the link icon. People who cancelled are not counted.'}
      </p>

      {meetings.length === 0 ? (
        <div className="vtk-basic-empty">
          {nl ? 'Nog geen bureaus in dit werkingsjaar.' : 'No bureaus in this working year yet.'}
        </div>
      ) : (
        <>
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{nl ? 'Eén bureau' : 'One bureau'}</h2>
                <p className="text-sm text-[#5c667f]">
                  {nl
                    ? 'Inschrijvingen per dag, van het openen tot het bureau, per herkomst, en daaronder het totaal tot dan.'
                    : 'Registrations per day, from opening to the bureau, by source, and below it the running total.'}
                </p>
              </div>
              <form method="get" className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor="bureau-stats-pick">{nl ? 'Bureau' : 'Bureau'}</Label>
                  <Select id="bureau-stats-pick" name="bureau" defaultValue={selected?.id} className="w-64">
                    {meetings.map((meeting) => (
                      <option key={meeting.id} value={meeting.id}>
                        {dateLabel.format(meeting.startsAt)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" variant="ghost" size="sm">
                  {nl ? 'Toon' : 'Show'}
                </Button>
              </form>
            </div>

            {curve && curve.days.length > 0 ? (
              <div className="space-y-6">
                <DailyChart
                  kind="bars"
                  days={curve.days}
                  series={toChart(curve.series)}
                  locale={locale}
                  title={nl ? 'Inschrijvingen per dag' : 'Registrations per day'}
                  labels={chartLabels}
                />
                {/* Het totaal tot en met elke dag: een mail of story is hier een
                    knik waar de lijn steiler wordt. Eén lijn, alle kanalen samen;
                    de verdeling staat al in de staven erboven. */}
                {running && running.keys.length > 1 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-vtk-ink">
                      {nl ? 'Totaal ingeschreven' : 'Total registered'}
                    </h3>
                    <p className="mb-1 text-xs text-[#5c667f]">
                      {running.stepHours === 1
                        ? nl
                          ? 'Per uur.'
                          : 'Per hour.'
                        : nl
                          ? `Per ${running.stepHours} uur, omdat dit bureau lang open stond.`
                          : `Per ${running.stepHours} hours, because this bureau was open for a long time.`}
                    </p>
                    <DailyChart
                      kind="lines"
                      days={running.keys}
                      keyFormat="instant"
                      series={[
                        {
                          key: 'cumulative',
                          label: nl ? 'Ingeschreven' : 'Registered',
                          color: 'var(--chart-1)',
                          values: running.values,
                        },
                      ]}
                      locale={locale}
                      title={nl ? 'Totaal ingeschreven door de tijd' : 'Total registered over time'}
                      labels={{
                        ...chartLabels,
                        day: nl ? 'Tijdstip' : 'Time',
                        markers: nl ? 'Reclame' : 'Promotion',
                      }}
                      markers={markers}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[#5c667f]">
                {nl ? 'Nog geen inschrijvingen voor dit bureau.' : 'No registrations for this bureau yet.'}
              </p>
            )}

            {selected ? (
              <div className="mt-6 border-t border-vtk-blue/10 pt-5">
                <BureauPromotionLog
                  key={selected.id}
                  nl={nl}
                  meetingId={selected.id}
                  items={promotionItems}
                  sources={SHAREABLE_SOURCES.map((key) => ({ key, label: describeSource(key, locale).label }))}
                  defaultAt={defaultAt}
                />
              </div>
            ) : null}
          </Card>

          {origins.length > 0 ? (
            <Card className="p-5">
              <h2 className="mb-1 text-lg font-semibold">
                {nl ? 'Herkomst van dit bureau' : 'Sources for this bureau'}
              </h2>
              <p className="mb-4 text-sm text-[#5c667f]">
                {nl
                  ? 'Telt langs waar iemand zich de eerste keer inschreef; wie later zijn broodje wijzigt, verandert dat niet. Wie langs de login moest zonder link met kanaal, staat onder rechtstreeks.'
                  : 'Counts where someone registered the first time; changing a sandwich later does not change it. People who had to log in and had no link with a channel are counted as direct.'}
              </p>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                      <th className="py-1 pr-3">{nl ? 'Kanaal' : 'Channel'}</th>
                      <th className="py-1 pr-3">{nl ? 'Naam' : 'Name'}</th>
                      <th className="py-1 pr-3 text-right">{nl ? 'Aantal' : 'Count'}</th>
                      <th className="py-1 pr-3 text-right">{nl ? 'Aandeel' : 'Share'}</th>
                      <th className="py-1 text-right">{nl ? 'Eerste inschrijving' : 'First registration'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {origins.flatMap((row) => [
                      <tr key={row.key} className="border-t border-vtk-blue/10">
                        <td className="py-1.5 pr-3 font-medium">{sourceLabel(row.key)}</td>
                        <td className="py-1.5 pr-3 text-[#5c667f]">
                          {row.campaigns.length > 0 ? (nl ? 'alle' : 'all') : ''}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{row.count}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{percent.format(row.share)}</td>
                        <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                          {dateTime.format(row.firstAt)}
                        </td>
                      </tr>,
                      ...row.campaigns.map((campaign) => (
                        <tr key={`${row.key}-${campaign.key}`} className="text-[#5c667f]">
                          <td className="py-1 pr-3" />
                          <td className="py-1 pr-3 whitespace-nowrap">{campaign.key}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">{campaign.count}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">{percent.format(campaign.share)}</td>
                          <td className="py-1 text-right tabular-nums whitespace-nowrap">
                            {dateTime.format(campaign.firstAt)}
                          </td>
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="mb-1 text-lg font-semibold">
              {nl ? `Het jaar ${formatWorkingYear(workingYear)}` : `The year ${formatWorkingYear(workingYear)}`}
            </h2>
            <p className="mb-4 text-sm text-[#5c667f]">
              {nl
                ? 'Een staaf per bureau, per herkomst. Terugkerend is wie dit werkingsjaar al op een eerder bureau ingeschreven stond.'
                : 'One bar per bureau, by source. Returning means registered for an earlier bureau this working year.'}
            </p>
            {yearHasRegistrations ? (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
                <DailyChart
                  kind="bars"
                  // Het tijdstip van elk bureau en niet de dag: twee bureaus op
                  // dezelfde dag kregen anders dezelfde sleutel.
                  days={year.meetings.map((meeting) => startsAt.get(meeting.id)?.toISOString() ?? meeting.day)}
                  keyFormat="instant"
                  series={toChart(year.series)}
                  locale={locale}
                  title={nl ? 'Inschrijvingen per bureau' : 'Registrations per bureau'}
                  labels={{ ...chartLabels, day: 'Bureau' }}
                />
                <div className="relative overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                        <th className="py-1 pr-3">Bureau</th>
                        <th className="py-1 pr-3 text-right">{nl ? 'Nieuw' : 'New'}</th>
                        <th className="py-1 text-right">{nl ? 'Terugkerend' : 'Returning'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {year.meetings.map((meeting) => (
                        <tr key={meeting.id} className="border-t border-vtk-blue/10">
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            {shortDate.format(startsAt.get(meeting.id))}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{meeting.newcomers}</td>
                          <td className="py-1.5 text-right tabular-nums">{meeting.returning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#5c667f]">
                {nl ? 'Nog geen inschrijvingen dit werkingsjaar.' : 'No registrations this working year yet.'}
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
