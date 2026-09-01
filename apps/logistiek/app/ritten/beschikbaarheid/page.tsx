import Link from 'next/link';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { ToastProvider } from '@/components/ui/toast';
import { getLocale } from '@/lib/i18n';
import { getSession } from '@/lib/session';
import {
  formatDateRange,
  isoWeekNumber,
  parseDateOnly,
  startOfWeek,
  toDateInputValue,
} from '@/lib/uitleen';
import { availabilityForDriver, isDriver } from '@/lib/uitleen-server';
import { AvailabilityEditor } from './availability-editor';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Wanneer kan ik rijden" (V1).
 *
 * Bij `/ritten` en niet in het beheer: een chauffeur heeft geen
 * `logistiek.manage`, en dit is precies wat hij zonder beheerrechten moet kunnen.
 * Het team ziet het resultaat als lichte band in de transportplanning.
 */
export const metadata = { title: 'Wanneer kan ik rijden' };

export default async function BeschikbaarheidPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const [{ week }, session, locale] = await Promise.all([searchParams, getSession(), getLocale()]);
  if (!session) return <LoginGate variant="trips" />;
  const en = locale === 'en';

  const [driver, windows] = await Promise.all([
    isDriver(session.user.id),
    availabilityForDriver(session.user.id),
  ]);

  const monday = startOfWeek((week && parseDateOnly(week)) || new Date());
  const days = Array.from({ length: 7 }, (_, index) =>
    new Date(monday.getTime() + index * DAY_MS).toISOString()
  );
  const hrefFor = (target: Date) => `/ritten/beschikbaarheid?week=${toDateInputValue(target)}`;

  return (
    <PageShell
      kicker={
        <Link href="/ritten" className="hover:underline">
          ← {en ? 'Back to my trips' : 'Terug naar mijn ritten'}
        </Link>
      }
      title={en ? 'When can I drive?' : 'Wanneer kan ik rijden?'}
      intro={
        en
          ? 'Let Logistics know when you are free. It is a hint, not a promise: they can still ask you outside these windows.'
          : 'Laat Logistiek weten wanneer je vrij bent. Het is een hint en geen belofte: ze mogen je nog altijd vragen buiten deze vensters.'
      }
      compact
    >
      {!driver ? (
        <p className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface px-5 py-4 text-sm leading-7 text-vtk-body">
          {en ? 'You are not a driver for Logistics. Would you like to drive? Mail ' : 'Je bent geen chauffeur bij Logistiek. Wil je rijden? Mail '}
          <a
            href="mailto:logistiek@vtk.be"
            className="font-medium text-vtk-navy underline underline-offset-4"
          >
            logistiek@vtk.be
          </a>
          .
        </p>
      ) : (
        <div className="grid gap-4">
          {/* Op een telefoon één rij: het raster eronder moet op hetzelfde
              scherm passen, en drie rijen navigatie duwen het weg. Het
              datumbereik verdwijnt daar; het weeknummer en de dagnummers in het
              raster zeggen genoeg. */}
          <nav
            className="flex items-center justify-between gap-2 text-sm"
            aria-label="Week kiezen"
          >
            <Link
              href={hrefFor(new Date(monday.getTime() - 7 * DAY_MS))}
              className="shrink-0 rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
            >
              ←<span className="sr-only sm:not-sr-only sm:ml-1">
                {en ? 'Previous' : 'Vorige'}
              </span>
            </Link>
            <span className="min-w-0 truncate text-center text-vtk-muted">
              {en ? 'Week' : 'Week'} {isoWeekNumber(monday)}
              <span className="hidden sm:inline">
                {' '}
                · {formatDateRange(monday, new Date(monday.getTime() + 6 * DAY_MS), locale)}
              </span>
            </span>
            <Link
              href={hrefFor(new Date(monday.getTime() + 7 * DAY_MS))}
              className="shrink-0 rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
            >
              <span className="sr-only sm:not-sr-only sm:mr-1">{en ? 'Next' : 'Volgende'}</span>→
            </Link>
          </nav>

          {/* De ledenkant heeft geen ToastProvider (die staat enkel rond
              /beheer), dus die komt hier rond dit ene blok. */}
          <ToastProvider>
            <AvailabilityEditor
              days={days}
              driverId={session.user.id}
              driverName={session.user.name}
              windows={windows.map((window) => ({
                id: window.id,
                startAt: window.startAt.toISOString(),
                endAt: window.endAt.toISOString(),
                note: window.note,
              }))}
            />
          </ToastProvider>
        </div>
      )}
    </PageShell>
  );
}
