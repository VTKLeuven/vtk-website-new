import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { getLocale } from '@/lib/i18n';

/* Zonder dit bestand valt een 404 terug op het ingebouwde scherm van Next, en
   dat zet zijn eigen `body { background: #fff }` met zwarte tekst neer. In de
   donkere modus werd dat een wit blad onder een donkere kop, en het is meteen de
   enige pagina van de site zonder paginakop. */
export default async function NotFound() {
  const nl = (await getLocale()) === 'nl';

  return (
    <PageShell
      kicker="404"
      title={nl ? 'Deze pagina bestaat niet' : 'This page does not exist'}
      intro={
        nl
          ? 'Misschien is de link verouderd, of is de aanvraag intussen verwijderd.'
          : 'The link may be out of date, or the request may have been removed since.'
      }
    >
      <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 text-vtk-body">
        {nl ? 'Ga terug naar ' : 'Go back to '}
        <Link href="/" className="font-semibold text-vtk-ink underline decoration-vtk-yellow decoration-2 underline-offset-4">
          {nl ? 'de uitleendienst' : 'the equipment service'}
        </Link>
        {nl ? ', of mail ' : ', or mail '}
        <a href="mailto:logistiek@vtk.be" className="font-semibold text-vtk-ink underline decoration-vtk-yellow decoration-2 underline-offset-4">
          logistiek@vtk.be
        </a>
        .
      </p>
    </PageShell>
  );
}
