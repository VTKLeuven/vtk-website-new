"use client";

import { useState } from "react";
import Link from "next/link";
import { isSameDay, addDays } from "date-fns";
import { getDictionary, type Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { registerShift, type MergedShift, type PostNames } from "@/components/shift/shiftData";
import { ShiftDialog } from "@/components/shift/ShiftDialog";
import "@/components/shift/shift-board.css";
import type { ShiftRosterEntry } from "@/lib/shift";

export type FrontpageShiftItem = {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  location: string;
  description: string;
  instructions: string | null;
  maxParticipants: number;
  reward: number;
  post: string | null;
  openToInternationals: boolean;
  takenSpots: number;
  availableSpots: number;
  viewerRegistered: boolean;
  roster: ShiftRosterEntry[];
};

function formatShiftTileDay(date: Date, now: Date, locale: Locale): string {
  const isToday = isSameDay(date, now);
  const isTomorrow = isSameDay(date, addDays(now, 1));
  const nl = locale === "nl";
  const intlLocale = nl ? "nl-BE" : "en-GB";

  const weekday = date.toLocaleDateString(intlLocale, { weekday: "short" }).toUpperCase();
  const day = date.getDate();
  const month = date.toLocaleDateString(intlLocale, { month: "short" }).toUpperCase();

  if (isToday) {
    return `${nl ? "VANDAAG" : "TODAY"} · ${weekday} ${day} ${month}`;
  }
  if (isTomorrow) {
    return `${nl ? "MORGEN" : "TOMORROW"} · ${weekday} ${day} ${month}`;
  }
  const fullWeekday = date.toLocaleDateString(intlLocale, { weekday: "long" }).toUpperCase();
  return `${fullWeekday} ${day} ${month}`;
}

function formatTimeRange(start: Date, end: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(start.getHours())}:${pad(start.getMinutes())} – ${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

export function FrontpageShiftBand({
  locale,
  base,
  shifts: initialShifts,
  postNames,
  signedIn,
  totalOpenSpots,
  userName,
}: {
  locale: Locale;
  base: string;
  shifts: FrontpageShiftItem[];
  postNames: PostNames;
  signedIn: boolean;
  totalOpenSpots: number;
  userName?: string | null;
}) {
  const [shifts, setShifts] = useState(initialShifts);
  const [selectedEntry, setSelectedEntry] = useState<MergedShift | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const showToast = useToast();
  const t = getDictionary(locale).shift;
  const nl = locale === "nl";
  const now = new Date();

  // Als er helemaal geen shiften zijn deze week en geen gepland, verberg de band
  if (shifts.length === 0 && totalOpenSpots === 0) return null;

  async function handleRegister(shift: FrontpageShiftItem) {
    setRegisteringId(shift.id);
    const ok = await registerShift(shift.id, showToast, t);
    setRegisteringId(null);
    if (ok) {
      const selfName = userName?.trim() || (nl ? "Jij" : "You");
      setShifts((prev) =>
        prev.map((s) =>
          s.id === shift.id
            ? {
                ...s,
                viewerRegistered: true,
                takenSpots: s.takenSpots + 1,
                availableSpots: Math.max(0, s.availableSpots - 1),
                roster: s.roster.some((p) => p.isSelf)
                  ? s.roster
                  : [...s.roster, { name: selfName, isSelf: true }],
              }
            : s
        )
      );
    }
  }

  const spotsMetaText =
    totalOpenSpots === 1
      ? nl
        ? "1 plaats vrij"
        : "1 spot available"
      : nl
        ? `${totalOpenSpots} plaatsen vrij`
        : `${totalOpenSpots} spots available`;

  return (
    <section className="section band shift-band" aria-labelledby="shift-band-head">
      <div className="sec-head">
        <h2 id="shift-band-head">
          {nl ? "Open shiften deze week." : "Open shifts this week."}
        </h2>
        <div className="meta">
          {totalOpenSpots > 0 ? `${spotsMetaText} · ` : ""}
          <Link href={`${base}/shift`}>{nl ? "alle shiften" : "all shifts"}</Link>
        </div>
      </div>

      {shifts.length === 0 ? (
        <div className="shift-empty-box">
          <p>{nl ? "Geen open shiften meer deze week." : "No open shifts left this week."}</p>
          <Link href={`${base}/shift`} className="btn btn-ghost btn-sm">
            {nl ? "Bekijk alle komende shiften" : "View all upcoming shifts"}
          </Link>
        </div>
      ) : (
        <div className="shift-cards-grid">
          {shifts.slice(0, 4).map((shift) => {
            const start = new Date(shift.startTime);
            const end = new Date(shift.endTime);
            const isRegistered = shift.viewerRegistered;
            const free = shift.availableSpots;

            let badgeClass = "spots-ok";
            let badgeLabel = nl ? `${free} vrij` : `${free} open`;
            if (isRegistered) {
              badgeClass = "spots-mine";
              badgeLabel = nl ? "Ingeschreven" : "Registered";
            } else if (free <= 0) {
              badgeClass = "spots-full";
              badgeLabel = nl ? "Vol" : "Full";
            } else if (free <= 2) {
              badgeClass = "spots-low";
              badgeLabel = nl ? `${free} vrij` : `${free} open`;
            }

            const postLabelText = shift.post ? postNames[shift.post] ?? shift.post : null;
            // Post en plaats staan op één regel; bij Theokot heten ze allebei
            // "Theokot" en stond die naam twee keer onder elkaar.
            const locationText = shift.location?.trim() ?? "";
            const factsLine = [
              postLabelText,
              locationText && locationText.toLowerCase() !== postLabelText?.toLowerCase()
                ? locationText
                : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const rewardText =
              shift.reward > 0
                ? shift.reward === 1
                  ? nl
                    ? "1 drankbon"
                    : "1 voucher"
                  : nl
                    ? `${shift.reward} drankbonnen`
                    : `${shift.reward} vouchers`
                : null;

            const roster = shift.roster ?? [];
            const rosterNames = roster.map((p) =>
              p.isSelf ? `${p.name} (${nl ? "jij" : "you"})` : p.name
            );
            const spotsTitle =
              rosterNames.length > 0
                ? `${nl ? "Ingeschreven" : "Registered"}: ${rosterNames.join(", ")}`
                : nl
                  ? "Nog geen inschrijvingen"
                  : "No sign-ups yet";

            const entry: MergedShift = {
              shift: {
                participantIds: [],
                sourceSystem: null,
                sourceId: null,
                manualGrantId: null,
                ...shift,
                roster: shift.roster,
              },
              registered: isRegistered,
            };

            return (
              <article key={shift.id} className="shift-tile">
                <div className="shift-tile-head">
                  <p className="shift-tile-day">{formatShiftTileDay(start, now, locale)}</p>
                  <div className="shift-spots-wrap">
                    <button
                      type="button"
                      className={`shift-spots ${badgeClass}`}
                      title={spotsTitle}
                      onClick={() => setSelectedEntry(entry)}
                      aria-label={`${badgeLabel}. ${spotsTitle}`}
                    >
                      {badgeLabel}
                    </button>
                    <div className="shift-spots-popover" role="tooltip" aria-hidden="true">
                      <div className="shift-spots-popover-head">
                        <span className="shift-spots-popover-title">
                          {nl ? "Ingeschreven" : "Registered"}
                        </span>
                        <span className="shift-spots-popover-count">
                          {shift.takenSpots}/{shift.maxParticipants}
                        </span>
                      </div>
                      {roster.length === 0 ? (
                        <p className="shift-spots-popover-empty">
                          {nl ? "Nog geen inschrijvingen" : "No sign-ups yet"}
                        </p>
                      ) : (
                        <ul className="shift-spots-popover-list">
                          {roster.map((person, idx) => (
                            <li
                              key={idx}
                              className="shift-spots-popover-person"
                              data-self={person.isSelf ? "true" : undefined}
                            >
                              <span className="shift-spots-popover-initial">
                                {person.name.trim().slice(0, 1).toUpperCase() || "?"}
                              </span>
                              <span className="shift-spots-popover-name">
                                {person.name}
                                {person.isSelf ? (
                                  <span className="shift-spots-popover-you">
                                    {" "}
                                    ({nl ? "jij" : "you"})
                                  </span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shift-tile-time">
                  <p className="shift-tile-hours">{formatTimeRange(start, end)}</p>
                  {shift.reward > 0 ? (
                    <span
                      className="shift-tile-reward"
                      role="img"
                      title={rewardText ?? undefined}
                      aria-label={rewardText ?? undefined}
                    >
                      {shift.reward}
                    </span>
                  ) : null}
                </div>

                <h4>{shift.name}</h4>

                {factsLine ? <p className="shift-tile-meta">{factsLine}</p> : null}

                <div className="shift-tile-foot">
                  {isRegistered ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title={spotsTitle}
                      onClick={() => setSelectedEntry(entry)}
                    >
                      {nl ? "Ingeschreven" : "Registered"}
                    </button>
                  ) : !signedIn ? (
                    <Link
                      href={`${base}/inloggen?next=${encodeURIComponent(base || "/")}`}
                      className="btn btn-primary btn-sm"
                    >
                      {nl ? "Inschrijven" : "Sign up"}
                    </Link>
                  ) : free <= 0 ? (
                    <button type="button" className="btn btn-ghost btn-sm" disabled>
                      {nl ? "Vol" : "Full"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={registeringId === shift.id}
                      onClick={() => handleRegister(shift)}
                    >
                      {registeringId === shift.id
                        ? nl
                          ? "Bezig..."
                          : "Signing up..."
                        : nl
                          ? "Inschrijven"
                          : "Sign up"}
                    </button>
                  )}

                  <button
                    type="button"
                    className="shift-tile-details"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    {nl ? "Details" : "Details"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedEntry && (
        <ShiftDialog
          locale={locale}
          entry={selectedEntry}
          postNames={postNames}
          signInHref={
            !signedIn
              ? `${base}/inloggen?next=${encodeURIComponent(base || "/")}`
              : undefined
          }
          onSuccess={(newRegistered) => {
            const selfName = userName?.trim() || (nl ? "Jij" : "You");
            setShifts((prev) =>
              prev.map((s) =>
                s.id === selectedEntry.shift.id
                  ? {
                      ...s,
                      viewerRegistered: newRegistered,
                      takenSpots: newRegistered ? s.takenSpots + 1 : Math.max(0, s.takenSpots - 1),
                      availableSpots: newRegistered
                        ? Math.max(0, s.availableSpots - 1)
                        : s.availableSpots + 1,
                      roster: newRegistered
                        ? s.roster.some((p) => p.isSelf)
                          ? s.roster
                          : [...s.roster, { name: selfName, isSelf: true }]
                        : s.roster.filter((p) => !p.isSelf),
                    }
                  : s
              )
            );
          }}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </section>
  );
}
