"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { nextSloganIndex, type DisplaySlogan, type SloganSize } from "@/lib/slogans";

/**
 * Twee voorkeuren van buiten React: minder beweging, en een verborgen tabblad.
 *
 * Via `useSyncExternalStore` en niet via een effect dat meteen `setState` doet:
 * de server heeft geen van beide en moet `false` renderen, en de browser mag er
 * geen tweede render voor nodig hebben.
 */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const off = () => false;

function Lines({ slogan }: { slogan: DisplaySlogan }): ReactNode {
  return slogan.lines.map((line, lineIdx) => (
    <span className="hero-slogan-line" key={lineIdx}>
      {line.map((segment, idx) =>
        segment.accent ? (
          <span className="serif" key={idx}>
            {segment.text}
          </span>
        ) : (
          <span key={idx}>{segment.text}</span>
        ),
      )}
    </span>
  ));
}

/**
 * De roterende hero-titel.
 *
 * De `h1` draagt één slogan, zoals een titel hoort te doen. Daarachter staat een
 * onzichtbare stapel met alle slogans in dezelfde rastercel: die bepaalt de
 * hoogte, zodat de knoppen en de agenda eronder niet elke acht seconden tot
 * tachtig pixels op en neer springen. De vorige versie had die stapel niet en
 * liet de halve hero meebewegen bij elke wissel.
 *
 * De reeks begint bij de begroeting (als er een is) en loopt daarna rond over de
 * gewone slogans; de begroeting komt niet meer terug. Zie lib/slogans.ts.
 *
 * De rotatie stopt bij hover, bij focus in de hero, bij een verborgen tabblad,
 * bij `prefers-reduced-motion` en met de pauzeknop. Die knop is er omdat WCAG
 * 2.2.2 vraagt dat inhoud die vanzelf beweegt te stoppen is; hij staat rechts
 * naast het bovenschrift, waar niets anders staat, en verschijnt bij hover of
 * focus.
 */
export function HeroSlogan({
  slogans,
  openerCount = 0,
  intervalSeconds = 8,
  size = "l",
  labels,
}: {
  slogans: DisplaySlogan[];
  /** 1 wanneer `slogans[0]` een begroeting is: die opent en valt dan weg. */
  openerCount?: 0 | 1;
  intervalSeconds?: number;
  /** De tekengrootte van de hele reeks; zie `sloganSizeTier`. */
  size?: SloganSize;
  labels: { pause: string; play: string };
}) {
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [held, setHeld] = useState(false);
  const region = useRef<HTMLDivElement>(null);

  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_MOTION).matches,
    off,
  );
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "hidden",
    off,
  );

  const paused = stopped || held || reduced || hidden;
  const next = nextSloganIndex(index, slogans.length, openerCount);
  const rotates = slogans.length > 1 && intervalSeconds > 0 && next !== index;

  // Eén timer per stap in plaats van één interval voor alles: hij herstart bij
  // elke wissel, wordt bij pauze opgeruimd, en er blijft nooit een afgelopen
  // fade-timeout achter op een component die al weg is.
  useEffect(() => {
    if (paused || !rotates) return;
    const timer = setTimeout(() => setIndex(next), Math.max(3000, intervalSeconds * 1000));
    return () => clearTimeout(timer);
  }, [paused, rotates, next, intervalSeconds]);

  if (slogans.length === 0) return null;

  const current = slogans[Math.min(index, slogans.length - 1)]!;
  const showToggle = slogans.length > 1 && intervalSeconds > 0 && !reduced;

  return (
    <div
      className="hero-slogans"
      data-size={size}
      ref={region}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!region.current?.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      {/* Enkel voor de hoogte: onzichtbaar, buiten de toegankelijkheidsboom, en
          niet aanklikbaar. */}
      <div className="hero-slogan-sizer" aria-hidden="true">
        {slogans.map((slogan) => (
          <span className="hero-slogan" key={slogan.id}>
            <Lines slogan={slogan} />
          </span>
        ))}
      </div>

      <h1>
        {/* De sleutel is de slogan: bij een wissel maakt React een nieuw element
            en speelt de CSS-animatie zichzelf af. Geen timers voor de fade. */}
        <span
          className="hero-slogan"
          key={current.id}
          data-animate={reduced || slogans.length <= 1 ? "false" : "true"}
        >
          <Lines slogan={current} />
        </span>
      </h1>

      {showToggle ? (
        <button
          type="button"
          className="hero-slogan-toggle"
          data-stopped={stopped ? "true" : "false"}
          onClick={() => setStopped((prev) => !prev)}
          title={stopped ? labels.play : labels.pause}
          aria-label={stopped ? labels.play : labels.pause}
        >
          {stopped ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}
