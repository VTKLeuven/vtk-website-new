"use client";

import { useState } from "react";
import { MAX_NON_MEMBER_DELAY_MINUTES } from "@/lib/ticketing/presale";
import type { AdminLocale } from "./format";

/** Uit minuten terug naar de uren en minuten die iemand ingaf. */
function splitDelay(total: number | null | undefined): { hours: string; minutes: string } {
  if (!total || total <= 0) return { hours: "", minutes: "" };
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return { hours: hours > 0 ? String(hours) : "", minutes: minutes > 0 ? String(minutes) : "" };
}

/** "2 uur en 30 minuten", "45 minuten", "3 uur". */
export function formatNonMemberDelay(total: number, locale: AdminLocale): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const nl = locale === "nl";
  const hourPart = hours > 0 ? `${hours} ${nl ? "uur" : hours === 1 ? "hour" : "hours"}` : null;
  const minutePart =
    minutes > 0 ? `${minutes} ${nl ? (minutes === 1 ? "minuut" : "minuten") : minutes === 1 ? "minute" : "minutes"}` : null;
  return [hourPart, minutePart].filter(Boolean).join(nl ? " en " : " and ");
}

/**
 * Hoe lang de niet-leden na de leden mogen beginnen kopen, als uren en minuten.
 *
 * Twee vakjes in een zin ("Niet-leden 2 uur 30 min na de leden") in plaats van
 * één veld in minuten: "150" leest niemand als tweeënhalf uur. De database
 * bewaart wel minuten (`TicketType.nonMemberDelayMinutes`), net zoals de
 * voorverkoop; dit veld rekent om en geeft het totaal door, of `null` voor
 * "tegelijk met de leden".
 */
export function NonMemberDelayInput({
  idPrefix,
  minutes,
  onChange,
  disabled = false,
  locale,
}: {
  idPrefix: string;
  minutes: number | null | undefined;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const initial = splitDelay(minutes);
  const [hours, setHours] = useState(initial.hours);
  const [mins, setMins] = useState(initial.minutes);

  function update(nextHours: string, nextMinutes: string) {
    setHours(nextHours);
    setMins(nextMinutes);
    const total = (Number(nextHours) || 0) * 60 + (Number(nextMinutes) || 0);
    onChange(total > 0 ? Math.min(total, MAX_NON_MEMBER_DELAY_MINUTES) : null);
  }

  const digits = (value: string) => value.replace(/[^\d]/g, "").slice(0, 3);

  return (
    <div className="ticket-admin-presale-line">
      <span>{nl ? "Niet-leden" : "Non-members"}</span>
      <input
        id={`${idPrefix}-hours`}
        aria-label={nl ? "Uren na de leden" : "Hours after members"}
        type="number"
        min="0"
        max="720"
        step="1"
        inputMode="numeric"
        placeholder="0"
        value={hours}
        disabled={disabled}
        onChange={(changed) => update(digits(changed.target.value), mins)}
      />
      <span>{nl ? "uur" : "h"}</span>
      <input
        id={`${idPrefix}-minutes`}
        aria-label={nl ? "Minuten na de leden" : "Minutes after members"}
        type="number"
        min="0"
        max="59"
        step="1"
        inputMode="numeric"
        placeholder="0"
        value={mins}
        disabled={disabled}
        onChange={(changed) => update(hours, digits(changed.target.value))}
      />
      <span>{nl ? "min na de leden" : "min after members"}</span>
    </div>
  );
}
