"use client";

import { useEffect, useState } from "react";
import type { OutlineItem } from "@/lib/pageOutline";

/**
 * Hoogte waarop een kopje als "gelezen" telt: net onder de sticky sitekop, en
 * net onder de `scroll-margin-top` van de kopjes zelf, zodat het kopje waar je
 * naartoe sprong ook meteen oplicht.
 */
const READING_LINE = 120;

/**
 * De inhoudsopgave naast de tekst. Geen kaart maar een register in de marge: een
 * haarlijn als geleider met een gele markering op het kopje dat je aan het lezen
 * bent. Zonder die markering is de rail een lijst die wel zegt wat er staat, maar
 * niet waar je bent.
 */
export function PageOutline({ items, label }: { items: OutlineItem[]; label: string }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      // Onderaan de pagina is er geen scrollruimte meer over: het laatste kopje
      // haalt de leesregel nooit en zou anders nooit oplichten, ook niet nadat je
      // er in de rail zelf naartoe sprong.
      const atBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 4;
      if (atBottom) {
        setActive(headings[headings.length - 1].id);
        return;
      }
      const passed = headings.filter((el) => el.getBoundingClientRect().top <= READING_LINE);
      setActive(passed.length > 0 ? passed[passed.length - 1].id : headings[0].id);
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [items]);

  return (
    <nav className="vtk-rail-box" aria-label={label}>
      <h2>{label}</h2>
      <ul>
        {items.map((item) => (
          <li key={`${item.id}-${item.level}`}>
            <a
              href={`#${item.id}`}
              className={item.level === 3 ? "is-sub" : undefined}
              aria-current={active === item.id ? "true" : undefined}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
