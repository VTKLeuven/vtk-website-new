import type { Metadata } from 'next';
import { staticMetadata } from '@/lib/pageMetadata';
import { hasLocale } from '@/lib/locale';
import { Locale } from '@vtk/i18n';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PleaseLogin } from '@/components/site/pleaseLogin';
import { prisma } from '@vtk/db';
import { academicYearRange, currentAcademicYear, parseShiftArray } from '@/lib/shift';
import { availableShifts, registeredShifts } from '@/lib/shift/lists';
import { loadPostNames } from '@/lib/shift/postNames';
import { earnedShiftReward } from '@/lib/shift/rewards';
import { deductedShifts, netShiftCount, shiftDeductions } from '@/lib/shift/deductions';
import { praesidiumYears } from '@/lib/shift/voucherEligibility';
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
 * shift waard is, los van wat er al uitbetaald werd, en nul voor een shift uit
 * een praesidiumjaar (`earnedShiftReward`). Die shift telt wel mee. Afgenomen
 * shiften van dit jaar gaan van het aantal af, niet van de bonnetjes.
 */
async function yearStats(userId: string): Promise<ShiftYearStats> {
  const startYear = currentAcademicYear();
  const { start, end } = academicYearRange();

  const [done, praesidium, deductions] = await Promise.all([
    prisma.shiftParticipant.findMany({
      where: {
        userId,
        shift: { startTime: { gte: start, lt: end }, endTime: { lt: new Date() } },
      },
      select: { shift: { select: { reward: true, startTime: true } } },
    }),
    praesidiumYears([userId]),
    shiftDeductions({ userIds: [userId], academicYear: startYear }),
  ]);

  return {
    yearLabel: academicYearLabel(startYear),
    shiftsDone: netShiftCount(done.length, deductedShifts(deductions)),
    vouchers: done.reduce(
      (total, p) => total + earnedShiftReward({ userId, ...p.shift }, praesidium),
      0,
    ),
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

  const [stats, postNames, available, registered] = await Promise.all([
    yearStats(session.user.id),
    loadPostNames(locale),
    availableShifts(session.user.id),
    registeredShifts(session.user.id, session.user.id),
  ]);

  return (
    <div className="vtk-page">
      <ShiftBoard
        locale={locale}
        historyHref={`${base}/shift/history`}
        stats={stats}
        postNames={postNames}
        initialAvailable={parseShiftArray(available)}
        initialRegistered={parseShiftArray(registered)}
      />
    </div>
  );
}
