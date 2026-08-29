import Image from 'next/image';
import Link from 'next/link';

const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';

export function SiteFooter() {
  return (
    <footer className="fakbar-footer">
      <div className="fakbar-page-head-inner !pb-8 !pt-12">
        <div className="grid gap-9 sm:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <Link href="/" aria-label="'t ElixIr, startpagina" className="inline-block">
              <Image
                src="/elixir-logo.png"
                alt="'t ElixIr"
                width={240}
                height={240}
                className="h-9 w-auto object-contain"
              />
            </Link>
            <p className="mt-4 max-w-[34ch] text-sm leading-relaxed">
              De faculteitsbar van Ingenieurswetenschappen, gerund door VTK Leuven.
            </p>
          </div>

          <nav aria-label="Fakbar">
            <h2 className="text-xs font-bold uppercase tracking-[0.09em] text-white/45">Fakbar</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/drankkaart">Drankkaart</Link></li>
              <li><Link href="/openingsuren">Openingsuren</Link></li>
              <li><Link href="/fotos">Foto&rsquo;s</Link></li>
              <li><Link href="/verhuur">Zaal huren</Link></li>
            </ul>
          </nav>

          <nav aria-label="VTK">
            <h2 className="text-xs font-bold uppercase tracking-[0.09em] text-white/45">VTK</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href={MAIN_URL}>vtk.be</a></li>
              <li><a href={`${MAIN_URL}/kalender`}>Kalender</a></li>
              <li><a href={`${MAIN_URL}/praesidium`}>Praesidium</a></li>
              <li><a href="mailto:fakbar@vtk.be">fakbar@vtk.be</a></li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} VTK Leuven vzw</p>
          <p>Drink met mate. Geen alcohol onder de 16.</p>
        </div>
      </div>
    </footer>
  );
}
