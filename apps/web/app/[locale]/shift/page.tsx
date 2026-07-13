import { hasLocale } from '@/lib/locale';
import { Locale, getDictionary } from '@vtk/i18n';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PleaseLogin } from '@/components/site/pleaseLogin';
import { AvailableShiftsTable, RegisteredShiftsTable } from '@/components/shift/tables';

import '@/app/design/vtk-basic.css';

export default async function ShiftPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === 'nl' ? '' : '/en';
  const dict = getDictionary(locale);

  // TODO doe dit op een andere (betere manier?)
  try {
    await requireSession();
  } catch {
    return <PleaseLogin locale={locale} nextPath={`${base}/shift`} className="vtk-page-shell" />;
  }

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · {dict.shift.shifts}</div>
          <h1 className="vtk-page-title">Shiften</h1>
        </div>
      </header>

      <div className="vtk-page-shell">
        <RegisteredShiftsTable locale={locale} userId={''} />
        <AvailableShiftsTable locale={locale} userId={''} />
      </div>
    </div>
  );
}
