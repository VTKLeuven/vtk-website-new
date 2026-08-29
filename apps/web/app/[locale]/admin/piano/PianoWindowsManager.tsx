"use client";

import { useRef, useState, useTransition } from "react";
import { Card, Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { PencilIcon } from "@/components/ui/icons";
import {
  deletePianoWindowAction,
  reorderPianoWindowsAction,
  savePianoWindowAction,
} from "@/app/actions/piano";

export type WindowRow = {
  id: string;
  labelNl: string;
  labelEn: string | null;
  /** ISO-weekdagen, 1 = maandag ... 7 = zondag. */
  weekdays: number[];
  /** "HH:mm" voor de tijdvelden. */
  startTime: string;
  endTime: string;
  /** "YYYY-MM-DD" of leeg wanneer er geen grens is. */
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  order: number;
  /** Serverzijdig samengevat, bv. "ma, di, do · 19:00-22:00 · hele jaar". */
  summary: string;
};

const EMPTY: WindowRow = {
  id: "",
  labelNl: "",
  labelEn: null,
  weekdays: [1, 2, 3, 4, 5],
  startTime: "19:00",
  endTime: "22:00",
  startDate: null,
  endDate: null,
  active: true,
  order: 0,
  summary: "",
};

const WEEKDAY_LABELS = {
  nl: ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
} as const;

/**
 * De terugkerende vensters waarin de piano vrij is. Eén rij dekt een hele
 * regeling ("elke ma/di/do 19u-22u van eind september tot eind mei"); de slots
 * zelf worden daaruit berekend, dus hier staat geen kalender vol losse uren.
 */
export function PianoWindowsManager({ locale, windows }: { locale: Locale; windows: WindowRow[] }) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const dayLabels = WEEKDAY_LABELS[nl ? "nl" : "en"];
  const [editing, setEditing] = useState<WindowRow>(EMPTY);
  const [prevWindows, setPrevWindows] = useState<WindowRow[]>(windows);
  const [items, setItems] = useState<WindowRow[]>(windows);
  const [, startTransition] = useTransition();
  const isNew = editing.id === "";

  if (windows !== prevWindows) {
    setPrevWindows(windows);
    setItems(windows);
  }

  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    startTransition(() => void reorderPianoWindowsAction(next.map((w) => w.id)));
  }

  const errorMessages = nl
    ? {
        labelRequired: "Geef het venster een naam (NL).",
        weekdaysRequired: "Duid minstens één weekdag aan.",
        timeInvalid: "Vul een geldig begin- en einduur in.",
        timeOrder: "Het einduur ligt voor het beginuur.",
        dateOrder: "De einddatum ligt voor de startdatum.",
      }
    : {
        labelRequired: "Give the window a name (NL).",
        weekdaysRequired: "Select at least one weekday.",
        timeInvalid: "Fill in a valid start and end time.",
        timeOrder: "The end time is before the start time.",
        dateOrder: "The end date is before the start date.",
      };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            {isNew
              ? nl
                ? "Nieuw venster"
                : "New window"
              : nl
                ? "Venster bewerken"
                : "Edit window"}
          </h2>
          {!isNew && (
            <button
              type="button"
              className="text-sm text-[#5c667f] underline hover:text-vtk-ink"
              onClick={() => setEditing(EMPTY)}
            >
              {nl ? "Nieuw venster beginnen" : "Start a new window"}
            </button>
          )}
        </div>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Een venster is een terugkerende regeling. De tijdsloten die leden zien, volgen hieruit: het venster wordt opgedeeld volgens de slotlengte uit de instellingen."
            : "A window is a recurring rule. The time slots members see follow from it: the window is split according to the slot length in the settings."}
        </p>

        <SaveForm
          key={editing.id || "new"}
          action={savePianoWindowAction}
          className="space-y-4"
          submitLabel={isNew ? (nl ? "Venster toevoegen" : "Add window") : dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={nl ? "Venster opgeslagen" : "Window saved"}
          errorMessages={errorMessages}
          fallbackErrorMessage={dict.common.saveError}
          onSuccess={() => setEditing(EMPTY)}
        >
          {!isNew && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="piano-label-nl">{nl ? "Naam (NL)" : "Name (NL)"}</Label>
              <Input id="piano-label-nl" name="labelNl" defaultValue={editing.labelNl} required />
            </div>
            <div>
              <Label htmlFor="piano-label-en">{nl ? "Naam (EN)" : "Name (EN)"}</Label>
              <Input id="piano-label-en" name="labelEn" defaultValue={editing.labelEn ?? ""} />
            </div>
          </div>

          <div>
            <Label>{nl ? "Weekdagen" : "Weekdays"}</Label>
            <div className="mt-1 flex flex-wrap gap-3">
              {dayLabels.map((label, index) => {
                const value = index + 1;
                return (
                  <label key={value} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="weekdays"
                      value={value}
                      defaultChecked={editing.weekdays.includes(value)}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="piano-start-time">{nl ? "Van" : "From"}</Label>
              <Input
                id="piano-start-time"
                name="startTime"
                type="time"
                defaultValue={editing.startTime}
                required
              />
            </div>
            <div>
              <Label htmlFor="piano-end-time">{nl ? "Tot" : "To"}</Label>
              <Input
                id="piano-end-time"
                name="endTime"
                type="time"
                defaultValue={editing.endTime}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="piano-start-date">
                {nl ? "Geldig vanaf (optioneel)" : "Valid from (optional)"}
              </Label>
              <Input
                id="piano-start-date"
                name="startDate"
                type="date"
                defaultValue={editing.startDate ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="piano-end-date">
                {nl ? "Geldig tot en met (optioneel)" : "Valid until (optional)"}
              </Label>
              <Input
                id="piano-end-date"
                name="endDate"
                type="date"
                defaultValue={editing.endDate ?? ""}
              />
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl ? "Leeg = geen eindgrens." : "Empty = no end bound."}
              </p>
            </div>
          </div>

          <div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={editing.active} />
              {nl ? "Actief" : "Active"}
            </label>
          </div>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{nl ? "Vensters" : "Windows"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Overlappende vensters geven geen dubbele slots; de site neemt hun unie."
            : "Overlapping windows do not create duplicate slots; the site takes their union."}
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {nl
              ? "Er is nog geen venster: er valt dus niets te reserveren."
              : "There is no window yet, so there is nothing to reserve."}
          </p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10">
            {items.map((row, index) => (
              <li
                key={row.id}
                draggable
                onDragStart={() => {
                  dragFrom.current = index;
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                  setOverIndex(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overIndex !== index) setOverIndex(index);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(index);
                }}
                className={`flex flex-wrap items-center gap-3 py-3 rounded-xl px-2 transition-colors ${
                  overIndex === index ? "bg-vtk-yellow/20" : ""
                }`}
              >
                <span
                  className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-700 px-1 text-base select-none"
                  title={nl ? "Sleep om volgorde te wijzigen" : "Drag to reorder"}
                  aria-hidden="true"
                >
                  ⠿
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.active ? "bg-emerald-50 text-emerald-800" : "bg-vtk-blue-soft text-[#5c667f]"
                  }`}
                >
                  {row.active ? (nl ? "Actief" : "Active") : nl ? "Uit" : "Off"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-vtk-ink">
                    {nl ? row.labelNl : row.labelEn || row.labelNl}
                  </span>
                  <span className="block text-xs text-[#5c667f]">{row.summary}</span>
                </span>

                <IconButton
                  label={nl ? "Bewerken" : "Edit"}
                  srLabel={`${nl ? "Bewerken" : "Edit"}: ${row.labelNl}`}
                  onClick={() => {
                    setEditing(row);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <PencilIcon />
                </IconButton>

                <DeleteIconButton
                  action={deletePianoWindowAction}
                  fields={{ id: row.id }}
                  label={nl ? "Verwijderen" : "Delete"}
                  srLabel={`${nl ? "Verwijderen" : "Delete"}: ${row.labelNl}`}
                  title={nl ? "Venster verwijderen?" : "Delete window?"}
                  description={
                    nl
                      ? `De uren van "${row.labelNl}" verdwijnen van de pagina. Reservaties die al gemaakt zijn, blijven staan; wil je die ook weg, schrap ze dan bij de reservaties. Om het venster tijdelijk te sluiten, zet je het beter op inactief.`
                      : `The hours of "${row.labelNl}" disappear from the page. Reservations already made stay; remove them under reservations if you want them gone too. To close the window temporarily, set it inactive instead.`
                  }
                  confirmLabel={nl ? "Verwijderen" : "Delete"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={nl ? "Venster verwijderd" : "Window deleted"}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
