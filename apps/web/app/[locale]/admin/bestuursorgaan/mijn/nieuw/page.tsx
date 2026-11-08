import { notFound } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import Link from '@/components/ui/Link';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { NewBudgetForm } from '@/components/bo-budget/NewBudgetForm';
import { getBudgetSettings, postNames, siteBudgetPostKeys } from '@/lib/bo/budget/server';

/*
 * /admin/bestuursorgaan/mijn/nieuw: een budget starten. Kort: post, naam,
 * sjabloon en het BO. De rest gebeurt in de editor, die na het aanmaken opent.
 */

export default async function NewBudgetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/bestuursorgaan/mijn/nieuw`);

  const settings = await getBudgetSettings();
  const keys = siteBudgetPostKeys(session, settings);
  const names = await postNames(keys, nl);
  const posts = keys.map((key) => ({ key, name: names.get(key) ?? key, vat: settings.vatByPost[key] ?? null }));

  return (
    <div className="vtk-bud vtk-bud-narrow">
      <Link href={`${base}/admin/bestuursorgaan/mijn`} className="vtk-bud-back">
        ← {nl ? 'Mijn budgetten' : 'My budgets'}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">{nl ? 'Budget op de site' : 'Budget on the site'}</h1>
        <p className="mt-2 max-w-2xl text-sm">
          {nl
            ? 'Een proef naast de rekenbladen in Drive. Je vult de regels in, de site rekent de sommen en de BTW en zegt wat nog ontbreekt. Daarna download je het als rekenblad en zet je het in de map Budgetten van de BO, zoals voordien.'
            : "A trial next to the spreadsheets in Drive. You fill in the rows, the site does the sums and the VAT. Then you download it as a spreadsheet and put it in the meeting's Budgetten folder, as before."}
        </p>
      </header>
      {posts.length === 0 ? (
        <p className="vtk-bud-card">
          {nl
            ? 'Budgetten op de site zijn een proef, en je post doet (nog) niet mee. Groep 5 kiest welke posten het proberen; tot dan werk je met het rekenblad in Drive.'
            : 'Budgets on the site are a trial, and your post is not (yet) part of it. Group 5 chooses which posts try it; until then, use the spreadsheet in Drive.'}
        </p>
      ) : (
        <NewBudgetForm posts={posts} locale={locale} cancelHref={`${base}/admin/bestuursorgaan/mijn`} />
      )}
    </div>
  );
}
