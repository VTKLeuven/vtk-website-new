export const metadata = {
  title: 'Verhuur',
  description: "Huur 't ElixIr voor je eigen feestje of activiteit.",
};

export default function VerhuurPage() {
  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow"><span>🏠</span><span>'t ElixIr</span></p>
          <h1>Zaal Huren</h1>
          <p className="fakbar-page-intro">
            Organiseer je eigen feestje of evenement in 't ElixIr.
          </p>
        </div>
      </div>

      <div className="fakbar-page-content">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[18px] border border-[--line] bg-[--surface] p-8">
            <div className="fakbar-section-head">
              <h2>Voorwaarden & Tarieven</h2>
            </div>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-[--muted]">Huurprijs</dt>
                <dd className="mt-1 font-semibold text-[--ink]">€250,00 <span className="text-sm font-normal text-[--muted]">(academiejaar 2025-2026)</span></dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-[--muted]">Tappers</dt>
                <dd className="mt-1 text-sm leading-relaxed text-[--body]">Er is steeds ten minste één ervaren Hoofdtapper van 't ElixIr aanwezig om het gebouw en de installatie te beheren.</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-[--muted]">Drank & Omzet</dt>
                <dd className="mt-1 text-sm leading-relaxed text-[--body]">Drank wordt afgenomen via ons standaard assortiment. De effectieve winst en eventuele kortingen worden verrekend op de eindfactuur.</dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col items-center justify-center gap-4 rounded-[18px] border border-[--line] bg-[--surface] p-8 text-center">
            <div className="fakbar-service-icon">
              <span className="text-2xl">✉️</span>
            </div>
            <h2 className="text-xl font-semibold text-[--ink]">Interesse in een datum?</h2>
            <p className="max-w-xs text-sm leading-relaxed text-[--muted]">
              Neem contact op met onze fakbarverantwoordelijke om een aanvraag in te dienen.
            </p>
            <a
              href="mailto:fakbar@vtk.be"
              className="inline-flex items-center gap-2 rounded-full bg-[--ink] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-80"
            >
              Contacteer Fakbar
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
