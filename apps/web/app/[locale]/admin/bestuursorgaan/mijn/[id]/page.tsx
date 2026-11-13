import { notFound } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { siteUrl } from '@/lib/seo';
import { BudgetEditor } from '@/components/bo-budget/BudgetEditor';
import { sheetForPost } from '@/lib/bo/budget/begroting';
import {
  canEditBudget,
  canManageBudgets,
  getBegroting,
  getBudgetSettings,
  loadBudget,
  loadPot,
  postNames,
} from '@/lib/bo/budget/server';

/*
 * /admin/bestuursorgaan/mijn/<id>: één budget op de site, om op te stellen
 * (Maken) of na te kijken (`?weergave=nakijken`, zo openen de mappen per BO
 * het). Wie in de post zit of in Groep 5, opent het; voor de rest bestaat het
 * niet. Wie geen lid is, komt binnen met een deellink (`/budget/<token>`).
 */

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ weergave?: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/bestuursorgaan/mijn/${id}`);

  const budget = await loadBudget(id);
  if (!budget || !canEditBudget(session, budget.postKey)) notFound();
  const [settings, names, begroting, { weergave }] = await Promise.all([
    getBudgetSettings(),
    postNames([budget.postKey], nl),
    getBegroting(),
    searchParams,
  ]);
  const pot = await loadPot(budget, settings);
  const postName = names.get(budget.postKey) ?? budget.postKey;

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
      postName={postName}
      settings={settings}
      locale={locale}
      backHref={`${base}/admin/bestuursorgaan/mijn`}
      settingsHref={canManageBudgets(session) ? `${base}/admin/bestuursorgaan/instellingen` : null}
      pot={pot}
      begroting={begroting ? { sheets: begroting.sheets, suggested: sheetForPost(begroting, postName) } : null}
      share={{ viewToken: budget.viewToken, editToken: budget.editToken, origin: siteUrl().replace(/\/$/, '') }}
      initialView={weergave === 'nakijken' ? 'nakijken' : 'maken'}
    />
  );
}
