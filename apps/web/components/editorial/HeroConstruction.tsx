import type { CSSProperties } from "react";
import { ArrowRightIcon } from "@/components/ui/icons";
import {
  CONSTRUCTION_LINES,
  CONSTRUCTION_LOGO_D,
} from "@/lib/home/heroConstruction";
import type { HeroDesignSetting } from "@/lib/home/heroDesign";
import { HERO_LINE_WEIGHT_PX } from "@/lib/home/heroDesign";
import { DESTINATIONS, DestinationLink, destinationText } from "./HeroDestinations";

/** Hoe de pagina van het .ai-bestand op de tekening ligt: schaal en verschuiving. */
type Placement = { k: number; ox: number; oy: number };
type Point = readonly [number, number];
type Crop = { width: number; height: number; x: number; y: number; w: number; h: number };

const toHero = (place: Placement, [x, y]: Point): [number, number] => [
  place.ox + place.k * x,
  place.oy + place.k * y,
];

/**
 * Op een telefoon vallen de labels weg en is enkel de tekening nog over. Een
 * viewBox kan niet met CSS wisselen, dus de hele SVG schuift en schaalt in een
 * kader dat op de tekening is uitgesneden.
 */
function cropVars({ width, height, x, y, w, h }: Crop): CSSProperties {
  return {
    "--crop-ratio": `${w} / ${h}`,
    "--crop-left": `${(-x / w) * 100}%`,
    "--crop-top": `${(-y / h) * 100}%`,
    "--crop-width": `${(width / w) * 100}%`,
    "--crop-height": `${(height / h) * 100}%`,
  } as CSSProperties;
}

/** Het logo in de 1168 x 520 van de huidige hero: even groot, 34 px lager. */
const CENTRE: Placement = { k: 2.1333, ox: 26.1, oy: -131.2 };
const CENTRE_CROP: Crop = { width: 1168, height: 520, x: 90, y: 10, w: 980, h: 470 };

/** Groter, en de lijnen lopen links uit de band. */
const REGISTER: Placement = { k: 2.62, ox: -282.47, oy: -238.94 };
const REGISTER_CROP: Crop = { width: 770, height: 520, x: -191, y: -57, w: 1164, h: 557 };

/** Eén stap in de tekening: de constructie eerst, dan het logo eroverheen. */
const LINE_DELAY_START = 0.05;
const LINE_DELAY_STEP = 0.035;
const LOGO_DELAY = 0.85;

function Lines({ taggable }: { taggable: boolean }) {
  return (
    <>
      {CONSTRUCTION_LINES.map((line, index) => (
        <path
          key={line.d}
          className="k-ln k-draw"
          pathLength={1}
          data-line={taggable ? line.line : undefined}
          style={{ "--d": `${(LINE_DELAY_START + index * LINE_DELAY_STEP).toFixed(2)}s` } as CSSProperties}
          d={line.d}
        />
      ))}
    </>
  );
}

/**
 * De arcering loopt parallel aan de lange schuine zijde van het logo: die stijgt
 * 38,15 graden (63,043 hoog over 80,262 breed in het .ai-bestand), en de lijn in
 * het patroon staat rechtop, dus ze draait het complement daarvan.
 */
const HATCH_ROTATION = 90 - 38.15;

