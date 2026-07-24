import Link from 'next/link';
import { LoginGate } from '@/components/login-gate';
import { LogisticsIcon } from '@/components/logistics-icon';
import { getSession } from '@/lib/session';
import { copy, getLocale } from '@/lib/i18n';
import { getPublicCopy } from '@/lib/public-copy';

function CtaCard({
  href,
  title,
  description,
  cta,
  icon,
  index,
}: {
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: 'material' | 'van' | 'reservation';
  index: string;
}) {
  return (
    <Link
      href={href}
      className="logistics-service-card group flex flex-col"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="logistics-service-icon">
          <LogisticsIcon name={icon} className="h-6 w-6" />
        </span>
        <span className="logistics-card-number">{index}</span>
      </div>
      <h2 className="mt-7 text-2xl font-semibold tracking-[-0.025em] text-vtk-ink">{title}</h2>
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
  const content = await getPublicCopy(locale);

  return (
    <main className="flex-1">
      <section className="logistics-home-hero">
        <div className="logistics-home-hero-inner">
          <div>
            <p className="logistics-eyebrow">
              <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
              {t.homeEyebrow}
            </p>
            <h1>
              <em className="font-serif font-normal italic text-vtk-yellow">{t.homeAccent}</em> {t.homeTitle}
            </h1>
            <p className="logistics-hero-sub">
              {content.homeLead}
            </p>
          </div>

          <aside className="logistics-hero-panel" aria-label={t.howItWorks}>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-vtk-paper">{t.howItWorks}</p>
              <span className="logistics-card-number text-vtk-yellow">01-03</span>
            </div>
            <ol className="mt-5 divide-y divide-white/15">
              {[
                [content.stepChoose, 'material'],
                [content.stepRequest, 'reservation'],
                [content.stepReturn, 'check'],
              ].map(([label, icon], index) => (
                <li key={label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-vtk-yellow text-vtk-ink">
                    <LogisticsIcon name={icon as 'material' | 'reservation' | 'check'} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-white/85">{label}</span>
                  <span className="text-xs tabular-nums text-white/45">0{index + 1}</span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      <section className="logistics-service-grid mx-auto grid w-full max-w-[1320px] gap-5 px-5 sm:px-9 md:grid-cols-3">
        <CtaCard
          href="/materiaal"
          title={t.homeMaterial}
          description={content.homeMaterialLead}
          cta={t.homeMaterialCta}
          icon="material"
          index="01"
        />
        <CtaCard
          href="/vervoer"
          title={t.homeVan}
          description={content.homeVanLead}
          cta={t.homeVanCta}
          icon="van"
          index="02"
        />
        <CtaCard
          href="/reservaties"
          title={t.homeReservations}
          description={content.homeReservationsLead}
          cta={t.homeReservationsCta}
          icon="reservation"
          index="03"
        />
      </section>

      <section className="logistics-info-band">
        <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-5 py-10 sm:px-9 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] lg:py-14">
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
