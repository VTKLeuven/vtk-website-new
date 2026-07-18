import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/lib/session';
import { getCatalog } from '@/lib/uitleen-server';
import { copy, getLocale } from '@/lib/i18n';
import { MaterialRequestForm } from './request-form';

export default async function MateriaalPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate message="Log in met je VTK-account om materiaal te reserveren." />;
  }

  const catalog = await getCatalog();

  return (
    <PageShell
      title={
        <>
          {t.pageMaterialTitle} <em className="font-serif font-normal italic text-vtk-navy">{t.pageMaterialAccent}</em>
        </>
      }
      intro={t.pageMaterialLead}
    >
      {catalog.length === 0 ? (
        <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-7 text-vtk-body">
          De catalogus is nog leeg. Kom later terug, of mail{' '}
          <a href="mailto:logistiek@vtk.be" className="font-medium underline underline-offset-4">
            logistiek@vtk.be
          </a>
          .
        </p>
      ) : (
        <MaterialRequestForm catalog={catalog} locale={locale} />
      )}
    </PageShell>
  );
}
