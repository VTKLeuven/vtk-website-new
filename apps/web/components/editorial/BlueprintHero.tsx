import type { CSSProperties } from "react";
import Link from "@/components/ui/Link";
import { ArrowRightIcon } from "@/components/ui/icons";
import { DEFAULT_HERO_DESIGN, heroAnimationTempo, type HeroDesignSetting } from "@/lib/home/heroDesign";
import type { Locale } from "@vtk/i18n";
import { HeroConstruction, constructionVars } from "./HeroConstruction";
import { HeroEventCards, type HeroEvents } from "./HeroEventCards";
import { DESTINATIONS, DestinationLink, destinationText } from "./HeroDestinations";

/**
 * Omtrek van het VTK-logo in de hero-coördinaten (1168 x 520),
 * getransformeerd van apps/web/public/vtk-logo.png via:
 * x_hero = 330 + x * (520 / 1152)
 * y_hero = 96 + y * (520 / 1152)
 * Het pad begint bij de top van de K, zodat de stroke-dashoffset animatie daar vertrekt.
 */
const LOGO_D =
  "M741.67 96.00L659.51 163.26L659.51 272.94L657.71 274.75L651.84 277.46L648.23 277.91L647.78 278.36L645.52 278.36L645.07 278.81L640.10 278.81L639.65 279.26L623.85 279.26L623.40 278.81L620.69 278.81L616.18 277.46L611.22 274.75L605.35 268.88L602.64 264.82L599.93 259.40L599.93 258.50L597.67 253.99L596.77 250.38L595.87 249.02L596.32 248.57L627.47 248.57L627.47 175.44L596.32 175.44L595.87 174.99L595.87 114.51L425.24 248.57L424.79 248.12L424.79 175.44L330.00 248.57L330.00 388.95L424.79 388.95L494.31 322.15L496.11 323.50L502.43 331.62L518.23 346.97L531.77 357.35L547.12 366.83L564.72 375.41L585.03 382.63L586.39 382.63L588.19 383.53L589.55 383.53L595.42 385.34L597.22 385.34L599.48 386.24L601.74 386.24L602.19 386.69L606.70 387.15L607.15 387.60L609.86 387.60L610.31 388.05L618.89 388.50L619.34 388.95L637.40 388.95L637.85 388.50L643.26 388.50L643.72 388.05L647.33 388.05L647.78 387.60L656.35 386.69L656.81 386.24L664.93 384.89L665.38 384.44L670.35 383.53L672.15 382.63L673.51 382.63L675.31 381.73L676.67 381.73L687.05 378.12L688.40 377.22L690.66 376.76L692.92 375.41L693.82 375.41L699.24 372.70L700.14 372.70L711.88 366.83L712.78 365.93L715.94 364.58L729.48 356.45L743.92 346.52L767.40 328.01L849.55 388.95L849.55 276.10L821.11 252.63L832.85 233.67L839.62 220.13L839.62 219.23L843.68 210.20L847.29 199.37L847.29 198.01L848.65 193.95L848.65 192.15L849.10 191.69L849.10 188.53L849.55 188.08L849.55 175.44L767.40 175.44L766.49 183.57L766.04 184.02L766.04 185.83L765.59 186.28L764.69 191.24L761.08 199.82L756.11 207.04L751.15 212.01L743.47 217.42L742.12 217.88L741.67 217.42Z";

const NODES = [
  { cx: 424.8, cy: 176.3, delay: "1.00s" },
  { cx: 330.0, cy: 248.6, delay: "1.05s" },
  { cx: 330.0, cy: 389.4, delay: "1.10s" },
  { cx: 596.3, cy: 114.1, delay: "1.15s" },
  { cx: 741.7, cy: 96.9, delay: "1.20s" },
  { cx: 849.1, cy: 175.0, delay: "1.25s" },
  { cx: 850.0, cy: 275.7, delay: "1.30s" },
  { cx: 627.9, cy: 389.4, delay: "1.35s" },
  { cx: 850.0, cy: 389.4, delay: "1.40s" },
];

const LEADS = [
  { d: "M424.8 176.3 L380 140 L272 140", delay: "1.20s" },
  { d: "M330 248.6 L272 248.6", delay: "1.32s" },
  { d: "M330 389.4 L272 389.4", delay: "1.44s" },
  { d: "M741.7 96.9 L790 108 L896 108", delay: "1.56s" },
  { d: "M849.1 175 L872 220 L896 220", delay: "1.68s" },
  { d: "M850 389.4 L896 389.4", delay: "1.80s" },
];

/**
 * G1 Wegwijzer: homepage hero als technische bouwtekening van het VTK-logo.
 * Volledige breedte navy band met CSS-geanimeerde lijntekening en wegwijzers.
 *
 * Zonder evenementen is dit enkel de band. Met evenementen eindigt de gele streep
 * niet meer onder deze sectie maar in `.g-events` erna, want de affiches hangen
 * eroverheen.
 */
