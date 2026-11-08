import { notFound } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import { prisma } from '@vtk/db';
import Link from '@/components/ui/Link';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { postOptions } from '@/lib/bo/posts';
import { getBudgetSettings } from '@/lib/bo/budget/server';
import { BudgetSettingsForm } from '@/components/bo-budget/BudgetSettingsForm';

/*
 * /admin/bestuursorgaan/instellingen: wat vandaag in elk budgetblad opnieuw
 * stond, staat hier één keer. BTW per post, de Collect&Go-servicekost,
 * Flesserke en de locaties. Enkel Groep 5 (Beheer zit daarin).
 */

export default async function BudgetSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  await requirePermission('bestuursorgaan.manage');

  const [groups, settings] = await Promise.all([
    prisma.group.findMany({
      where: { type: { not: 'JAARWERKING' } },
      orderBy: [{ orderInPraesidium: 'asc' }, { nameNl: 'asc' }],
      select: {
        id: true,
        code: true,
        slug: true,
        nameNl: true,
        nameEn: true,
        type: true,
        active: true,
        orderInPraesidium: true,
      },
    }),
    getBudgetSettings(),
  ]);
  const posts = postOptions(groups, nl).map((p) => ({ key: p.key, name: p.name, group: p.group }));

  return (
    <div className="vtk-bud">
      <Link href={`${base}/admin/bestuursorgaan`} className="vtk-bud-back">
        ← {nl ? 'Budgetten & Resultaten' : 'Budgets & Results'}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">{nl ? 'Instellingen voor budgetten' : 'Budget settings'}</h1>
        <p className="mt-2 max-w-2xl text-sm">
          {nl
            ? 'Wat vandaag in elk budgetblad opnieuw staat, staat hier één keer. Een wijziging werkt meteen door in elk budget dat op de site opgesteld wordt.'
            : 'What every budget sheet repeats today, is set here once. A change applies at once to every draft budget.'}
        </p>
      </header>
      <BudgetSettingsForm settings={settings} posts={posts} locale={locale} />
    </div>
  );
}
