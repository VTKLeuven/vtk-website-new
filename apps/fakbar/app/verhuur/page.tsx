import type { Metadata } from 'next';
import { ElixirIcon } from '@/components/elixir-icon';
import { formatEuro } from '@/lib/fakbar-format';
import { getRentalSettings } from '@/lib/rental-settings';

export const metadata: Metadata = {
  title: 'Verhuur',
  description: "Tarieven en voorwaarden om 't ElixIr af te huren voor je eigen activiteit.",
};

export const revalidate = 300;

export default async function VerhuurPage() {
  const rental = await getRentalSettings();
  const subject = encodeURIComponent("Aanvraag verhuur 't ElixIr");

  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow">&rsquo;t ElixIr</p>
          <h1>Zaal huren</h1>
          <p className="fakbar-page-intro">
            Kringen, werkgroepen en verenigingen kunnen &rsquo;t ElixIr afhuren voor een cantus, een TD of een
            receptie.
          </p>
        </div>
      </div>

      <div className="fakbar-page-content">
        <div className="grid gap-5 md:grid-cols-[1.5fr_1fr] md:items-start">
          <div className="fakbar-card">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--line)] pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.07em] text-[var(--muted)]">Huurprijs</p>
                <p className="mt-1 text-3xl font-bold tracking-[-0.03em] tabular-nums text-[var(--ink)]">
                  {formatEuro(rental.feeCents)}
                </p>
              </div>
              {rental.period ? <span className="fakbar-badge">{rental.period}</span> : null}
            </div>

            <dl className="mt-6 space-y-5">
              {rental.conditions.map((condition) => (
                <div key={condition.title}>
                  <dt className="text-xs font-bold uppercase tracking-[0.07em] text-[var(--muted)]">{condition.title}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-[var(--body)]">{condition.body}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="fakbar-card fakbar-card-accent">
            <div className="fakbar-service-icon">
              <ElixirIcon name="mail" className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-[var(--ink)]">Een datum vastleggen</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--body)]">
              Mail ons met je vereniging, de gewenste datum en het soort activiteit. We laten weten of die datum nog
              vrij is en wat er praktisch bij komt kijken.
            </p>
            <a className="fakbar-btn fakbar-btn-primary mt-5" href={`mailto:${rental.contactEmail}?subject=${subject}`}>
              Aanvraag sturen
              <ElixirIcon name="arrow" className="h-4 w-4" />
            </a>
            <p className="mt-3 text-xs text-[var(--muted)]">{rental.contactEmail}</p>
          </div>
        </div>

        <div className="fakbar-card mt-5">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Wat we van jou verwachten</h2>
          <ul className="mt-3 grid gap-2.5 text-sm leading-relaxed text-[var(--body)] sm:grid-cols-2">
            {[
              'Eén aanspreekpunt dat de hele avond aanwezig is.',
              'Een realistische schatting van het aantal mensen, zodat we genoeg vaten klaarzetten.',
              'De zaal wordt achtergelaten zoals ze gevonden werd.',
              'Afspraken over geluid en sluitingsuur worden gevolgd; de bar heeft een geluidsmeter.',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <ElixirIcon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--yellow-dark)]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
