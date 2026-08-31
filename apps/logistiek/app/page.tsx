import Link from 'next/link';
import { ExternClosed } from '@/components/extern-closed';
import { LoginGate } from '@/components/login-gate';
import { LogisticsIcon } from '@/components/logistics-icon';
import { externalRequestsBlocked, getSession } from '@/lib/session';
import { copy, getLocale } from '@/lib/i18n';
import { getPublicCopy } from '@/lib/public-copy';
import { driverStatus, getLogistiekSettings, showsMyTrips } from '@/lib/uitleen-server';

function CtaCard({
  href,
  title,
  description,
  cta,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: 'material' | 'van' | 'reservation';
}) {
  return (
    <Link
      href={href}
      className="logistics-service-card group flex flex-col"
    >
      <span className="logistics-service-icon">
        <LogisticsIcon name={icon} className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-vtk-ink">{title}</h2>
      <p className="mt-2 flex-1 leading-7 text-vtk-body">{description}</p>
      <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-vtk-navy">
        {cta}
        <span aria-hidden className="transition group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </Link>
  );
}

export default async function LogistiekHome() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];

  if (!session) {
    return <LoginGate />;
  }
  const en = locale === 'en';
  const [content, driver, settings] = await Promise.all([
    getPublicCopy(locale),
    driverStatus(session.user.id),
    getLogistiekSettings(),
  ]);
  // S1: het zegt het hier al, zodat niemand eerst een formulier invult om pas
  // bij de indienknop te ontdekken dat het nog dicht staat.
  const blocked = externalRequestsBlocked(session, settings);

  return (
    <main className="flex-1">
      <header className="logistics-page-head">
        <div className="logistics-page-head-inner">
          <p className="logistics-eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
            {t.homeEyebrow}
          </p>
          <h1>{t.homeAccent} {t.homeTitle}</h1>
          <p className="logistics-page-intro">{content.homeLead}</p>
        </div>
      </header>

      <div className="logistics-page-content logistics-home-content">
        {blocked ? <ExternClosed locale={locale} /> : null}

        <section aria-labelledby="logistics-options-title">
          <div className="logistics-section-head">
            <h2 id="logistics-options-title">{en ? 'What would you like to do?' : 'Wat wil je doen?'}</h2>
            <p>{en ? 'Choose a service to get started.' : 'Kies een onderdeel om meteen te beginnen.'}</p>
          </div>
          <div className="logistics-service-grid">
            <CtaCard
              href="/materiaal"
              title={t.homeMaterial}
              description={content.homeMaterialLead}
              cta={t.homeMaterialCta}
              icon="material"
            />
            <CtaCard
              href="/vervoer"
              title={t.homeVan}
              description={content.homeVanLead}
              cta={t.homeVanCta}
              icon="van"
            />
            <CtaCard
              href="/reservaties"
              title={t.homeReservations}
              description={content.homeReservationsLead}
              cta={t.homeReservationsCta}
              icon="reservation"
            />
          </div>
        </section>

        <section className="logistics-workflow" aria-labelledby="logistics-workflow-title">
          <div>
            <p className="text-sm font-medium text-vtk-muted">VTK Logistiek</p>
            <h2 id="logistics-workflow-title">{t.howItWorks}</h2>
          </div>
          <ol>
            {[
              [content.stepChoose, 'material'],
              [content.stepRequest, 'reservation'],
              [content.stepReturn, 'check'],
            ].map(([label, icon]) => (
              <li key={label}>
                <span className="logistics-workflow-icon">
                  <LogisticsIcon name={icon as 'material' | 'reservation' | 'check'} className="h-5 w-5" />
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </section>

        {showsMyTrips(driver) ? (
          <Link
            href="/ritten"
            className="logistics-inline-link"
          >
            <span className="flex items-center gap-3 text-vtk-ink">
              <LogisticsIcon name="van" className="h-5 w-5 shrink-0 text-vtk-navy" />
              <span className="font-medium">{t.navTrips}</span>
              <span className="text-sm text-vtk-muted">
                {driver.upcomingTrips === 0
                  ? en
                    ? 'no trips assigned to you'
                    : 'geen ritten op jouw naam'
                  : en
                    ? `${driver.upcomingTrips} upcoming trip${driver.upcomingTrips === 1 ? '' : 's'}`
                    : `${driver.upcomingTrips} komende rit${driver.upcomingTrips === 1 ? '' : 'ten'}`}
              </span>
            </span>
            <span aria-hidden className="text-sm font-semibold text-vtk-navy">
              →
            </span>
          </Link>
        ) : null}
      </div>

      <section className="logistics-info-band">
        <div className="mx-auto grid w-full max-w-[1240px] gap-8 px-5 py-10 sm:px-9 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] lg:py-14">
          <div>
            <p className="logistics-eyebrow text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
              {t.infoKicker}
            </p>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-[-0.03em] text-vtk-paper sm:text-4xl">
              {content.infoTitle}
            </h2>
          </div>
          <p className="max-w-xl self-end leading-7 text-[#b7c0dc]">
            {content.infoLead}
          </p>
        </div>
      </section>
    </main>
  );
}
