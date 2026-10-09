import type { Metadata } from 'next';
import { staticMetadata } from '@/lib/pageMetadata';
import Link from '@/components/ui/Link';
import { hasLocale } from '@/lib/locale';
import { Locale, getDictionary } from '@vtk/i18n';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PleaseLogin } from '@/components/site/pleaseLogin';
import { prisma } from '@vtk/db';
import { currentWorkingYear } from '@/lib/workingYear';
import { shiftDeductions } from '@/lib/shift/deductions';
import { buildShiftHistory } from '@/lib/shift/history';
import { loadPostNames } from '@/lib/shift/postNames';
import { praesidiumYears } from '@/lib/shift/voucherEligibility';
import { ShiftHistory } from '@/components/shift/ShiftHistory';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata('shiftHistory', '/shift/history', locale, { noIndex: true });
}

export default async function ShiftHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === 'nl' ? '' : '/en';
  const t = getDictionary(locale).shift.history;

  let session;
  try {
    session = await requireSession();
  } catch {
    return <PleaseLogin locale={locale} nextPath={`${base}/shift/history`} className="vtk-page-shell" />;
  }

  // Alle voorbije shiften waarvoor de user ingeschreven was. Afgenomen shiften
  // tellen per jaar mee in het aantal, zonder reden: die is voor het beheer
  // (`lib/shift/deductions.ts`).
  const userId = session.user.id;
  const [participations, postNames, deductions, praesidium] = await Promise.all([
    prisma.shiftParticipant.findMany({
      where: { userId, shift: { endTime: { lt: new Date() } } },
      select: {
        shift: {
          select: { id: true, name: true, startTime: true, endTime: true, location: true, post: true, reward: true },
        },
      },
    }),
    loadPostNames(locale),
    shiftDeductions({ userIds: [userId] }),
    praesidiumYears([userId]),
  ]);

  const currentYear = currentWorkingYear();
  const years = buildShiftHistory({
    userId,
    shifts: participations.map((p) => p.shift),
    deductions,
    praesidium,
    currentYear,
  });
  const requested = Number((await searchParams).jaar);
  const selected = years.find((year) => year.year === requested) ?? years.find((year) => year.year === currentYear)!;

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{t.title}</h1>
          <p className="vtk-page-subtitle">{t.subtitle}</p>
        </div>
        <Link href={`${base}/shift`} className="vtk-button vtk-button-ghost">
          ← {t.back}
        </Link>
      </header>

      <div className="vtk-page-shell">
        <ShiftHistory
          locale={locale}
          base={base}
          years={years}
          selected={selected}
          currentYear={currentYear}
          inPraesidiumNow={session.groups.some((group) => group.type === 'PRAESIDIUM')}
          postNames={postNames}
        />
      </div>
    </div>
  );
}
