"use client";

import { useTransition } from "react";
import { getDictionary, type Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import { reservePianoSlotAction } from "@/app/actions/piano";

export type SlotState = "free" | "taken" | "mine" | "past";

export type AgendaSlot = {
  /** ISO-string; gaat zo terug naar de server action. */
  startsAt: string;
  /** "19:00 - 20:00", al in Brussel-tijd geformatteerd door de server. */
  label: string;
  state: SlotState;
};

export type AgendaDay = { date: string; label: string; slots: AgendaSlot[] };

/**
 * De weekagenda met de tijdsloten. Reserveren is één klik op een vrij uur; de
 * uitkomst komt als toast terug (ook de fouten, bv. wanneer iemand net sneller
 * was). Annuleren staat bewust niet hier maar bij "Jouw reservaties": dat is een
 * destructieve actie en hoort een bevestiging te krijgen.
 */
export function PianoAgenda({
  locale,
  days,
  canReserve,
}: {
  locale: Locale;
  days: AgendaDay[];
  canReserve: boolean;
}) {
  const t = getDictionary(locale).piano;

  if (days.length === 0) {
    return (
      <div className="vtk-basic-table-empty">
        <p>{t.agenda.empty}</p>
        <p className="vtk-basic-copy">{t.agenda.emptyHint}</p>
      </div>
    );
  }

  return (
    <>
      <p className="vtk-basic-copy">{t.agenda.intro}</p>
      <div className="vtk-piano-days" style={{ marginTop: 16 }}>
        {days.map((day) => (
          <div key={day.date} className="vtk-piano-day">
            <div className="vtk-piano-dayname">{day.label}</div>
            <div className="vtk-piano-slots">
              {day.slots.map((slot) => (
                <SlotButton key={slot.startsAt} locale={locale} slot={slot} canReserve={canReserve} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SlotButton({
  locale,
  slot,
  canReserve,
}: {
  locale: Locale;
  slot: AgendaSlot;
  canReserve: boolean;
}) {
  const t = getDictionary(locale).piano;
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  const note =
    slot.state === "taken"
      ? t.slot.taken
      : slot.state === "mine"
        ? t.slot.mine
        : slot.state === "past"
          ? t.slot.past
          : null;

  // Zonder aanmelding blijft het uur leesbaar maar niet klikbaar; de uitleg
  // daarover staat als melding boven de agenda.
  const disabled = pending || slot.state !== "free" || !canReserve;

  function reserve() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("startsAt", slot.startsAt);
      const result = await reservePianoSlotAction(SAVE_IDLE, formData);
      if (result.status === "success") {
        showToast({ message: t.toast.reserved, variant: "success" });
      } else if (result.status === "error") {
        const messages = t.error as Record<string, string>;
        showToast({
          message: messages[result.code] ?? t.error.fallback,
          variant: "error",
          duration: 0,
        });
      }
    });
  }

  return (
    <button
      type="button"
      className={`vtk-piano-slot vtk-piano-slot-${slot.state}`}
      disabled={disabled}
      onClick={reserve}
      title={slot.state === "free" && canReserve ? t.slot.book.replace("{time}", slot.label) : undefined}
    >
      <span>{slot.label}</span>
      {pending ? (
        <span className="vtk-piano-slot-note">{t.slot.booking}</span>
      ) : (
        note && <span className="vtk-piano-slot-note">{note}</span>
      )}
    </button>
  );
}
