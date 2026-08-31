import { ExternClosed } from '@/components/extern-closed';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { externalRequestsBlocked, getSession, requestsAsExternal } from '@/lib/session';
import {
  getCatalog,
  getLogistiekSettings,
  requestTemplates,
  selectableEvents,
} from '@/lib/uitleen-server';
import { eventOptions } from '@/lib/uitleen';
import { copy, getLocale } from '@/lib/i18n';
import { getPublicCopy } from '@/lib/public-copy';
import { requesterOptions } from './event-values';
import { MaterialRequestForm } from './request-form';

export default async function MateriaalPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate variant="material" />;
  }

  // Een externe (geen enkele groep) ziet geen evenementen en geen sjablonen
  // (B3/E3): hij kan er toch niet aan koppelen, en de namen van de evenementen
  // zijn werking van de kring. Ze worden hier al niet opgehaald, zodat ze ook
  // niet in de HTML van de pagina belanden.
  const external = requestsAsExternal(session);
  const [catalog, settings, content, templates, events] = await Promise.all([
    getCatalog(),
    getLogistiekSettings(),
    getPublicCopy(locale),
    external ? Promise.resolve([]) : requestTemplates(),
    external ? Promise.resolve([]) : selectableEvents(session.groups.map((g) => g.id)),
  ]);
  // S1: rondkijken in de catalogus mag, indienen nog niet.
  const blocked = externalRequestsBlocked(session, settings);

  return (
    <PageShell
      title={
        <>
          {t.pageMaterialTitle} {t.pageMaterialAccent}
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
          groups={requesterOptions(session.groups, locale)}
          locale={locale}
          showRentPrices={settings.showRentPrices}
          lastMinuteDays={settings.lastMinuteDays}
          paymentNote={content.materialPaymentNote}
          userId={session.user.id}
          templates={templates}
          events={external ? undefined : eventOptions(events, locale)}
          blocked={blocked ? <ExternClosed locale={locale} /> : undefined}
        />
      )}
    </PageShell>
  );
}
