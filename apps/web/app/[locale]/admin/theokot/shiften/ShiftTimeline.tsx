"use client";

import { useState } from "react";
import Link from "@/components/ui/Link";
import type { TheokotTimeline, TimelineBar, TimelineDay } from "@/lib/theokotShifts";

export type DayLabel = { short: string; long: string };

/** Hoogte van één balk en de ruimte rond en tussen de rijen, in px. */
const BAR_HEIGHT = 56;
const LANE_GAP = 6;
const TRACK_PADDING = 10;

/** Meer plaatsen dan dit en de bolletjes worden een rij die niet meer past. */
const MAX_SEAT_DOTS = 6;

function dayStatus(day: TimelineDay, nl: boolean): { text: string; tone: string } {
  if (day.bars.length === 0) return { text: nl ? "geen shiften" : "no shifts", tone: "none" };
  if (!day.upcoming) return { text: nl ? "voorbij" : "over", tone: "none" };
  if (day.open === 0) return { text: nl ? "volzet" : "full", tone: "full" };
  return { text: `${day.open} open`, tone: day.hasEmpty ? "empty" : "partial" };
}

function barStatus(bar: TimelineBar, nl: boolean): string {
  if (bar.past || bar.fill === "full") return bar.past ? `${bar.filled}/${bar.max}` : nl ? "volzet" : "full";
  return `${bar.open} open`;
}

function badge(bar: TimelineBar, nl: boolean): string {
  if (bar.past) {
    return nl ? `Voorbij, ${bar.filled} van ${bar.max} ingeschreven` : `Over, ${bar.filled} of ${bar.max} signed up`;
  }
  if (bar.fill === "full") return nl ? `Volzet, ${bar.filled} van ${bar.max}` : `Full, ${bar.filled} of ${bar.max}`;
  if (nl) return `${bar.open} van ${bar.max} ${bar.max === 1 ? "plaats" : "plaatsen"} open`;
  return `${bar.open} of ${bar.max} ${bar.max === 1 ? "place" : "places"} open`;
}

/**
 * De week als tijdlijn: een rij per dag, elke shift een balk op haar uur, en
 * onder de tijdlijn wie er ingeschreven is in de aangeklikte shift. De kleur
 * zegt hoe vol een shift is (rood: nog niemand, geel: nog plaats, grijs:
 * volzet); de tekst in de balk zegt het ook, voor wie de kleur niet ziet.
 */
