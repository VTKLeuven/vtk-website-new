import type { Metadata } from 'next';
import { staticMetadata } from '@/lib/pageMetadata';
import { hasLocale } from '@/lib/locale';
import { Locale } from '@vtk/i18n';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PleaseLogin } from '@/components/site/pleaseLogin';
import { prisma } from '@vtk/db';
import { addDays, startOfWeek } from 'date-fns';
import { academicYearRange, currentAcademicYear } from '@/lib/shift';
import { loadPostNames } from '@/lib/shift/postNames';
import { ShiftBoard } from '@/components/shift/ShiftBoard';
import type { ShiftYearStats } from '@/components/shift/MyShiftsRail';

import '@/app/design/vtk-basic.css';

/** Bvb 2025 → "25-26". */
function academicYearLabel(startYear: number): string {
  const short = (year: number) => String(year % 100).padStart(2, '0');
  return `${short(startYear)}-${short(startYear + 1)}`;
}

/**
 * Wat je dit academiejaar al gedaan hebt: enkel voorbije shiften tellen mee,
 * net zoals in de admin-ranglijst. De beloning is het aantal bonnetjes dat de
 * shift waard is, los van wat er al uitbetaald werd.
 */
async function yearStats(userId: string): Promise<ShiftYearStats> {
  const startYear = currentAcademicYear();
  const { start, end } = academicYearRange();

  const done = await prisma.shiftParticipant.findMany({
    where: {
      userId,
      shift: { startTime: { gte: start, lt: end }, endTime: { lt: new Date() } },
    },
    select: { shift: { select: { reward: true } } },
  });

  return {
    yearLabel: academicYearLabel(startYear),
    shiftsDone: done.length,
    vouchers: done.reduce((total, p) => total + p.shift.reward, 0),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata('shift', '/shift', locale);
}

export default async function ShiftPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === 'nl' ? '' : '/en';

  let session;
  // TODO doe dit op een andere (betere manier?)
  try {
    session = await requireSession();
  } catch {
    return <PleaseLogin locale={locale} nextPath={`${base}/shift`} className="vtk-page-shell" />;
  }

  const now = new Date();
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const currentWeekEnd = addDays(currentWeekStart, 7);

  const [stats, postNames, shiftThisWeek] = await Promise.all([
    yearStats(session.user.id),
    loadPostNames(locale),
    prisma.shift.findFirst({
      where: {
        endTime: { gte: now },
        startTime: { lt: currentWeekEnd },
        manualGrantId: null,
      },
      select: { id: true },
    }),
  ]);

  let initialWeekStart = currentWeekStart;
  if (!shiftThisWeek) {
    const nextShift = await prisma.shift.findFirst({
      where: {
        endTime: { gte: now },
        manualGrantId: null,
      },
      orderBy: { startTime: 'asc' },
      select: { startTime: true },
    });
    if (nextShift) {
      initialWeekStart = startOfWeek(nextShift.startTime, { weekStartsOn: 1 });
    }
  }

  return (
    <div className="vtk-page">
      <ShiftBoard
        locale={locale}
        historyHref={`${base}/shift/history`}
        stats={stats}
        postNames={postNames}
        initialWeekStart={initialWeekStart.toISOString()}
      />
    </div>
  );
}
