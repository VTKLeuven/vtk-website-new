import { getOrCreateCurrentWeek } from '@/app/actions/fakbar';
import Link from 'next/link';

export const metadata = {
  title: 'Dashboard',
};

export default async function AdminDashboardPage() {
  const currentWeek = await getOrCreateCurrentWeek(new Date().getFullYear(), getCurrentWeekNumber());

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="fakbar-stat-grid">
        <div className="fakbar-stat-card">
          <p className="fakbar-stat-label">Actieve week</p>
          <p className="fakbar-stat-value">W{currentWeek.weekNumber}</p>
          <p className="fakbar-stat-sub">{currentWeek.year} · {currentWeek.status}</p>
        </div>
        <div className="fakbar-stat-card">
          <p className="fakbar-stat-label">Avonden deze week</p>
          <p className="fakbar-stat-value">{currentWeek.evenings.length}</p>
          <p className="fakbar-stat-sub">gepland</p>
        </div>
        <div className="fakbar-stat-card">
          <p className="fakbar-stat-label">Naar kluis (week)</p>
          <p className="fakbar-stat-value">
            €{(currentWeek.evenings.reduce((s, e) => s + e.cashToSafe, 0) / 100).toFixed(2)}
          </p>
          <p className="fakbar-stat-sub">cash naar kluis</p>
        </div>
        <div className="fakbar-stat-card">
          <p className="fakbar-stat-label">Bancontact (week)</p>
          <p className="fakbar-stat-value">
            €{(currentWeek.evenings.reduce((s, e) => s + e.bancontactRevenue, 0) / 100).toFixed(2)}
          </p>
          <p className="fakbar-stat-sub">bancontact ontvangsten</p>
        </div>
      </div>

      {/* Evenings */}
      <div>
        <div className="fakbar-section-head">
          <h2>Avonden week {currentWeek.weekNumber}</h2>
          <p>Klik op een avond om de telling in te vullen of te bekijken.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {currentWeek.evenings.map((evening) => (
            <Link
              key={evening.id}
              href={`/admin/avondtelling/${evening.id}`}
              className="fakbar-row flex-col items-start gap-2 no-underline"
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-semibold text-[--ink]">{evening.dayOfWeek}</span>
                <span className="rounded-md bg-[--paper-2] px-2 py-0.5 text-xs font-medium text-[--muted]">
                  {new Date(evening.date).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
              <div className="w-full space-y-1 text-sm text-[--muted]">
                <div className="flex justify-between">
                  <span>Hoofdtapper</span>
                  <span className="font-medium text-[--ink]">{evening.hoofdtapper?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Naar kluis</span>
                  <span className="font-medium text-[--ink]">€{(evening.cashToSafe / 100).toFixed(2)}</span>
                </div>
              </div>
              {evening.specialeActiviteit && (
                <span className="rounded bg-[--paper-2] px-2 py-0.5 text-xs text-[--muted]">
                  ★ {evening.specialeActiviteit}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div>
        <div className="fakbar-section-head">
          <h2>Snelle acties</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/stocktelling"
            className="inline-flex items-center gap-2 rounded-full border border-[--line-2] bg-[--surface] px-5 py-2.5 text-sm font-medium text-[--ink] transition hover:border-[--ink]"
          >
            📦 Stocktelling invullen
          </Link>
          <Link
            href="/admin/weekoverzicht"
            className="inline-flex items-center gap-2 rounded-full border border-[--line-2] bg-[--surface] px-5 py-2.5 text-sm font-medium text-[--ink] transition hover:border-[--ink]"
          >
            📅 Weekoverzicht
          </Link>
        </div>
      </div>
    </div>
  );
}

function getCurrentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.ceil((diff + start.getDay() * 86400000) / oneWeek);
}
