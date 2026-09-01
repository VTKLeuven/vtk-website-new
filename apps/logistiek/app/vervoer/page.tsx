import Link from 'next/link';
import { ExternClosed } from '@/components/extern-closed';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { externalRequestsBlocked, getSession, requestsAsExternal } from '@/lib/session';
import { copy, getLocale } from '@/lib/i18n';
import { eventOptions, pricingModeLabel, formatEuro } from '@/lib/uitleen';
import { activeVehicles, getLogistiekSettings, selectableEvents } from '@/lib/uitleen-server';
import { getPublicCopy } from '@/lib/public-copy';
import { requesterOptions } from '@/app/materiaal/event-values';
import { VanRequestForm } from './request-form';

export default async function VervoerPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate variant="van" />;
  }
  const en = locale === 'en';

  // Zelfde regel als bij materiaal (B3/E3): een externe krijgt de evenementen
  // niet te zien, en ze worden hier dus ook niet opgehaald.
  const external = requestsAsExternal(session);
  const [vehicles, content, events, settings] = await Promise.all([
    activeVehicles(),
    getPublicCopy(locale),
    external ? Promise.resolve([]) : selectableEvents(session.groups.map((g) => g.id)),
    getLogistiekSettings(),
  ]);
  // S1: de tarieven en de bezetting blijven staan, het formulier niet. Zonder
  // die twee zou "mail logistiek@vtk.be" komen zonder dat je weet wat er rijdt.
  const blocked = externalRequestsBlocked(session, settings);

  return (
    <PageShell
      title={
        <>
          {t.pageVanTitle} {t.pageVanAccent}
        </>
      }
      intro={content.pageVanLead}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {blocked ? (
          <ExternClosed locale={locale} />
        ) : (
          <VanRequestForm
            locale={locale}
            groups={requesterOptions(session.groups, locale)}
            vehicles={vehicles.map((v) => ({
              id: v.id,
              name: en ? v.nameEn : v.nameNl,
              pricingMode: v.pricingMode,
              rateCents: v.rateCents,
            }))}
            draftKey={`vervoer:${session.user.id}`}
            events={external ? undefined : eventOptions(events, locale)}
          />
        )}

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
          <Link
            href="/vervoer/bezetting"
            className="mt-5 inline-flex font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            {en ? 'When is a vehicle free?' : 'Wanneer is een voertuig vrij?'}
          </Link>
        </aside>
      </div>
    </PageShell>
  );
}
