import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import type { FakScanResult } from '@prisma/client';
import { Card, Input, Label } from '@vtk/ui';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { getDictionary, type Locale } from '@vtk/i18n';
import { SaveForm } from '@/components/ui/SaveForm';
import { saveFakscannerConfigAction } from '@/app/actions/fakscanner';
import { getFakRanking, getFakscannerConfig } from '@/lib/fakscanner-server';
import {
  currentWorkingYear,
  formatWorkingYear,
  parseWorkingYear,
  workingYearStart,
  workingYearTabs,
} from '@/lib/workingYear';

const RANK_PAGE_SIZE = 30;
const LOG_PAGE_SIZE = 50;

type Search = { jaar?: string; rang?: string; page?: string };

/**
 * Fakscanner: de kaartlezer aan de bar. Bovenaan de ranglijst van een
 * werkingsjaar (dertig per pagina), daaronder de instellingen en de log van de
 * mislukte scans.
 *
 * Er staat bewust geen lijst van geslaagde check-ins: we bewaren per persoon één
 * stand en geen historiek, dus die lijst bestaat niet. Zie
 * docs/design-decisions.md ("Fakscanner").
 */
export default async function FakscannerAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/fakscanner`);
  const canManage = session.user.isSuperAdmin || session.permissions.includes('fakscanner.manage');
  if (!canManage) return <p className="text-sm text-zinc-500">{nl ? 'Geen toegang.' : 'No access.'}</p>;

  const dict = getDictionary(locale);
  const sp = await searchParams;
  const year = parseWorkingYear(sp.jaar);
  const rankPage = Math.max(1, Number(sp.rang) || 1);
  const logPage = Math.max(1, Number(sp.page) || 1);
  const isCurrentYear = year === currentWorkingYear();

  const config = await getFakscannerConfig();

  // De log heeft geen jaarkolom; het werkingsjaarvenster (15 juli tot 15 juli)
  // snijdt hem op dezelfde grens als de standen zelf.
  const logWhere = { at: { gte: workingYearStart(year), lt: workingYearStart(year + 1) } };

  const [ranking, yearsWithData, logCount, logs] = await Promise.all([
    getFakRanking(year, config.rewardEvery, (rankPage - 1) * RANK_PAGE_SIZE, RANK_PAGE_SIZE),
    prisma.fakTally.findMany({ distinct: ['year'], select: { year: true }, orderBy: { year: 'desc' } }),
    prisma.fakScanLog.count({ where: logWhere }),
    prisma.fakScanLog.findMany({
      where: logWhere,
      orderBy: { at: 'desc' },
      take: LOG_PAGE_SIZE,
      skip: (logPage - 1) * LOG_PAGE_SIZE,
    }),
  ]);

  const years = workingYearTabs(yearsWithData.map((r) => r.year));
  const rankPages = Math.max(1, Math.ceil(ranking.total / RANK_PAGE_SIZE));
  const logPages = Math.max(1, Math.ceil(logCount / LOG_PAGE_SIZE));
  const firstRank = (rankPage - 1) * RANK_PAGE_SIZE;

  const dateTimeFmt = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const buildHref = (patch: Partial<Search>) => {
    const next = new URLSearchParams({
      jaar: String(year),
      rang: String(rankPage),
      page: String(logPage),
    });
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    return `${base}/admin/fakscanner?${next.toString()}`;
  };

  const resultLabel = (r: FakScanResult): string => {
    if (nl) return { CARD_ERROR: 'Kaart of KU Leuven', SERVER_ERROR: 'Onze kant' }[r];
    return { CARD_ERROR: 'Card or KU Leuven', SERVER_ERROR: 'Our side' }[r];
  };

  const pill = (active: boolean) =>
    'rounded-full border px-3 py-1 ' +
    (active ? 'border-vtk-blue bg-vtk-blue/10 text-vtk-ink' : 'border-vtk-blue/20 text-[#5c667f]');

  const pager = (current: number, pages: number, key: 'rang' | 'page') =>
    pages > 1 ? (
      <div className="flex items-center justify-between text-xs text-[#5c667f]">
        <span>
          {nl ? 'Pagina' : 'Page'} {current} / {pages}
        </span>
        <div className="flex gap-2">
          {current > 1 && (
            <Link
              href={buildHref({ [key]: String(current - 1) })}
              className="rounded-full border border-vtk-blue/20 px-3 py-1"
            >
              {nl ? 'Vorige' : 'Previous'}
            </Link>
          )}
          {current < pages && (
            <Link
              href={buildHref({ [key]: String(current + 1) })}
              className="rounded-full border border-vtk-blue/20 px-3 py-1"
            >
              {nl ? 'Volgende' : 'Next'}
            </Link>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{dict.admin.fakscanner}</h1>
        <p className="text-sm text-zinc-500">
          {nl
            ? 'De kaartlezer aan de bar. Eén check-in per avond; om de zoveel check-ins is er een gratis pint. We bewaren per persoon enkel de stand, geen lijst van avonden.'
            : 'The card reader at the bar. One check-in per evening; every so many check-ins there is a free beer. We keep only a running total per person, not a list of evenings.'}
        </p>
      </header>

      {/* Werkingsjaar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[#5c667f]">{nl ? 'Werkingsjaar' : 'Working year'}</span>
        {years.map((y) => (
          <Link key={y} href={buildHref({ jaar: String(y), rang: '1', page: '1' })} className={pill(y === year)}>
            {formatWorkingYear(y)}
          </Link>
        ))}
      </div>

      {/* Ranglijst */}
      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-vtk-ink">
            {nl ? 'Ranglijst' : 'Ranking'} · {formatWorkingYear(year)}
          </h2>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? `Een scan tijdens het dubbeltelvenster telt voor twee check-ins. Een gratis pint per ${config.rewardEvery} check-ins.`
              : `A scan during the double window counts as two check-ins. One free beer per ${config.rewardEvery} check-ins.`}
          </p>
        </div>

        {ranking.rows.length === 0 ? (
          <p className="text-sm text-[#5c667f]">
            {nl ? 'Nog geen check-ins in dit werkingsjaar.' : 'No check-ins in this working year yet.'}
          </p>
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-[#5c667f]">
                    <th className="w-10 py-2 pr-3">#</th>
                    <th className="py-2 pr-3">{nl ? 'Naam' : 'Name'}</th>
                    <th className="py-2 pr-3 text-right">{nl ? 'Check-ins' : 'Check-ins'}</th>
                    <th className="py-2">{nl ? 'Laatste check-in' : 'Last check-in'}</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.rows.map((row, index) => (
                    <tr key={row.rNumber} className="border-t border-vtk-blue/10">
                      <td className="py-2 pr-3 tabular-nums text-[#5c667f]">{firstRank + index + 1}</td>
                      <td className="py-2 pr-3 text-vtk-ink">
                        {row.name ?? <span className="tabular-nums">{row.rNumber}</span>}
                        {row.name ? (
                          <span className="ml-1 text-xs text-[#5c667f]">{row.rNumber}</span>
                        ) : (
                          <span className="ml-1 text-xs text-[#5c667f]">
                            {nl ? '(geen VTK-account)' : '(no VTK account)'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums text-vtk-ink">{row.points}</td>
                      <td className="whitespace-nowrap py-2 tabular-nums text-[#5c667f]">
                        {dateTimeFmt.format(row.lastCheckinAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pager(rankPage, rankPages, 'rang')}
          </>
        )}
      </section>

      {/* Instellingen */}
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? 'Instellingen' : 'Settings'}</h2>
        <p className="mb-4 text-sm text-[#5c667f]"></p>
        <SaveForm
          action={saveFakscannerConfigAction}
          className="space-y-4"
          resetOnSuccess={false}
          submitLabel={nl ? 'Instellingen opslaan' : 'Save settings'}
          savingLabel={nl ? 'Bezig met opslaan...' : 'Saving...'}
          savedMessage={nl ? 'Instellingen opgeslagen' : 'Settings saved'}
          fallbackErrorMessage={nl ? 'Opslaan van de instellingen mislukt.' : 'Saving the settings failed.'}
          errorMessages={{
            bad_time: nl ? 'Een uur moet als uu:mm ingevuld zijn.' : 'A time must be filled in as hh:mm.',
            empty_window: nl
              ? 'Begin en einde van het dubbeltelvenster mogen niet gelijk zijn.'
              : "The double window's start and end may not be the same.",
            bad_reward: nl
              ? 'Check-ins per pint moet een geheel getal van minstens 1 zijn.'
              : 'Check-ins per beer must be a whole number of at least 1.',
            bad_rollover: nl
              ? 'Het startuur van de bardag moet als uu:mm ingevuld zijn.'
              : "The bar day's start time must be filled in as hh:mm.",
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="flex items-center gap-2 text-sm text-vtk-ink">
                <input
                  type="checkbox"
                  name="doubleEnabled"
                  defaultChecked={config.doubleEnabled}
                  className="size-4 rounded border-zinc-400"
                />
                {nl ? 'Dubbeltelvenster aan' : 'Double window on'}
              </label>
              <p className="mt-1 text-sm text-[#5c667f]"></p>
            </div>
            <div>
              <Label htmlFor="doubleStart">{nl ? 'Dubbel vanaf' : 'Double from'}</Label>
              <Input id="doubleStart" name="doubleStart" type="time" defaultValue={config.doubleStart} />
            </div>
            <div>
              <Label htmlFor="doubleEnd">{nl ? 'Dubbel tot' : 'Double until'}</Label>
              <Input id="doubleEnd" name="doubleEnd" type="time" defaultValue={config.doubleEnd} />
            </div>
            <div>
              <Label htmlFor="rewardEvery">{nl ? 'Check-ins per gratis pint' : 'Check-ins per free beer'}</Label>
              <Input
                id="rewardEvery"
                name="rewardEvery"
                type="number"
                min={1}
                max={1000}
                defaultValue={config.rewardEvery}
              />
            </div>
            <div>
              <Label htmlFor="dayRolloverTime">{nl ? 'Nieuwe bardag begint om' : 'New bar day starts at'}</Label>
              <Input id="dayRolloverTime" name="dayRolloverTime" type="time" defaultValue={config.dayRolloverTime} />
            </div>
            <p className="text-sm text-[#5c667f] sm:col-span-3">
              {nl
                ? 'Het tijdstip waarop een nieuwe dag begint voor de teller. Staat dit op 06:00, dan hoort een scan om 01:00 nog bij de avond ervoor en levert een tweede scan die nacht dus niets op. Kies niets tussen 02:00 en 03:00: dat uur bestaat niet bij de overgang naar zomertijd.'
                : 'The time at which a new day starts for the counter. At 06:00, a scan at 01:00 still belongs to the previous evening, so a second scan that night earns nothing. Do not pick anything between 02:00 and 03:00: that hour does not exist when the clocks go forward.'}
            </p>
          </div>
        </SaveForm>
      </Card>

      {/* Log */}
      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-vtk-ink">{nl ? 'Scan Log' : 'Scan log'}</h2>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-[#5c667f]">
            {nl ? 'Geen mislukte scans in dit werkingsjaar.' : 'No failed scans in this working year.'}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left uppercase text-[#5c667f]">
                  <th className="py-2 pr-3">{nl ? 'Tijdstip' : 'Time'}</th>
                  <th className="py-2 pr-3">{nl ? 'Waar' : 'Where'}</th>
                  <th className="py-2 pr-3">{nl ? 'R-nummer' : 'R-number'}</th>
                  <th className="py-2">{nl ? 'Detail' : 'Detail'}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-vtk-blue/10">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-[#34405e]">
                      {dateTimeFmt.format(l.at)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
                        {resultLabel(l.result)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-[#5c667f]">{l.rNumber ?? '—'}</td>
                    <td className="py-2 text-[#5c667f]">{l.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pager(logPage, logPages, 'page')}
      </section>

      {!isCurrentYear && (
        <p className="text-xs text-[#5c667f]">
          {nl
            ? 'Je bekijkt een afgelopen werkingsjaar. Nieuwe scans komen altijd in het lopende jaar terecht.'
            : 'You are viewing a past working year. New scans always land in the current year.'}
        </p>
      )}
    </div>
  );
}
