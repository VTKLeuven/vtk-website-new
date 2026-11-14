import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import { hasLocale } from '@/lib/locale';
import { BudgetEditor } from '@/components/bo-budget/BudgetEditor';
import { getBudgetSettings, loadBudgetByToken, loadPot, postNames } from '@/lib/bo/budget/server';

import '@/app/design/vtk-admin.css';

/*
 * /budget/<token>: een budget achter een deellink, buiten de admin. De link is
 * de toegang: wie hem heeft, ziet dit ene budget of mag het aanpassen, op
 * hetzelfde blad als in de admin, zonder account. Voor een kring waarmee
 * samengewerkt wordt en voor de slides van het BO. Een ingetrokken of
 * onbekende link is een 404, zonder te zeggen welke van de twee.
 *
 * Wat hier niet meekomt: de lijst van budgetten, de instellingen, de
 * begroting van het jaar, de deellinks zelf en de verwijderknop.
 */

export const metadata: Metadata = {
  title: 'Budget',
  robots: { index: false, follow: false },
  // De link is het geheim: stuur hem niet mee naar de webshops waar de regels naar linken.
  referrer: 'no-referrer',
};

export default async function SharedBudgetPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale: localeParam, token } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  const found = await loadBudgetByToken(token);
  if (!found) notFound();
  const { budget, level } = found;
  const [settings, names] = await Promise.all([getBudgetSettings(), postNames([budget.postKey], nl)]);
  const pot = await loadPot(budget, settings);
  const postName = names.get(budget.postKey) ?? budget.postKey;
  return (
    <div className="vtk-bud-shared">
      <section className="vtk-admin-main">
        {level === 'view' && (
          <p className="vtk-bud-fine">
            {nl
              ? `Gedeeld budget van ${postName} (Vlaamse Technische Kring). Je kijkt mee; wijzigen kan hier niet.`
              : `Shared budget of ${postName} (Vlaamse Technische Kring). View only.`}
          </p>
        )}
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
          backHref={null}
          settingsHref={null}
          token={token}
          pot={pot}
          viewOnly={level !== 'edit'}
        />
      </section>
    </div>
  );
}
