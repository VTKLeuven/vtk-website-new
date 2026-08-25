import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: "'t ElixIr — De gezelligste fakbar van Leuven",
  description: "Bekijk onze drankkaart, herbeleef de sfeer via onze fotogalerij of huur onze zaal.",
};

export default function Home() {
  return (
    <>
      {/* Hero */}
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow">
            <span>🍺</span>
            <span>Fakbar VTK Leuven</span>
          </p>
          <h1>'t ElixIr</h1>
          <p className="fakbar-page-intro">
            De gezelligste fakbar van Leuven. Welkom op ons platform: bekijk ons drankaanbod,
            herbeleef de sfeer via onze fotogalerij of informeer je over verhuur.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/drankkaart"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:bg-white/90"
            >
              Bekijk Drankkaart
            </Link>
            <Link
              href="/verhuur"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/60"
            >
              Zaal huren
            </Link>
          </div>
        </div>
      </div>

      {/* Service cards */}
      <div className="fakbar-page-content">
        <div className="fakbar-service-grid">
          <Link href="/drankkaart" className="fakbar-service-card group">
            <div className="fakbar-service-icon mb-4">
              <span className="text-xl">🍺</span>
            </div>
            <h3 className="text-lg font-semibold text-[--ink] group-hover:text-black">
              Drankkaart
            </h3>
            <p className="mt-2 text-sm text-[--muted] leading-relaxed">
              Altijd de meest recente dranken en prijzen binnen handbereik.
            </p>
          </Link>

          <Link href="/fotos" className="fakbar-service-card group">
            <div className="fakbar-service-icon mb-4">
              <span className="text-xl">📸</span>
            </div>
            <h3 className="text-lg font-semibold text-[--ink] group-hover:text-black">
              Feestfoto's
            </h3>
            <p className="mt-2 text-sm text-[--muted] leading-relaxed">
              Exclusieve galerij van alle avonden en evenementen in 't ElixIr.
            </p>
          </Link>

          <Link href="/verhuur" className="fakbar-service-card group">
            <div className="fakbar-service-icon mb-4">
              <span className="text-xl">🏠</span>
            </div>
            <h3 className="text-lg font-semibold text-[--ink] group-hover:text-black">
              Zaal Huren
            </h3>
            <p className="mt-2 text-sm text-[--muted] leading-relaxed">
              Informatie over tarieven, voorwaarden en reservaties voor je evenement.
            </p>
          </Link>
        </div>
      </div>
    </>
  );
}
