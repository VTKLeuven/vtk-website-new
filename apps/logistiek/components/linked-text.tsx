import Link from 'next/link';
import { linkify } from '@/lib/linkify';

/**
 * Vrije tekst waarin de adressen aanklikbaar zijn (zie `lib/linkify.ts`).
 *
 * Gebruikt voor de lading en de nota's van een rit: daar staat de link naar de
 * materiaallijst in, en die hoort één tik weg te zijn en niet overgetypt.
 * Een extern adres opent in een nieuw tabblad; een pad op deze site blijft in
 * hetzelfde venster, want dat is gewoon navigeren binnen Logistiek.
 */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((chunk, index) =>
        chunk.kind === 'text' ? (
          <span key={index}>{chunk.value}</span>
        ) : chunk.internal ? (
          <Link
            key={index}
            href={chunk.href}
            className="font-medium text-vtk-navy underline decoration-vtk-yellow underline-offset-2"
          >
            {chunk.value}
          </Link>
        ) : (
          <a
            key={index}
            href={chunk.href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-vtk-navy underline decoration-vtk-yellow underline-offset-2"
          >
            {chunk.value}
          </a>
        )
      )}
    </>
  );
}