export function BlueprintHero({
  locale,
  events,
  design = DEFAULT_HERO_DESIGN,
  preview = false,
}: {
  locale: Locale;
  events?: HeroEvents | null;
  /** Gekozen in /admin/home; zonder keuze de tekening van hieronder. */
  design?: HeroDesignSetting;
  /** In de voorvertoning van de admin: de pagina heeft daar al een eigen `h1`. */
  preview?: boolean;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const hasEvents = Boolean(events && events.cards.length > 0);
  const construction = design.design === "construction";
  const tempo = heroAnimationTempo(design);
  const className = [
    "vtk-blueprint-hero",
    hasEvents ? "has-events" : "",
    construction ? "k-hero" : "",
    construction && !design.pattern ? "no-pattern" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
    <section
      className={className}
      style={
        {
          "--tempo": tempo,
          ...(construction ? constructionVars(design) : undefined),
        } as CSSProperties
      }
      data-hover={design.hoverColor}
      aria-label="Hero"
    >
      {preview ? null : <h1 className="sr-only">Vlaamse Technische Kring</h1>}

      {construction ? (
        <HeroConstruction setting={design} nl={nl} base={base} />
      ) : (
      <div className="g-box">
        <svg viewBox="0 0 1168 520" aria-hidden="true">
          <defs>
            <pattern
              id="gh-blueprint-hero"
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="7"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeOpacity="0.42"
              />
            </pattern>
            <marker
              id="ga-blueprint-hero"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              orient="auto-start-reverse"
            >
              <path d="M1 1.5 L9 5 L1 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </marker>
          </defs>

          {/* Hulplijnen en constructiecirkel */}
          <g className="g-fade" style={{ "--d": "0.05s" } as CSSProperties}>
            <path className="g-ln dash" d="M250 389.4 H930" />
            <path className="g-ln dash" d="M540 96.9 H930" />
            <path className="g-ln dash" d="M380 175 H930" />
            <path className="g-ln dash" d="M330 70 V449.4" />
            <path className="g-ln dash" d="M850 70 V449.4" />
            <circle className="g-ln dash" cx="628" cy="272" r="150" />
          </g>

          {/* Grote cirkel en diagonaal die zich tekenen */}
          <circle
            className="g-ln faint g-draw"
            pathLength={1}
            style={{ "--d": "0.15s" } as CSSProperties}
            cx="590"
            cy="246"
            r="236"
          />
          <path
            className="g-ln faint g-draw"
            pathLength={1}
            style={{ "--d": "0.3s" } as CSSProperties}
            d="M150 470 L1010 40"
          />

          {/* Gearceerd logo veegt binnen met clip-path wipe */}
          <g className="g-wipe" style={{ "--d": "0.6s" } as CSSProperties}>
            <path className="c-hatch" d={LOGO_D} fill="url(#gh-blueprint-hero)" />
          </g>

          {/* Witte omtrek tekent zich in één doorlopende lijn rond het logo */}
          <path
            className="c-out g-draw"
            pathLength={1}
            d={LOGO_D}
            style={{ "--d": "0.3s", strokeWidth: "1.3px", strokeOpacity: 0.92 } as CSSProperties}
          />

          {/* Maatlijn boven het logo */}
          <g className="g-dimgrp g-fade" style={{ "--d": "1.1s" } as CSSProperties}>
            <path className="g-ln dim" d="M330 52 V88 M850 52 V88" />
            <path
              className="g-ln dim"
              d="M334 62 H846"
              markerStart="url(#ga-blueprint-hero)"
              markerEnd="url(#ga-blueprint-hero)"
            />
            <rect className="g-gap" x="472" y="52" width="236" height="20" />
            <text className="g-dimtext" x="590" y="66" textAnchor="middle">
              VLAAMSE TECHNISCHE KRING
            </text>
          </g>

          {/* Leiders die zich naar de zijkanten tekenen */}
          {LEADS.map((lead, i) => (
            <path
              key={i}
              className="g-ln lead g-draw"
              pathLength={1}
              style={{ "--d": lead.delay } as CSSProperties}
              d={lead.d}
            />
          ))}

          {/* Knooppunten op de hoeken van het logo */}
          {NODES.map((node, i) => (
            <circle
              key={i}
              className="g-node g-fade"
              style={{ "--d": node.delay } as CSSProperties}
              cx={node.cx}
              cy={node.cy}
              r="4.5"
            />
          ))}
        </svg>

        {/* Labels op desktop */}
        {DESTINATIONS.map((dest) => {
          const { title, sub } = destinationText(dest, nl);
          return (
            <DestinationLink
              key={dest.key}
              destination={dest}
              base={base}
              className={`g-lab ${dest.side}`}
              style={{ top: dest.topPercent, "--d": dest.delay } as CSSProperties}
            >
              <b>
                <span className="g-u">{title}</span>
                <ArrowRightIcon />
              </b>
              <i>{sub}</i>
            </DestinationLink>
          );
        })}
      </div>
      )}

      {/* Mobiele lijst onder 760px */}
      <ul className="g-list">
        {DESTINATIONS.map((dest) => {
          const { title, sub } = destinationText(dest, nl);
          return (
            <li key={dest.key}>
              <DestinationLink destination={dest} base={base}>
                <span>
                  <b>{title}</b>
                  <i>{sub}</i>
                </span>
                <ArrowRightIcon />
              </DestinationLink>
            </li>
          );
        })}
      </ul>

      {hasEvents && events ? (
        <div className="g-events-head">
          <h2>{events.heading}</h2>
          <Link href={events.link.href}>
            <span className="g-u">{events.link.label}</span>
          </Link>
        </div>
      ) : null}
    </section>
    {hasEvents && events ? <HeroEventCards cards={events.cards} tempo={tempo} /> : null}
    </>
  );
}
