import Link from 'next/link';
import { LogisticsIcon } from '@/components/logistics-icon';
import { describeLink, linkify, type LinkKind } from '@/lib/linkify';

/**
 * Vrije tekst waarin de adressen aanklikbaar zijn (zie `lib/linkify.ts`).
 *
 * Gebruikt voor de lading en de nota's van een rit: daar staat de link naar de
 * materiaallijst in, en die hoort één tik weg te zijn en niet overgetypt.
 * Een extern adres opent in een nieuw tabblad; een pad op deze site blijft in
 * hetzelfde venster, want dat is gewoon navigeren binnen Logistiek.
 *
 * **Een link staat er als knopje met wat het is, nooit als lang adres.** In de
 * lading staat bijna altijd een materiaallijst (een Google Sheet, een Doc, een
 * pdf), en dat adres voluit vulde op een telefoon drie regels. Nu staat er
 * "Google Sheet", "materiaallijst.pdf" of "OneDrive"; een Google Sheet krijgt
 * het groene raster van Sheets zodat je hem herkent. Het volledige adres staat
 * in de tooltip. Welk label bij welk adres hoort: `describeLink`.
 */
export function LinkedText({ text, locale = 'nl' }: { text: string; locale?: 'nl' | 'en' }) {
  return (
    <>
      {linkify(text).map((chunk, index) => {
        if (chunk.kind === 'text') return <span key={index}>{chunk.value}</span>;
        const { kind, label } = describeLink(chunk.href, locale);
        const content = (
          <>
            <KindIcon kind={kind} />
            <span>{label}</span>
            {chunk.internal ? null : (
              <LogisticsIcon name="external" className="h-3 w-3 shrink-0 text-vtk-muted" strokeWidth={2} />
            )}
          </>
        );
        return chunk.internal ? (
          <Link key={index} href={chunk.href} title={chunk.href} className={CHIP}>
            {content}
          </Link>
        ) : (
          <a key={index} href={chunk.href} title={chunk.href} target="_blank" rel="noreferrer noopener" className={CHIP}>
            {content}
          </a>
        );
      })}
    </>
  );
}

const CHIP =
  'mx-0.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-vtk-navy/15 bg-vtk-surface py-0.5 pr-2.5 pl-2 align-middle text-[13px] leading-5 font-semibold text-vtk-navy transition hover:border-vtk-navy/40';

function KindIcon({ kind }: { kind: LinkKind }) {
  if (kind === 'sheet') {
    // Het raster van een rekenblad, in het groen van Google Sheets (`--sheets`).
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" style={{ color: 'var(--sheets)' }}>
        <rect x="4" y="3" width="16" height="18" rx="2.5" fill="currentColor" />
        <path d="M7.5 9.5h9M7.5 13h9M7.5 16.5h9M12 9.5v7" stroke="var(--on-sheets)" strokeWidth="1.6" fill="none" />
      </svg>
    );
  }
  if (kind === 'request') return <LogisticsIcon name="request" className="h-4 w-4 shrink-0" strokeWidth={2} />;
  if (kind === 'doc' || kind === 'slides' || kind === 'form' || kind === 'drive' || kind === 'file') {
    return <LogisticsIcon name="text" className="h-4 w-4 shrink-0" strokeWidth={2} />;
  }
  return null;
}
