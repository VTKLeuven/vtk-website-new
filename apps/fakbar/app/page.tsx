import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ElixirIcon } from '@/components/elixir-icon';
import { OpeningHoursBand } from '@/components/opening-hours-band';
import { SpecialsBoard } from '@/components/specials-board';
import { readBarStatus } from '@/lib/bar-status';
import { getElixirHours } from '@/lib/opening-hours';
import { getSpecialsBoard } from '@/lib/specials';

export const metadata: Metadata = {
  title: "'t ElixIr · de fakbar van VTK Leuven",
  description:
    "Openingsuren, drankkaart en verhuur van 't ElixIr, de faculteitsbar van Ingenieurswetenschappen in Leuven.",
};

// De uren en de barstatus staan in de databank en veranderen door de avond.
export const revalidate = 60;

const SERVICES = [
  {
    href: '/drankkaart',
    icon: 'menu' as const,
    title: 'Drankkaart',
    body: 'Het volledige aanbod met de prijzen zoals ze aan de toog hangen.',
  },
  {
    href: "/fotos",
    icon: 'photo' as const,
    title: "Foto's",
    body: 'De fotogalerij van VTK, met de cantussen, TD’s en barnachten.',
  },
  {
    href: '/verhuur',
    icon: 'venue' as const,
    title: 'Zaal huren',
    body: 'Tarieven, voorwaarden en hoe je een datum vastlegt voor je eigen activiteit.',
  },
];

export default async function Home() {
  const [hours, status, board] = await Promise.all([getElixirHours(), readBarStatus(), getSpecialsBoard()]);
  const todayRow = hours.rows.find((row) => row.isToday);

  return (
    <>
      <section className="fakbar-hero fakbar-on-dark">
        <Image
          src="/elixir-wall.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="fakbar-hero-photo"
        />
        <div className="fakbar-hero-inner">
          <BarStatusPill isOpen={status?.isOpen ?? null} todayHours={todayRow?.hours ?? null} />
          <h1>&rsquo;t ElixIr</h1>
          <p className="fakbar-hero-lead">
            De faculteitsbar van Ingenieurswetenschappen in Leuven. Open tijdens het academiejaar, gerund door
            studenten, met een toog die iedereen van VTK kent.
          </p>
          <div className="fakbar-hero-actions">
            <Link href="/drankkaart" className="fakbar-btn fakbar-btn-primary">
              Bekijk de drankkaart
              <ElixirIcon name="arrow" className="h-4 w-4" />
            </Link>
            <Link href="/verhuur" className="fakbar-btn fakbar-btn-ghost">
              Zaal huren
            </Link>
          </div>
        </div>
      </section>

      <OpeningHoursBand hours={hours} />

      <div className="fakbar-page-content">
        {board ? (
          <div className="mb-10">
            <SpecialsBoard board={board} />
          </div>
        ) : null}

        <div className="fakbar-service-grid">
          {SERVICES.map((service) => (
            <Link key={service.href} href={service.href} className="fakbar-service-card">
              <div className="fakbar-service-icon">
                <ElixirIcon name={service.icon} className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-[var(--ink)]">{service.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{service.body}</p>
              <span className="mt-auto pt-5 text-sm font-medium text-[var(--ink)]">
                Bekijken <span aria-hidden>&rarr;</span>
              </span>
            </Link>
          ))}
        </div>

        <section className="mt-14 grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div className="fakbar-card fakbar-card-accent">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Iets organiseren in de fakbar?</h2>
            <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-[var(--body)]">
              Kringen, werkgroepen en verenigingen kunnen &rsquo;t ElixIr afhuren voor een cantus, een TD of een
              receptie. Er staat altijd een hoofdtapper van de fakbar mee achter de toog; de drank loopt via ons
              assortiment en wordt achteraf verrekend.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/verhuur" className="fakbar-btn fakbar-btn-primary">
                Voorwaarden en tarieven
              </Link>
              <a href="mailto:fakbar@vtk.be" className="fakbar-btn fakbar-btn-ghost">
                <ElixirIcon name="mail" className="h-4 w-4" />
                fakbar@vtk.be
              </a>
            </div>
          </div>

          <div className="fakbar-card">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Praktisch</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.07em] text-[var(--muted)]">Waar</dt>
                <dd className="mt-1 leading-relaxed text-[var(--body)]">
                  In de kelder van de VTK-burelen, Studentenwijk Arenberg, Heverlee.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.07em] text-[var(--muted)]">Contact</dt>
                <dd className="mt-1">
                  <a className="font-medium text-[var(--ink)] underline underline-offset-2" href="mailto:fakbar@vtk.be">
                    fakbar@vtk.be
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.07em] text-[var(--muted)]">Betalen</dt>
                <dd className="mt-1 leading-relaxed text-[var(--body)]">Cash en Bancontact aan de toog.</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * De live barstatus komt van de geluidsmeter (zie lib/bar-status.ts). Weten we
 * het niet, dan tonen we de uren van vandaag in plaats van te gokken: een
 * verouderde "open" is erger dan geen antwoord.
 */
function BarStatusPill({ isOpen, todayHours }: { isOpen: boolean | null; todayHours: string | null }) {
  const label =
    isOpen === true
      ? 'Nu open'
      : isOpen === false
        ? 'Nu gesloten'
        : todayHours
          ? `Vandaag ${todayHours}`
          : 'Vandaag gesloten';

  return (
    <p className="inline-flex items-center gap-2.5 rounded-full border border-white/25 bg-black/35 px-4 py-2 text-[13px] font-medium text-white backdrop-blur-sm">
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ background: isOpen === true ? 'var(--yellow)' : 'rgba(255,255,255,.45)' }}
      />
      {label}
    </p>
  );
}
