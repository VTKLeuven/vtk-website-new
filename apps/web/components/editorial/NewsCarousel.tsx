"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

/** Zo lang staat een rij tegels stil voor de carrousel zelf één verder schuift. */
const AUTOPLAY_MS = 15_000;

/**
 * De tegels naast het uitgelichte bericht in de Nieuws-band, als carrousel.
 *
 * Het uitgelichte bericht blijft staan; enkel de tegels schuiven, één per keer,
 * met een knop links en rechts, en om de vijftien seconden vanzelf. Na de
 * laatste begint hij weer vooraan.
 *
 * Het is een gewone horizontale scroller met snap-punten, geen eigen
 * animatie: zo swipet een telefoon er vanzelf door, en een toetsenbord dat naar
 * een tegel buiten beeld tabt, scrolt hem vanzelf in beeld. De tegels zelf komen
 * van de server; dit bestand doet enkel het schuiven en de wekker.
 *
 * Wat vanzelf beweegt, moet te stoppen zijn: er is een pauzeknop, de wekker
 * wacht zolang de muis erop staat, de focus erin zit of het tabblad verborgen
 * is, en wie in zijn systeem minder beweging vraagt, krijgt geen autoplay.
 * Passen alle tegels, dan is er niets te schuiven en vallen knoppen en wekker weg.
 */
export function NewsCarousel({
  items,
  labels,
}: {
  items: ReactNode[];
  labels: {
    region: string;
    prev: string;
    next: string;
    pause: string;
    play: string;
    /** "{n} van {total}", per tegel voor een schermlezer. */
    slide: string;
  };
}) {
  const track = useRef<HTMLOListElement>(null);
  const hold = useRef(false);
  const [scrollable, setScrollable] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  // Telt handmatige stappen, zodat de wekker na een klik opnieuw begint te tellen.
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setScrollable(el.scrollWidth > el.clientWidth + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const step = useCallback(
    (direction: 1 | -1) => {
      const el = track.current;
      const first = el?.querySelector("li");
      if (!el || !first) return;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const width = first.getBoundingClientRect().width + gap;
      const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      const atStart = el.scrollLeft <= 4;
      if (direction > 0 && atEnd) el.scrollTo({ left: 0, behavior });
      else if (direction < 0 && atStart) el.scrollTo({ left: el.scrollWidth, behavior });
      else el.scrollBy({ left: direction * width, behavior });
    },
    [reduced],
  );

  const autoplay = scrollable && !paused && !reduced;

  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => {
      if (document.hidden || hold.current) return;
      step(1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, step, nudge]);

  const go = (direction: 1 | -1) => {
    step(direction);
    setNudge((value) => value + 1);
  };

  return (
    <div
      className="news-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.region}
      onMouseEnter={() => (hold.current = true)}
      onMouseLeave={() => (hold.current = false)}
      onFocus={() => (hold.current = true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hold.current = false;
      }}
    >
      <ol ref={track} className="news-track" aria-live={autoplay ? "off" : "polite"}>
        {items.map((item, index) => (
          <li
            key={index}
            className="news-slide"
            aria-roledescription="slide"
            aria-label={labels.slide
              .replace("{n}", String(index + 1))
              .replace("{total}", String(items.length))}
          >
            {item}
          </li>
        ))}
      </ol>
      {scrollable ? (
        <>
          <button type="button" className="news-nav is-prev" onClick={() => go(-1)} aria-label={labels.prev} title={labels.prev}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="news-nav is-next" onClick={() => go(1)} aria-label={labels.next} title={labels.next}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          {reduced ? null : (
            <button
              type="button"
              className="news-pause"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
              {paused ? labels.play : labels.pause}
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
