import Link from 'next/link';
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

  let session;
  // TODO doe dit op een andere (betere manier?)
  try {
    session = await requireSession();
  } catch {
    return <PleaseLogin locale={locale} nextPath={`${base}/shift`} className="vtk-page-shell" />;
  }

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · {dict.shift.shifts}</div>
          <h1 className="vtk-page-title">{dict.shift.shifts}</h1>
        </div>
        <Link href={`${base}/shift/history`} className="vtk-basic-badge" style={{ alignSelf: 'center' }}>
          {dict.shift.history.link} →
        </Link>
      </header>

      <div className="vtk-page-shell">
        <RegisteredShiftsTable locale={locale} userId={session.user.id} />
        <AvailableShiftsTable locale={locale} userId={session.user.id} />
      </div>
    </div>
  );
}
