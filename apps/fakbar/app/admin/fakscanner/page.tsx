import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckinQrPanel } from '@/components/fakscanner/checkin-qr-panel';
import { FakscannerSettingsForm } from '@/components/fakscanner/settings-form';
import { createFakCheckinToken } from '@/lib/fak-checkin-token';
import {
  formatWorkingYear,
  getFakRanking,
  getFakScanLog,
  getFakYearsWithData,
  getFakscannerConfig,
  parseWorkingYear,
  workingYearTabs,
} from '@/lib/fakscanner-admin';

export const metadata: Metadata = { title: 'Fakscanner' };

const RANK_PAGE_SIZE = 30;
const LOG_PAGE_SIZE = 50;

type Search = { jaar?: string; rang?: string; page?: string };

/**
 * De kaartlezer aan de toog: de ranglijst van een werkingsjaar, de instellingen
 * van het dubbeltelvenster en de gratis pint, en de log van mislukte scans.
 *
 * De lezer zelf zit op vtk.be: de Pi post naar `/api/fakscanner/scan` daar, en
 * de VTK-app naar `/api/app/v1/fakbar/checkin`. Deze pagina leest dezelfde
 * `Setting`-rij en dezelfde tabellen, en schrijft enkel de instellingen.
 *
 * Er staat bewust geen lijst van geslaagde check-ins: we bewaren per persoon één
 * stand en geen historiek, dus die lijst bestaat niet. Zie
 * docs/design-decisions.md ("Fakscanner").
 */
export default async function FakscannerAdminPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const year = parseWorkingYear(sp.jaar);
  const rankPage = Math.max(1, Number(sp.rang) || 1);
  const logPage = Math.max(1, Number(sp.page) || 1);
  const isCurrentYear = year === parseWorkingYear(undefined);

  const config = await getFakscannerConfig();

  const [ranking, yearsWithData, log, qrCode] = await Promise.all([
    getFakRanking(year, config.rewardEvery, (rankPage - 1) * RANK_PAGE_SIZE, RANK_PAGE_SIZE),
    getFakYearsWithData(),
    getFakScanLog(year, (logPage - 1) * LOG_PAGE_SIZE, LOG_PAGE_SIZE),
    Promise.resolve(createFakCheckinToken()),
  ]);

  const years = workingYearTabs(yearsWithData);
  const rankPages = Math.max(1, Math.ceil(ranking.total / RANK_PAGE_SIZE));
  const logPages = Math.max(1, Math.ceil(log.total / LOG_PAGE_SIZE));
  const firstRank = (rankPage - 1) * RANK_PAGE_SIZE;

  const dateTimeFmt = new Intl.DateTimeFormat('nl-BE', {
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
    return `/admin/fakscanner?${next.toString()}`;
  };

  const resultLabel = (result: 'CARD_ERROR' | 'SERVER_ERROR') =>
    result === 'CARD_ERROR' ? 'Kaart of KU Leuven' : 'Onze kant';

  const pill = (active: boolean) =>
    'rounded-full border px-3 py-1 text-xs font-medium ' +
    (active
      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--ink)]'
      : 'border-[var(--line)] text-[var(--muted)]');

  const pager = (current: number, pages: number, key: 'rang' | 'page') =>
    pages > 1 ? (
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>
          Pagina {current} / {pages}
        </span>
        <div className="flex gap-2">
          {current > 1 && (
            <Link href={buildHref({ [key]: String(current - 1) })} className={pill(false)}>
              Vorige
            </Link>
          )}
          {current < pages && (
            <Link href={buildHref({ [key]: String(current + 1) })} className={pill(false)}>
              Volgende
            </Link>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="fakbar-section-head">
        <h2>Fakscanner</h2>
        <p>
          De kaartlezer aan de toog. Eén check-in per bardag; om de {config.rewardEvery} check-ins een
          gratis pint. We bewaren per persoon enkel de stand, geen lijst van avonden.
        </p>
      </div>

      {/* Werkingsjaar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--muted)]">Werkingsjaar</span>
        {years.map((y) => (
          <Link key={y} href={buildHref({ jaar: String(y), rang: '1', page: '1' })} className={pill(y === year)}>
            {formatWorkingYear(y)}
          </Link>
        ))}
      </div>

      <CheckinQrPanel code={qrCode} />

      {/* Ranglijst */}
      <section className="fakbar-card space-y-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">Ranglijst · {formatWorkingYear(year)}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Een scan tijdens het dubbeltelvenster telt voor twee check-ins. Een gratis pint per{' '}
            {config.rewardEvery} check-ins.
          </p>
        </div>

        {ranking.rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nog geen check-ins in dit werkingsjaar.</p>
        ) : (
          <>
            <div className="fakbar-table-wrap">
              <table className="fakbar-table fakbar-table-stack">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Naam</th>
                    <th className="num">Check-ins</th>
                    <th>Laatste check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.rows.map((row, index) => (
                    <tr key={row.rNumber}>
                      <td className="tabular-nums text-[var(--muted)]" data-label="#">
                        {firstRank + index + 1}
                      </td>
                      <td data-label="Naam">
                        <span className="font-medium text-[var(--ink)]">
                          {row.name ?? <span className="tabular-nums">{row.rNumber}</span>}
                        </span>
                        {row.name ? (
                          <span className="ml-1.5 text-xs text-[var(--muted)]">{row.rNumber}</span>
                        ) : (
                          <span className="ml-1.5 text-xs text-[var(--muted)]">(geen VTK-account)</span>
                        )}
                      </td>
                      <td className="num font-medium tabular-nums text-[var(--ink)]" data-label="Check-ins">
                        {row.points}
                      </td>
                      <td className="whitespace-nowrap tabular-nums text-[var(--muted)]" data-label="Laatste check-in">
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
      <div>
        <div className="fakbar-section-head">
          <h3 className="text-base font-semibold text-[var(--ink)]">Instellingen</h3>
        </div>
        <FakscannerSettingsForm config={config} />
      </div>

      {/* Log */}
      <section className="fakbar-card space-y-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">Scan log</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Enkel mislukte scans komen hier terecht; geslaagde check-ins loggen we niet, want dat zou
            een aanwezigheidslijst zijn.
          </p>
        </div>

        {log.rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Geen mislukte scans in dit werkingsjaar.</p>
        ) : (
          <>
            <div className="fakbar-table-wrap">
              <table className="fakbar-table fakbar-table-stack">
                <thead>
                  <tr>
                    <th>Tijdstip</th>
                    <th>Waar</th>
                    <th>R-nummer</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {log.rows.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap tabular-nums text-[var(--body)]" data-label="Tijdstip">
                        {dateTimeFmt.format(entry.at)}
                      </td>
                      <td data-label="Waar">
                        <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
                          {resultLabel(entry.result)}
                        </span>
                      </td>
                      <td className="tabular-nums text-[var(--muted)]" data-label="R-nummer">
                        {entry.rNumber ?? '—'}
                      </td>
                      <td className="text-[var(--muted)]" data-label="Detail">
                        {entry.reason ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pager(logPage, logPages, 'page')}
          </>
        )}
      </section>

      {!isCurrentYear && (
        <p className="text-xs text-[var(--muted)]">
          Je bekijkt een afgelopen werkingsjaar. Nieuwe scans komen altijd in het lopende jaar terecht.
        </p>
      )}
    </div>
  );
}
