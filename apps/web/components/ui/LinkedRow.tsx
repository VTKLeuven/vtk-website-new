"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * Wat in de rij zelf iets doet, houdt de klik: die hoort niet naar de rij te
 * gaan. `data-row-action` is voor een bediening met rand rond haar control (een
 * pil met een select erin), zodat ook een klik op die rand niet wegnavigeert.
 */
const INTERACTIVE =
  "a, button, input, select, textarea, label, summary, [role='button'], [data-row-action]";

/**
 * Een tabelrij die in haar geheel naar één plek leidt.
 *
 * Dit was een `::after` over de rijlink, gepositioneerd tegen de `<tr>`. Safari
 * maakte van een `<tr>` lange tijd geen positie-anker, dus daar ankerde het vlak
 * van elke rij op de tabel en lag dat van de laatste rij over alle andere: wie
 * de eerste rij aanwees, kreeg de tweede. Een klik op de rij zelf hangt van geen
 * enkele layoutregel af.
 *
 * De link in de rij blijft staan: die is de tabstop voor het toetsenbord en het
 * doel voor een screenreader, en een cmd-klik daarop opent gewoon een tabblad.
 */
export function LinkedRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function onClick(event: MouseEvent<HTMLTableRowElement>) {
    const target = event.target as Element;
    // React laat een klik uit een portaal (een modal die de rij opent) ook langs
    // de rij bubbelen; enkel wat echt in de rij staat, telt.
    if (!event.currentTarget.contains(target)) return;
    if (target.closest(INTERACTIVE)) return;
    // Wie tekst selecteert, wil kopiëren en niet wegnavigeren.
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  return (
    <tr className={className} onClick={onClick}>
      {children}
    </tr>
  );
}
