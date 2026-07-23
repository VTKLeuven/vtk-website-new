import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/lib/session';
import { getCatalog, getLogistiekSettings } from '@/lib/uitleen-server';
import { copy, getLocale } from '@/lib/i18n';
import { getPublicCopy } from '@/lib/public-copy';
import { MaterialRequestForm } from './request-form';

export default async function MateriaalPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate variant="material" />;
  }

  const [catalog, settings, content] = await Promise.all([
    getCatalog(),
    getLogistiekSettings(),
    getPublicCopy(locale),
  ]);

  return (
    <PageShell
      title={
        <>
          {t.pageMaterialTitle} <em className="font-serif font-normal italic text-vtk-navy">{t.pageMaterialAccent}</em>
        </>
      }
      intro={content.pageMaterialLead}
    >
      {catalog.length === 0 ? (
        <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-7 text-vtk-body">
          {locale === 'en' ? 'The catalogue is still empty. Check back later, or email ' : 'De catalogus is nog leeg. Kom later terug, of mail '}
          <a href="mailto:logistiek@vtk.be" className="font-medium underline underline-offset-4">
            logistiek@vtk.be
          </a>
          .
        </p>
      ) : (
        <MaterialRequestForm
          catalog={catalog}
          groups={session.groups.map((g) => ({ id: g.id, name: locale === 'en' ? g.nameEn : g.nameNl }))}
          locale={locale}
          showRentPrices={settings.showRentPrices}
          paymentNote={content.materialPaymentNote}
        />
      )}
    </PageShell>
  );
}
