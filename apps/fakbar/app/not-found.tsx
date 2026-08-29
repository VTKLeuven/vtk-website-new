import Link from 'next/link';

/**
 * Een adres dat niet bestaat, in de vormtaal van de site in plaats van in de
 * kale standaardpagina van Next. Een album dat verwijderd is, is hier het
 * gewone geval: `/fotos/[slug]` roept `notFound()` aan.
 */
export default function NotFound() {
  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <h1>Deze pagina bestaat niet</h1>
          <p className="fakbar-page-intro">Het adres klopt niet, of wat er stond is intussen weg.</p>
        </div>
      </div>

      <div className="fakbar-page-content">
        <div className="fakbar-empty">
          <h3>Verder kijken</h3>
          <p>Misschien vind je wat je zocht op een van deze pagina&rsquo;s.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/" className="fakbar-btn fakbar-btn-primary">
              Startpagina
            </Link>
            <Link href="/fotos" className="fakbar-btn fakbar-btn-ghost">
              Foto&rsquo;s
            </Link>
            <Link href="/drankkaart" className="fakbar-btn fakbar-btn-ghost">
              Drankkaart
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