function Logo({ fill, k }: { fill: HeroDesignSetting["fill"]; k: number }) {
  const hatch = 7 / k;
  return (
    <>
      <defs>
        <pattern
          id="k-hatch"
          width={hatch}
          height={hatch}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${HATCH_ROTATION})`}
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={hatch}
            stroke="currentColor"
            strokeWidth={1.1 / k}
            strokeOpacity="0.5"
          />
        </pattern>
      </defs>
      <g className="g-wipe" style={{ "--d": `${LOGO_DELAY}s` } as CSSProperties}>
        {/* Het navy vlak dekt de lijnen af, zodat ze niet door het logo lopen. */}
        <path className={fill === "solid" ? "k-solid" : "k-under"} d={CONSTRUCTION_LOGO_D} />
        {fill === "hatch" ? <path d={CONSTRUCTION_LOGO_D} fill="url(#k-hatch)" fillRule="evenodd" /> : null}
      </g>
      <path
        className="k-out k-draw"
        pathLength={1}
        style={{ "--d": `${LOGO_DELAY - 0.25}s` } as CSSProperties}
        d={CONSTRUCTION_LOGO_D}
      />
    </>
  );
}

function Drawing({
  place,
  viewBox,
  fill,
  taggable = false,
  children,
}: {
  place: Placement;
  viewBox: string;
  fill: HeroDesignSetting["fill"];
  taggable?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <svg
      className="k-svg"
      viewBox={viewBox}
      aria-hidden="true"
      style={{ "--k": place.k } as CSSProperties}
    >
      <g transform={`translate(${place.ox} ${place.oy}) scale(${place.k})`}>
        <Lines taggable={taggable} />
        <Logo fill={fill} k={place.k} />
      </g>
      {children}
    </svg>
  );
}

function Node({ point, delay }: { point: Point; delay: number }) {
  return (
    <circle
      className="g-node g-fade"
      style={{ "--d": `${delay.toFixed(2)}s` } as CSSProperties}
      cx={point[0]}
      cy={point[1]}
      r="4.5"
    />
  );
}

/**
 * Op de lijnuiteinden: geen leiders, elke bestemming staat op het einde van een
 * echte constructielijn, en die lijn kleurt geel wanneer je over het label gaat.
 */
const LINE_ENDS = [
  { key: "kalender", line: "kalender", end: [142.44, 74.81], side: "l", dy: 12 },
  { key: "tickets", line: "midden", end: [109.67, 158.83], side: "l", dy: 0 },
  { key: "broodjes", line: "basis", end: [90.25, 259.99], side: "l", dy: 0 },
  { key: "cursusdienst", line: "cursusdienst", end: [385.98, 73.33], side: "r", dy: 12 },
  { key: "shiften", line: "midden", end: [402.33, 159], side: "r", dy: 0 },
  { key: "career", line: "basis", end: [464, 259.99], side: "r", dy: 0 },
] as const;

function LineEnds({ setting, nl, base }: LayoutProps) {
  const ends = LINE_ENDS.map((entry) => ({ ...entry, point: toHero(CENTRE, entry.end) }));
  return (
    <div className="g-box k-box" style={cropVars(CENTRE_CROP)}>
      <Drawing place={CENTRE} viewBox="0 0 1168 520" fill={setting.fill} taggable>
        {ends.map((entry, index) => (
          <Node key={entry.key} point={entry.point} delay={1.2 + index * 0.05} />
        ))}
      </Drawing>
      {ends.map((entry, index) => {
        const destination = DESTINATIONS.find((candidate) => candidate.key === entry.key)!;
        const { title, sub } = destinationText(destination, nl);
        const x = entry.point[0] + (entry.side === "l" ? -10 : 10);
        return (
          <DestinationLink
            key={entry.key}
            destination={destination}
            base={base}
            className={`g-lab k-lab ${entry.side}`}
            data-line={entry.line}
            style={
              {
                top: `${((entry.point[1] + entry.dy) / 520) * 100}%`,
                [entry.side === "l" ? "right" : "left"]:
                  entry.side === "l" ? `${100 - (x / 1168) * 100}%` : `${(x / 1168) * 100}%`,
                "--d": `${(1.6 + index * 0.1).toFixed(2)}s`,
              } as CSSProperties
            }
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
  );
}

/** Met leiders rond het logo: zoals de bouwtekening, 34 px lager. */
const LEADERS_DROP = 34;
const LEADER_PATHS = [
  "M424.8 210.3 L380 174 L272 174",
  "M330 282.6 L272 282.6",
  "M330 423.4 L272 423.4",
  "M741.7 130.9 L790 142 L896 142",
  "M849.1 209 L872 254 L896 254",
  "M850 423.4 L896 423.4",
];
const LEADER_NODES: Point[] = [
  [424.8, 210.3],
  [330, 282.6],
  [330, 423.4],
  [596.3, 148.1],
  [741.7, 130.9],
  [849.1, 209],
  [850, 309.7],
  [627.9, 423.4],
  [850, 423.4],
];

function Leaders({ setting, nl, base }: LayoutProps) {
  return (
    <div className="g-box k-box" style={cropVars(CENTRE_CROP)}>
      <Drawing place={CENTRE} viewBox="0 0 1168 520" fill={setting.fill}>
        <defs>
          <marker
            id="k-arrow"
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
        <g className="g-dimgrp g-fade" style={{ "--d": "1.1s" } as CSSProperties}>
          <path className="g-ln dim" d="M334 96 H846" markerStart="url(#k-arrow)" markerEnd="url(#k-arrow)" />
          <rect className="g-gap" x="472" y="86" width="236" height="20" />
          <text className="g-dimtext" x="590" y="100" textAnchor="middle">
            VLAAMSE TECHNISCHE KRING
          </text>
        </g>
        {LEADER_PATHS.map((d, index) => (
          <path
            key={d}
            className="g-ln lead g-lead g-draw"
            pathLength={1}
            style={{ "--d": `${(1.5 + index * 0.1).toFixed(2)}s` } as CSSProperties}
            d={d}
          />
        ))}
        {LEADER_NODES.map((point, index) => (
          <Node key={point.join()} point={point} delay={1.2 + index * 0.05} />
        ))}
      </Drawing>
      {DESTINATIONS.map((destination, index) => {
        const { title, sub } = destinationText(destination, nl);
        const top = Number.parseFloat(destination.topPercent) + (LEADERS_DROP / 520) * 100;
        return (
          <DestinationLink
            key={destination.key}
            destination={destination}
            base={base}
            className={`g-lab k-lab ${destination.side}`}
            style={
              {
                top: `${top}%`,
                [destination.side === "l" ? "right" : "left"]: "77.57%",
                "--d": `${(1.8 + index * 0.1).toFixed(2)}s`,
              } as CSSProperties
            }
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
  );
}

/** Links groot, register rechts: de bestemmingen als lijst, zonder lijnen eromheen. */
function Register({ setting, nl, base }: LayoutProps) {
  return (
    <div className="k-register-grid">
      <div className="g-box k-box k-box-register" style={cropVars(REGISTER_CROP)}>
        <Drawing place={REGISTER} viewBox="0 0 770 520" fill={setting.fill} />
      </div>
      <ul className="k-register">
        {DESTINATIONS.map((destination) => {
          const { title, sub } = destinationText(destination, nl);
          return (
            <li key={destination.key}>
              <DestinationLink destination={destination} base={base}>
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
    </div>
  );
}

type LayoutProps = { setting: HeroDesignSetting; nl: boolean; base: string };

/**
 * De tekening van het nieuwe design, met de opstelling en de opties uit
 * /admin/home. Lijndikte en -sterkte staan als CSS-variabelen op de sectie (zie
 * `constructionVars`), zodat de voorvertoning niet opnieuw hoeft te tekenen
 * wanneer de schuif beweegt.
 */
export function HeroConstruction({ setting, nl, base }: LayoutProps) {
  if (setting.layout === "leaders") return <Leaders setting={setting} nl={nl} base={base} />;
  if (setting.layout === "register") return <Register setting={setting} nl={nl} base={base} />;
  return <LineEnds setting={setting} nl={nl} base={base} />;
}

export function constructionVars(setting: HeroDesignSetting): CSSProperties {
  return {
    "--lw": HERO_LINE_WEIGHT_PX[setting.lineWeight],
    "--lo": setting.lineStrength / 100,
  } as CSSProperties;
}
