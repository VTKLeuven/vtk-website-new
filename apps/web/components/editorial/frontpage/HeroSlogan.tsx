"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { DisplaySlogan } from "@/lib/slogans";

function SloganContent({ slogan }: { slogan: DisplaySlogan }) {
  const { title, accent, tail } = slogan;

  if (tail) {
    return (
      <>
        {title ? `${title} ` : null}
        {accent ? <span className="serif">{accent}</span> : null}
        <br />
        {tail}
      </>
    );
  }

  return (
    <>
      {title ? (
        <>
          {title}
          {accent ? <br /> : null}
        </>
      ) : null}
      {accent ? <span className="serif">{accent}</span> : null}
    </>
  );
}

export function HeroSlogan({
  slogans,
  intervalSeconds = 8,
  initialIndex = 0,
}: {
  slogans: DisplaySlogan[];
  intervalSeconds?: number;
  initialIndex?: number;
}) {
  const [index, setIndex] = useState(() => {
    if (slogans.length === 0) return 0;
    return Math.max(0, Math.min(slogans.length - 1, initialIndex));
  });
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (slogans.length <= 1 || intervalSeconds <= 0) return;

    // Respecteer gebruikersvoorkeur voor minder beweging
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const intervalMs = Math.max(3000, intervalSeconds * 1000);

    const timer = setInterval(() => {
      // Pauzeer als het tabblad niet zichtbaar is
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      if (prefersReducedMotion) {
        setIndex((prev) => (prev + 1) % slogans.length);
        return;
      }

      setIsFading(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % slogans.length);
        setIsFading(false);
      }, 320);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [slogans.length, intervalSeconds]);

  const currentSlogan = slogans[index] ?? slogans[0];
  if (!currentSlogan) return null;

  const style: CSSProperties = {
    display: "inline-block",
    transition: "opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1), transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)",
    opacity: isFading ? 0 : 1,
    transform: isFading ? "translateY(-6px)" : "translateY(0)",
  };

  return (
    <h1>
      <span className="home-hero-slogan" style={style}>
        <SloganContent slogan={currentSlogan} />
      </span>
    </h1>
  );
}
