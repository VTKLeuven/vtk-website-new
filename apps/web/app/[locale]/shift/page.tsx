import { hasLocale } from '@/lib/locale';
import { Locale, getDictionary } from '@vtk/i18n';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PleaseLogin } from '@/components/site/pleaseLogin';

import '@/app/design/vtk-basic.css';

export default async function ShiftPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === 'nl' ? '' : '/en';

  // TODO doe dit op een andere (betere manier?)
  try {
    await requireSession();
  } catch {
    return <PleaseLogin locale={locale} nextPath={`${base}/shift`} className="vtk-page-shell" />;
  }

  const dict = getDictionary(locale);

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · {dict.shift.shifts}</div>
          <h1 className="vtk-page-title">Shiften</h1>
        </div>
      </header>

      <div className="vtk-page-shell">
        <div className="vtk-basic-table-wrap">
          <table className="vtk-basic-table">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Date</th>
                <th>Time</th>
                <th>Where</th>
                <th>Register</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Broodjes smeren</td>
                <td>13/7/2026</td>
                <td>10:30-12:30</td>
                <td>Theokot</td>
                <td>
                  <span className="vtk-basic-badge vtk-basic-badge-success">Registreer (0/4)</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
