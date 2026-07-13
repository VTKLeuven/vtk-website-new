import Link from 'next/link';
import { hasLocale } from '@/lib/locale';
import { Locale, getDictionary } from '@vtk/i18n';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PleaseLogin } from '@/components/site/pleaseLogin';
import { prisma } from '@vtk/db';

import '@/app/design/vtk-basic.css';

export default async function ShiftHistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === 'nl' ? '' : '/en';
  const t = getDictionary(locale).shift;

  let session;
  try {
    session = await requireSession();
  } catch {
    return <PleaseLogin locale={locale} nextPath={`${base}/shift/history`} className="vtk-page-shell" />;
  }

  // Alle shiften waarvoor de user (ooit) ingeschreven was, per post geteld.
  const participations = await prisma.shiftParticipant.findMany({
    where: { userId: session.user.id },
    select: { shift: { select: { post: true } } },
  });

  const perPost = new Map<string, number>();
  for (const p of participations) {
    const key = p.shift.post ?? 'GEEN';
    perPost.set(key, (perPost.get(key) ?? 0) + 1);
  }
  const total = participations.length;
  const rows = [...perPost.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · {t.shifts}</div>
          <h1 className="vtk-page-title">{t.history.title}</h1>
        </div>
      </header>

      <div className="vtk-page-shell">
        <div className="vtk-basic-table-section">
          <Link href={`${base}/shift`} className="vtk-basic-badge" style={{ width: 'fit-content' }}>
            ← {t.history.back}
          </Link>

          <h2 className="vtk-basic-table-title">
            {t.history.total}: {total}
          </h2>

          <div className="vtk-basic-table-wrap">
            <table className="vtk-basic-table vtk-shift-table">
              <thead>
                <tr>
                  <th>{t.history.post}</th>
                  <th>{t.history.count}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="vtk-basic-table-empty">
                      {t.history.empty}
                    </td>
                  </tr>
                ) : (
                  rows.map(([post, count]) => (
                    <tr key={post}>
                      <td data-label={t.history.post}>{post === 'GEEN' ? t.history.noPost : post}</td>
                      <td data-label={t.history.count}>{count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