export function ShiftTimeline({
  timeline,
  dayLabels,
  initialSelected,
  editHrefBase,
  nl,
}: {
  timeline: TheokotTimeline;
  dayLabels: Record<string, DayLabel>;
  initialSelected: string | null;
  /** `/admin/shiften` wanneer de gebruiker shiften mag beheren, anders null. */
  editHrefBase: string | null;
  nl: boolean;
}) {
  const [selectedId, setSelectedId] = useState(initialSelected);

  const selectedDay = timeline.days.find((day) => day.bars.some((bar) => bar.id === selectedId));
  const selected = selectedDay?.bars.find((bar) => bar.id === selectedId) ?? null;

  return (
    <div className="tk-sh-body">
      <div className="tk-sh-scroll">
        <div className="tk-sh-grid">
          <div className="tk-sh-axis" aria-hidden="true">
            <span className="tk-sh-axis-corner" />
            <div className="tk-sh-axis-track">
              {timeline.hours.map((hour) => (
                <span key={hour.label} className="tk-sh-hour" style={{ left: `${hour.left}%` }}>
                  {hour.label}
                </span>
              ))}
            </div>
          </div>

          {timeline.days.map((day) => {
            const label = dayLabels[day.key];
            const status = dayStatus(day, nl);
            const height = TRACK_PADDING * 2 + day.lanes * BAR_HEIGHT + (day.lanes - 1) * LANE_GAP;
            return (
              <div key={day.key} className="tk-sh-row" data-today={day.nowLeft !== null || undefined}>
                <div className="tk-sh-day">
                  <span className="tk-sh-day-name">{label?.short ?? day.key}</span>
                  <span className="tk-sh-day-open" data-tone={status.tone}>
                    {status.text}
                  </span>
                </div>
                <div className="tk-sh-track" style={{ height }}>
                  {timeline.hours.map((hour) => (
                    <span key={hour.label} className="tk-sh-gridline" style={{ left: `${hour.left}%` }} aria-hidden="true" />
                  ))}
                  {day.bars.length === 0 ? (
                    <span className="tk-sh-closed">{nl ? "Geen shiften" : "No shifts"}</span>
                  ) : null}
                  {day.ghosts.map((ghost) => (
                    <div
                      key={ghost.start}
                      className="tk-sh-ghost"
                      style={{
                        top: TRACK_PADDING,
                        left: `calc(${ghost.left}% + 2px)`,
                        width: `calc(${ghost.width}% - 4px)`,
                      }}
                      title={`${ghost.start}–${ghost.end}`}
                    >
                      {nl ? "Geen shift" : "No shift"}
                    </div>
                  ))}
                  {day.bars.map((bar) => (
                    <button
                      key={bar.id}
                      type="button"
                      className="tk-sh-bar"
                      data-fill={bar.fill}
                      data-past={bar.past || undefined}
                      aria-pressed={bar.id === selectedId}
                      aria-label={
                        nl
                          ? `${label?.long ?? day.key}, ${bar.start} tot ${bar.end}, ${bar.name}: ${bar.filled} van ${bar.max} ingeschreven`
                          : `${label?.long ?? day.key}, ${bar.start} to ${bar.end}, ${bar.name}: ${bar.filled} of ${bar.max} signed up`
                      }
                      title={`${bar.start}–${bar.end} ${bar.name}`}
                      onClick={() => setSelectedId(bar.id)}
                      style={{
                        top: TRACK_PADDING + bar.lane * (BAR_HEIGHT + LANE_GAP),
                        height: BAR_HEIGHT,
                        left: `calc(${bar.left}% + 2px)`,
                        width: `calc(${bar.width}% - 4px)`,
                      }}
                    >
                      <span className="tk-sh-bar-name">{bar.name}</span>
                      <span className="tk-sh-bar-meta">
                        {bar.max <= MAX_SEAT_DOTS ? (
                          <span className="tk-sh-seats" aria-hidden="true">
                            {Array.from({ length: bar.max }, (_, index) => (
                              <span key={index} className="tk-sh-seat" data-taken={index < bar.filled || undefined} />
                            ))}
                          </span>
                        ) : null}
                        <span className="tk-sh-status">{barStatus(bar, nl)}</span>
                      </span>
                    </button>
                  ))}
                  {day.nowLeft !== null ? (
                    <span className="tk-sh-now" style={{ left: `${day.nowLeft}%` }} aria-hidden="true" />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && selectedDay ? (
        <section className="tk-sh-detail" aria-live="polite">
          <div>
            <span className="tk-sh-kicker">{dayLabels[selectedDay.key]?.long ?? selectedDay.key}</span>
            <h2 className="tk-sh-detail-title">{selected.name}</h2>
            <span className="tk-sh-detail-time">
              {selected.start}–{selected.end}
            </span>
            <span className="tk-sh-badge" data-fill={selected.past ? "past" : selected.fill}>
              {badge(selected, nl)}
            </span>
          </div>
          <div>
            <span className="tk-sh-kicker">{nl ? "Ingeschreven" : "Signed up"}</span>
            {selected.participants.length === 0 ? (
              <span className="tk-sh-nobody">{nl ? "Nog niemand" : "Nobody yet"}</span>
            ) : (
              <ul className="tk-sh-people">
                {selected.participants.map((name, index) => (
                  <li key={`${name}-${index}`}>{name}</li>
                ))}
              </ul>
            )}
            {editHrefBase ? (
              <Link
                href={`${editHrefBase}?from=${selectedDay.key}&to=${selectedDay.key}`}
                className="tk-sh-detail-link"
              >
                {nl ? "Deze dag openen in Shiften" : "Open this day in Shifts"}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <ul className="tk-sh-legend">
        <li>
          <span className="tk-sh-swatch" data-fill="empty" aria-hidden="true" />
          {nl ? "Nog niemand" : "Nobody yet"}
        </li>
        <li>
          <span className="tk-sh-swatch" data-fill="partial" aria-hidden="true" />
          {nl ? "Nog plaatsen open" : "Places left"}
        </li>
        <li>
          <span className="tk-sh-swatch" data-fill="full" aria-hidden="true" />
          {nl ? "Volzet" : "Full"}
        </li>
        <li>
          <span className="tk-sh-swatch" data-kind="ghost" aria-hidden="true" />
          {nl ? "Vaste shift die er die dag niet is" : "Regular shift missing that day"}
        </li>
      </ul>
    </div>
  );
}
