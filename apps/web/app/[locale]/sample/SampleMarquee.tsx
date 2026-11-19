"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";

const MARQUEE_ITEMS = [
  "VTK sample page",
  "Existing classes only",
  "Manual development reference",
] as const;

export function SampleMarquee({ nl }: { nl: boolean }) {
  const [paused, setPaused] = useState(false);
  const pauseLabel = nl ? "Lichtkrant pauzeren" : "Pause marquee";
  const playLabel = nl ? "Lichtkrant afspelen" : "Play marquee";

  return (
    <div className="marquee relative flex items-center" data-paused={paused ? "true" : undefined}>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="marquee-track">
          <span className="inline-flex shrink-0 items-center gap-8 pr-8">
            {MARQUEE_ITEMS.map((item) => (
              <span key={item} className="inline-flex items-center gap-8">
                <span>{item}</span>
                <span className="star" aria-hidden="true">
                  *
                </span>
              </span>
            ))}
          </span>
          <span className="inline-flex shrink-0 items-center gap-8 pr-8" aria-hidden="true">
            {MARQUEE_ITEMS.map((item) => (
              <span key={`dup-${item}`} className="inline-flex items-center gap-8">
                <span>{item}</span>
                <span className="star">*</span>
              </span>
            ))}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((prev) => !prev)}
        aria-pressed={paused}
        aria-label={paused ? playLabel : pauseLabel}
        className="relative z-10 mr-3 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-vtk-ink/30 bg-white px-3 py-1 text-xs font-semibold text-vtk-ink hover:border-vtk-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-vtk-ink"
      >
        {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
        <span>{paused ? (nl ? "Afspelen" : "Play") : nl ? "Pauzeren" : "Pause"}</span>
      </button>
    </div>
  );
}
