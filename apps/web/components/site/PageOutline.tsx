"use client";

import { useEffect, useMemo, useState } from "react";
import { activeAnchor, type OutlineItem } from "@/lib/pageOutline";

/**
 * Hoogte waarop een kopje als "gelezen" telt: net onder de sticky sitekop, en
 * net onder de `scroll-margin-top` van de kopjes zelf, zodat het kopje waar je
 * naartoe sprong ook meteen oplicht.
 */
const READING_LINE = 120;

/** Het formulier dat op deze pagina staat, als er een gekoppeld is. */
export type OutlineForm = {
  /** Het anker van het paneel in de tekst. */
  id: string;
  label: string;
  /** De dringendste stand van zaken: "Sluit over 3 dagen", "Volzet", ... */
  meta: string | null;
  /** Invullen kan nu niet; de knop blijft staan maar zonder gele nadruk. */
  closed: boolean;
};

/**
 * De inhoudsopgave naast de tekst. Geen kaart maar een register in de marge: een
 * haarlijn als geleider met een gele markering op het kopje dat je aan het lezen
 * bent. Zonder die markering is de rail een lijst die wel zegt wat er staat, maar
 * niet waar je bent.
 *
 * Staat er een formulier op de pagina, dan krijgt dat geen gewone regel maar een
 * gele knop die de haarlijn doorbreekt, met de deadline eronder. Dat er iets in
 * te vullen valt, is niet zomaar een tussentitel: het is de reden dat iemand
 * deze pagina misschien wel opende.
 */
export function PageOutline({
  items,
  label,
  form = null,
  formIndex = 0,
}: {
  items: OutlineItem[];
  label: string;
  form?: OutlineForm | null;
  /** Voor hoeveel kopjes het formulier in de lijst komt te staan. */
  formIndex?: number;
}) {
  const [active, setActive] = useState<string | null>(null);

  // De volgorde waarin de ankers op de pagina staan; het formulier telt mee,
  // anders licht de knop nooit op terwijl je er middenin staat.
  const anchorIds = useMemo(() => {
    const ids = items.map((item) => item.id);
    if (form) ids.splice(Math.min(formIndex, ids.length), 0, form.id);
    return ids;
  }, [items, form, formIndex]);

  useEffect(() => {
    const headings = anchorIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      setActive(
        activeAnchor(
          headings.map((el) => ({
            id: el.id,
            top: el.getBoundingClientRect().top + window.scrollY,
          })),
          {
            scrolled: Math.min(window.scrollY, maxScroll),
            maxScroll,
            readingLine: READING_LINE,
          }
        )
      );
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
  }, [anchorIds]);

  const formEntry = form ? (
    <li key="vtk-rail-form">
      <a
        className="vtk-rail-form"
        href={`#${form.id}`}
        data-state={form.closed ? "closed" : "open"}
        aria-current={active === form.id ? "true" : undefined}
      >
        <FormGlyph />
        <span className="vtk-rail-form-text">
          <span className="vtk-rail-form-label">{form.label}</span>
          {form.meta ? <span className="vtk-rail-form-meta">{form.meta}</span> : null}
        </span>
      </a>
    </li>
  ) : null;

  const entries = items.map((item) => (
    <li key={`${item.id}-${item.level}`}>
      <a
        href={`#${item.id}`}
        className={item.level === 3 ? "is-sub" : undefined}
        aria-current={active === item.id ? "true" : undefined}
      >
        {item.text}
      </a>
    </li>
  ));
  if (formEntry) entries.splice(Math.min(formIndex, entries.length), 0, formEntry);

  return (
    <nav className="vtk-rail-box" aria-label={label}>
      <h2>{label}</h2>
      <ul>{entries}</ul>
    </nav>
  );
}

/** Een blad met regels: het formulier, en niet zomaar de zoveelste tussentitel. */
function FormGlyph() {
  return (
    <svg
      className="vtk-rail-form-icon"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2.5"
        y="1.75"
        width="11"
        height="12.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
