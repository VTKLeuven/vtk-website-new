"use client";

import { useTransition } from "react";
import { setPalPlusAttendanceAction } from "@/app/actions/palPlus";
import { useToast } from "@/components/ui/toast";

import "@/app/design/vtk-palplus-attendance.css";

export type AttendanceEntry = { userId: string; name: string; attended: boolean | null };

export type AttendanceCopy = {
  came: string;
  didNotCome: string;
  summary: string;
  notMarked: string;
  errors: Record<string, string>;
  fallbackError: string;
};

/**
 * Wie er echt kwam, aangeduid door een tutor van de sessie of door Onderwijs.
 *
 * Per persoon twee knoppen, "kwam" en "kwam niet"; nog eens klikken op de
 * gekozen knop zet hem terug op "niet aangeduid". Dat verschil telt: leeg
 * betekent "nog niet aangeduid", niet "niet gekomen". De gekozen toestand staat
 * in de knop zelf (`aria-pressed`); een toast komt er enkel bij een fout.
 */
export function AttendanceList({
  sessionId,
  attendees,
  copy,
}: {
  sessionId: string;
  attendees: AttendanceEntry[];
  copy: AttendanceCopy;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const came = attendees.filter((attendee) => attendee.attended === true).length;
  const open = attendees.filter((attendee) => attendee.attended === null).length;

  function mark(userId: string, value: boolean | null) {
    const data = new FormData();
    data.set("sessionId", sessionId);
    data.set("userId", userId);
    data.set("attended", value === true ? "yes" : value === false ? "no" : "");
    startTransition(async () => {
      const result = await setPalPlusAttendanceAction(data);
      if (result.status === "error") {
        showToast({
          message: copy.errors[result.code] ?? copy.fallbackError,
          variant: "error",
          duration: 0,
        });
      }
    });
  }

  return (
    <div className="pp-attendance">
      <p className="pp-attendance-summary">
        {copy.summary.replace("{came}", String(came)).replace("{total}", String(attendees.length))}
        {open > 0 && ` ${copy.notMarked.replace("{count}", String(open))}`}
      </p>
      <ul>
        {attendees.map((attendee) => (
          <li key={attendee.userId}>
            <span className="pp-attendance-name">{attendee.name}</span>
            <span className="pp-attendance-choice">
              <button
                type="button"
                aria-pressed={attendee.attended === true}
                disabled={pending}
                onClick={() => mark(attendee.userId, attendee.attended === true ? null : true)}
              >
                {copy.came}
              </button>
              <button
                type="button"
                aria-pressed={attendee.attended === false}
                disabled={pending}
                onClick={() => mark(attendee.userId, attendee.attended === false ? null : false)}
              >
                {copy.didNotCome}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
