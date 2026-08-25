import Image from 'next/image';
import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="fakbar-footer">
      <div className="fakbar-page-head-inner py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" aria-label="'t ElixIr startpagina">
            <Image
              src="/elixir-logo.png"
              alt="'t ElixIr"
              width={120}
              height={120}
              className="h-8 w-auto object-contain opacity-60"
            />
          </Link>
          <nav className="flex gap-6 text-sm text-white/50">
            <Link href="/drankkaart" className="hover:text-white/80 transition">Drankkaart</Link>
            <Link href="/fotos" className="hover:text-white/80 transition">Foto's</Link>
            <Link href="/verhuur" className="hover:text-white/80 transition">Verhuur</Link>
          </nav>
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} 't ElixIr · VTK Leuven
          </p>
        </div>
      </div>
    </footer>
  );
}
