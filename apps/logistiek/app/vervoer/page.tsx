import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/lib/session';
import { copy, getLocale } from '@/lib/i18n';
import { pricingModeLabel, formatEuro } from '@/lib/uitleen';
import { activeVehicles } from '@/lib/uitleen-server';
import { getPublicCopy } from '@/lib/public-copy';
import { VanRequestForm } from './request-form';

export default async function VervoerPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate variant="van" />;
  }
  const en = locale === 'en';

  const [vehicles, content] = await Promise.all([activeVehicles(), getPublicCopy(locale)]);

  return (
    <PageShell
      title={
        <>
          {t.pageVanTitle} <em className="font-serif font-normal italic text-vtk-navy">{t.pageVanAccent}</em>
        </>
      }
      intro={content.pageVanLead}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <VanRequestForm
          locale={locale}
          groups={session.groups.map((g) => ({ id: g.id, name: en ? g.nameEn : g.nameNl }))}
          vehicles={vehicles.map((v) => ({
            id: v.id,
            name: en ? v.nameEn : v.nameNl,
            pricingMode: v.pricingMode,
            rateCents: v.rateCents,
          }))}
        />

        <aside className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            {en ? 'Good to know' : 'Goed om te weten'}
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-vtk-body">
            {content.vanDriverInfo ? <li>{content.vanDriverInfo}</li> : null}
            {content.vanTimingInfo ? <li>{content.vanTimingInfo}</li> : null}
            {content.vanPaymentInfo ? <li>{content.vanPaymentInfo}</li> : null}
          </ul>
          <h3 className="mt-5 text-sm font-semibold text-vtk-ink">{en ? 'Rates' : 'Tarieven'}</h3>
          <ul className="mt-2 space-y-1 text-sm text-vtk-body">
            {vehicles.map((v) => (
              <li key={v.id} className="flex justify-between gap-3">
                <span>{en ? v.nameEn : v.nameNl}</span>
                <span className="text-vtk-muted">
                  {v.pricingMode === 'FREE'
                    ? en
                      ? 'Free'
                      : 'Gratis'
                    : `${formatEuro(v.rateCents)} ${pricingModeLabel(v.pricingMode, locale).toLowerCase()}`}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </PageShell>
  );
}
