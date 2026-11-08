'use client';

import Link from '@/components/ui/Link';
import { LinkedRow } from '@/components/ui/LinkedRow';
import { money, shortDate } from './format';

/*
 * De budgetten die een post op de site opstelt, onder de tabel van wat als
 * rekenblad langs het BO passeerde: dat blijft de bron zolang de site een proef
 * is. Een eigen blok en geen rijen in die tabel:
 * daar is de stand altijd een van vier woorden (Open, Komt nog, Afgerond, Geen
 * budget), en "in opmaak" is er geen van.
 */

export type SiteBudgetRow = {
  id: string;
  title: string;
  postName: string;
  status: 'DRAFT' | 'SUBMITTED';
  targetDate: string | null;
  totalCents: number;
  updatedAt: string;
};

export function SiteBudgets({ budgets, locale }: { budgets: SiteBudgetRow[]; locale: 'nl' | 'en' }) {
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  return (
    <section aria-labelledby="site-budgets" className="space-y-3">
      <div className="vtk-bo-own-head">
        <h2 id="site-budgets">{nl ? 'Op de site (proef)' : 'On the site (trial)'}</h2>
        <span>
          {nl
            ? 'Het BO leest nog de rekenbladen in Drive: download je budget en zet het in de map Budgetten van de BO.'
            : "The board still reads the spreadsheets in Drive: download your budget and put it in the meeting's Budgetten folder."}
        </span>
      </div>
      <div className="vtk-bo-l-wrap">
        <table className="vtk-bo-l-table">
          <thead>
            <tr>
              <th>{nl ? 'Activiteit' : 'Activity'}</th>
              <th>BO</th>
              <th className="num">{nl ? 'Totaal' : 'Total'}</th>
              <th>{nl ? 'Stand' : 'Status'}</th>
              <th>{nl ? 'Gewijzigd' : 'Changed'}</th>
            </tr>
          </thead>
          <tbody>
            {budgets.map((b) => {
              const href = `${base}/admin/bestuursorgaan/mijn/${b.id}`;
              return (
                <LinkedRow key={b.id} href={href} className="vtk-bo-l-row">
                  <td>
                    <Link href={href} className="font-semibold text-vtk-ink hover:underline">
                      {b.title}
                    </Link>
                    <span className="block text-xs text-vtk-muted">{b.postName}</span>
                  </td>
                  <td data-label="BO" className="text-xs">
                    {b.targetDate ? (
                      shortDate(b.targetDate, nl)
                    ) : (
                      <span className="text-vtk-muted">{nl ? 'Nog niet gekozen' : 'Not chosen yet'}</span>
                    )}
                  </td>
                  <td data-label={nl ? 'Totaal' : 'Total'} className="num">
                    € {money(b.totalCents / 100, nl)}
                  </td>
                  <td data-label={nl ? 'Stand' : 'Status'}>
                    <span className="vtk-bo-pill" data-tone={b.status === 'SUBMITTED' ? 'ok' : undefined}>
                      {b.status === 'SUBMITTED' ? (nl ? 'Ingediend' : 'Submitted') : nl ? 'In opmaak' : 'Draft'}
                    </span>
                  </td>
                  <td data-label={nl ? 'Gewijzigd' : 'Changed'} className="text-xs">
                    {new Date(b.updatedAt).toLocaleString(nl ? 'nl-BE' : 'en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Brussels',
                    })}
                  </td>
                </LinkedRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
