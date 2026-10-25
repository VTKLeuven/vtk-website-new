import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card } from '@vtk/ui';
import { prisma } from '@vtk/db';
import Link from '@/components/ui/Link';
import { staticMetadata } from '@/lib/pageMetadata';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { getRunnerStats } from '@/lib/urenloop/runnerStats';
import { RunnerYearPanel } from '@/components/urenloop/RunnerStats';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata('urenloopStats', '/account/24urenloop', locale, { noIndex: true });
}

export default async function AccountUrenloopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  const session = await requireSession(`/inloggen?next=${base}/account/24urenloop`);

  const { rNumber } = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { rNumber: true },
  });
  const years = await getRunnerStats(rNumber);

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">
          <Link href={`${base}/account`} className="underline">
            {nl ? 'Mijn account' : 'My account'}
          </Link>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">
          {nl ? 'Mijn 24 urenloop' : 'My 24-hour run'}
        </h1>
      </div>

      {years.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-[#5c667f]">
            {!rNumber ? (
              nl ? (
                <>
                  Je rondes worden gekoppeld via je r-nummer, en dat staat nog niet in je profiel.{' '}
                  <Link href="/account#identity" className="font-medium text-vtk-ink underline">
                    Vul het in bij Mijn gegevens
                  </Link>
                  .
                </>
              ) : (
                <>
                  Your laps are linked through your r-number, which is not in your profile yet.{' '}
                  <Link href="/en/account#identity" className="font-medium text-vtk-ink underline">
                    Add it under My details
                  </Link>
                  .
                </>
              )
            ) : nl ? (
              `Er staan geen rondes op r-nummer ${rNumber}. Liep je mee, dan staan ze er zodra Sport de resultaten oplaadt, of je stond in de telapp onder een ander r-nummer.`
            ) : (
              `There are no laps for r-number ${rNumber}. If you ran, they appear once Sport uploads the results, or you were registered in the lap-counting app under another r-number.`
            )}
          </p>
        </Card>
      ) : (
        years.map((stats) => <RunnerYearPanel key={stats.year} stats={stats} locale={locale} />)
      )}
    </div>
  );
}
