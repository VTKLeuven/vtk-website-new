import { hasLocale } from '@/lib/locale';
import { Locale, getDictionary } from '@vtk/i18n';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PleaseLogin } from '@/components/site/pleaseLogin';
import { prisma } from '@vtk/db';
import { academicYearRange, currentAcademicYear } from '@/lib/shift';
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

export default async function ShiftPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === 'nl' ? '' : '/en';
  const t = getDictionary(locale).shift;

  let session;
  // TODO doe dit op een andere (betere manier?)
  try {
    session = await requireSession();
  } catch {
    return <PleaseLogin locale={locale} nextPath={`${base}/shift`} className="vtk-page-shell" />;
  }

  const stats = await yearStats(session.user.id);

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{t.shifts}</h1>
          <p className="vtk-page-subtitle">{t.subtitle}</p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <ShiftBoard locale={locale} historyHref={`${base}/shift/history`} stats={stats} />
      </div>
    </div>
  );
}
