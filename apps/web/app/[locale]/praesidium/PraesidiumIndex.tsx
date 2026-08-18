"use client";

import { useEffect, useState } from "react";

export type IndexEntry = { slug: string; name: string; count: number };

/** Zelfde breekpunt als `.vtk-roster` in vtk-base.css. */
const WIDE = "(min-width: 901px)";

/** Hoogte waarop een postkop als "gelezen" telt: net onder de sticky sitekop. */
const READING_LINE = 140;

/**
 * De postenrail naast het rooster: elke post met haar bezetting als anker. Op een
 * smal scherm zit ze achter één knop (zoals de admin-nav), op een breed scherm
 * blijft ze staan en markeert ze de post die je aan het lezen bent.
 */
export default function PraesidiumIndex({
  entries,
  title,
  toggleLabel,
}: {
  entries: IndexEntry[];
  title: string;
  toggleLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // Scroll-spy: welke post staat er bovenaan in beeld? Zonder dit is de rail een
  // lijst links die niets zegt over waar je bent, en dat was precies wat de
  // pagina miste.
  useEffect(() => {
    const sections = entries
      .map((e) => document.getElementById(`post-${e.slug}`))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      // Onderaan de pagina is er geen scrollruimte meer over: de laatste post
      // haalt de leesregel nooit en zou anders nooit oplichten, ook niet nadat je
      // er in de rail zelf naartoe sprong.
      const atBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 4;
      if (atBottom) {
        setActive(sections[sections.length - 1].id.replace(/^post-/, ""));
        return;
      }
      // De laatste post die de leesregel (net onder de sticky sitekop) gepasseerd
      // is; staat er nog geen boven de lijn, dan is de eerste aan de beurt.
      const passed = sections.filter((el) => el.getBoundingClientRect().top <= READING_LINE);
      const current = passed.length > 0 ? passed[passed.length - 1] : sections[0];
      setActive(current.id.replace(/^post-/, ""));
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
  }, [entries]);

  // Van smal naar breed: het paneel zou anders als "open" blijven hangen terwijl
  // de rail daar sowieso zichtbaar is, en dan klopt aria-expanded niet meer.
  useEffect(() => {
    const media = window.matchMedia(WIDE);
    const sync = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <nav aria-label={title}>
      <button
        type="button"
        className="vtk-roster-toggle"
        aria-expanded={open}
        aria-controls="praesidium-index"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{toggleLabel}</span>
        <span aria-hidden>{open ? "⌃" : "⌄"}</span>
      </button>
      <div id="praesidium-index" className={"vtk-roster-index" + (open ? " is-open" : "")}>
        <div className="vtk-roster-index-title">{title}</div>
        {entries.map((e) => (
          <a
            key={e.slug}
            href={`#post-${e.slug}`}
            aria-current={active === e.slug ? "true" : undefined}
            onClick={() => setOpen(false)}
          >
            {e.name}
            <span>{e.count}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
