import { notFound } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { BudgetEditor } from '@/components/bo-budget/BudgetEditor';
import { canEditBudget, canManageBudgets, getBudgetSettings, loadBudget, postNames } from '@/lib/bo/budget/server';

/*
 * /admin/bestuursorgaan/mijn/<id>: één budget op de site opstellen. Wie in de
 * post zit of in Groep 5, opent het; voor de rest bestaat het niet.
 */

export default async function BudgetPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/bestuursorgaan/mijn/${id}`);

  const budget = await loadBudget(id);
  if (!budget || !canEditBudget(session, budget.postKey)) notFound();
  const [settings, names] = await Promise.all([getBudgetSettings(), postNames([budget.postKey], nl)]);

  return (
    <BudgetEditor
      budget={{
        id: budget.id,
        version: budget.version,
        title: budget.title,
        template: budget.template,
        status: budget.status,
        targetDate: budget.targetDate,
        postKey: budget.postKey,
        content: budget.content,
      }}
      postName={names.get(budget.postKey) ?? budget.postKey}
      settings={settings}
      locale={locale}
      backHref={`${base}/admin/bestuursorgaan/mijn`}
      settingsHref={canManageBudgets(session) ? `${base}/admin/bestuursorgaan/instellingen` : null}
    />
  );
}
