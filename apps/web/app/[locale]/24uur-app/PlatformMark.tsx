import type { ReactNode } from "react";

import type { PlatformId } from "@/lib/urenloopApp/config";

/**
 * De merktekens van Windows, Apple en Ubuntu, plus het pijltje op de
 * downloadknop.
 *
 * Bewust niet in `components/ui/icons.tsx`: die set is de lijnstijl voor
 * rij-acties (bewerken, verwijderen, kopiëren) op 16px, en een merkteken volgt
 * de vorm van het merk en niet onze lijndikte. Ze staan hier omdat deze pagina
 * de enige plek is waar we een besturingssysteem moeten aanduiden.
 */

const MARKS: Record<PlatformId, ReactNode> = {
  windows: <path d="M3 5.6l7.4-1v7.1H3zM11.6 4.4L21 3v8.7h-9.4zM3 12.9h7.4V20L3 18.8zM11.6 12.9H21V21l-9.4-1.3z" />,
  mac: (
    <path d="M16.3 12.5c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.7 1.1 8.9.8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.2 1.2-2.4 1.2-2.5 0 0-2.4-.9-2.4-3.5zM14 5.8c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" />
  ),
  linux: (
    <>
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="4.9" r="2" />
      <circle cx="5.9" cy="15.6" r="2" />
      <circle cx="18.1" cy="15.6" r="2" />
    </>
  ),
};

export function PlatformMark({ id }: { id: PlatformId }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {MARKS[id]}
    </svg>
  );
}

export function DownloadArrow() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
    </svg>
  );
}
