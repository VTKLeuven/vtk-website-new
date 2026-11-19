"use client";

import { useEffect, useState, type FocusEvent, type HTMLAttributes, type KeyboardEvent } from "react";
import type { ShiftRosterEntry } from "@/lib/shift";

/**
 * Beheert `Escape`-sluiting voor hover-/focus-popovers en tooltips (WCAG 1.4.13).
 * Zet `data-dismissed="true"` bij Escape en wist dat bij `mouseleave` of `blur`.
 */
export function useEscapeDismiss() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const active = hovered || focused;

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setDismissed(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);

  return {
    dismissed,
    resetDismissed: () => setDismissed(false),
    handlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => {
        setHovered(false);
        setDismissed(false);
      },
      onFocus: () => setFocused(true),
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          setDismissed(false);
        }
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setDismissed(true);
        }
      },
    },
  };
}

/** Omhulsel rond trigger + rooster-popover met Escape-sluiting via `data-dismissed`. */
export function DismissiblePopoverWrap({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  const { dismissed, handlers } = useEscapeDismiss();
  return (
    <div
      className={className}
      data-dismissed={dismissed ? "true" : undefined}
      {...handlers}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Wie er al op een shift staat, als popover naast de vrije plaatsen.
 *
 * Getoond op de shiftkaartjes van de homepage (`HomeShiftBand`) en in de
 * agenda (`/shift`, met `classPrefix="vtk-shift-spots-popover"`). De popover
 * verschijnt in CSS op hover en focus van de omhullende wrap.
 *
 * `aria-hidden`, want de trigger draagt dezelfde namen in zijn `aria-label`.
 */
export function ShiftRosterPopover({
  roster,
  taken,
  max,
  nl,
  classPrefix = "shift-spots-popover",
}: {
  roster: ShiftRosterEntry[];
  taken: number;
  max: number;
  nl: boolean;
  classPrefix?: "shift-spots-popover" | "vtk-shift-spots-popover";
}) {
  return (
    <div className={classPrefix} role="tooltip" aria-hidden="true">
      <div className={`${classPrefix}-head`}>
        <span className={`${classPrefix}-title`}>{nl ? "Ingeschreven" : "Registered"}</span>
        <span className={`${classPrefix}-count`}>
          {taken}/{max}
        </span>
      </div>
      {roster.length === 0 ? (
        <p className={`${classPrefix}-empty`}>{nl ? "Nog geen inschrijvingen" : "No sign-ups yet"}</p>
      ) : (
        <ul className={`${classPrefix}-list`}>
          {roster.map((person, idx) => (
            <li
              key={idx}
              className={`${classPrefix}-person`}
              data-self={person.isSelf ? "true" : undefined}
            >
              <span className={`${classPrefix}-initial`}>
                {person.name.trim().slice(0, 1).toUpperCase() || "?"}
              </span>
              <span className={`${classPrefix}-name`}>
                {person.name}
                {person.isSelf ? (
                  <span className={`${classPrefix}-you`}> ({nl ? "jij" : "you"})</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Dezelfde namen als tekst, voor de `aria-label` en `title` van de trigger. */
export function shiftRosterSummary(roster: ShiftRosterEntry[], nl: boolean): string {
  if (roster.length === 0) return nl ? "Nog geen inschrijvingen" : "No sign-ups yet";
  const names = roster.map((p) => (p.isSelf ? `${p.name} (${nl ? "jij" : "you"})` : p.name));
  return `${nl ? "Ingeschreven" : "Registered"}: ${names.join(", ")}`;
}
