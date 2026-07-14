"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@vtk/ui";
import { createWeekSessionsAction, updateSessionAction, updateSessionItemsAction } from "@/app/actions/theokot";

export type AdminItem = {
  id: string;
  nameNl: string;
  nameEn: string;
  priceEuro: string;
  quantity: number;
  isWeeklySpecial: boolean;
  hasLines: boolean;
};

export type AdminSession = {
  id: string;
  dateLabel: string;
  dateValue: string;
  isOpen: boolean;
  pickupStart: string;
  pickupEnd: string;
  orderCloseTime: string;
  orderOpenAt: string;
  processed: boolean;
  orderCount: number;
  items: AdminItem[];
};

export type DefaultHours = {
  pickupStart: string;
  pickupEnd: string;
  orderCloseTime: string;
  orderOpenTime: string;
};

const DAYS = [
  { v: 0, nl: "Ma", en: "Mon" },
  { v: 1, nl: "Di", en: "Tue" },
  { v: 2, nl: "Wo", en: "Wed" },
  { v: 3, nl: "Do", en: "Thu" },
  { v: 4, nl: "Vr", en: "Fri" },
  { v: 5, nl: "Za", en: "Sat" },
  { v: 6, nl: "Zo", en: "Sun" },
];

export function SessionsManager({
  nl,
  sessions,
  nextMonday,
  defaultProducts,
  defaultHours,
}: {
  nl: boolean;
  sessions: AdminSession[];
  nextMonday: string;
  defaultProducts: AdminItem[];
  defaultHours: DefaultHours;
}) {
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Verkoopweek aanmaken" : "Create a sale week"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Uren en aanbod gelden voor de hele week. Pas ze hier aan (bv. een week met een ander aanbod) en maak dan de week aan. Nadien kan je nog per dag bijsturen. Bestaande dagen worden overgeslagen."
            : "Hours and offering apply to the whole week. Adjust them here (e.g. a week with a different offering), then create the week. You can still tweak individual days afterwards. Existing days are skipped."}
        </p>
        <form action={createWeekSessionsAction} className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>{nl ? "Maandag van de week" : "Monday of the week"}</Label>
              <Input type="date" name="weekStart" defaultValue={nextMonday} required />
            </div>
            <div>
              <Label>{nl ? "Dagen" : "Days"}</Label>
              <div className="flex flex-wrap gap-2 pt-1">
                {DAYS.map((d) => (
                  <label key={d.v} className="inline-flex items-center gap-1 text-sm">
                    <input type="checkbox" name="days" value={d.v} defaultChecked={d.v <= 4} />
                    {nl ? d.nl : d.en}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label>{nl ? "Afhalen vanaf" : "Pickup from"}</Label>
              <Input type="time" name="pickupStart" defaultValue={defaultHours.pickupStart} />
            </div>
            <div>
              <Label>{nl ? "Afhalen tot" : "Pickup until"}</Label>
              <Input type="time" name="pickupEnd" defaultValue={defaultHours.pickupEnd} />
            </div>
            <div>
              <Label>{nl ? "Besteldeadline (uur)" : "Order deadline (time)"}</Label>
              <Input type="time" name="orderCloseTime" defaultValue={defaultHours.orderCloseTime} />
            </div>
            <div>
              <Label>{nl ? "Bestellen opent (uur)" : "Ordering opens (time)"}</Label>
              <Input type="time" name="orderOpenTime" defaultValue={defaultHours.orderOpenTime} />
            </div>
          </div>

          <details open className="group rounded-xl border border-vtk-blue/10 p-3">
            <summary className="cursor-pointer text-sm font-medium text-vtk-ink">
              {nl ? "Aanbod voor deze week" : "Offering for this week"}
            </summary>
            <div className="mt-3">
              <OfferingRows nl={nl} initial={defaultProducts} />
            </div>
          </details>

          <Button type="submit">{nl ? "Week aanmaken" : "Create week"}</Button>
        </form>
      </Card>

      {sessions.length === 0 && (
        <div className="vtk-basic-empty">
          {nl ? "Nog geen verkoopdagen aangemaakt." : "No sale days created yet."}
        </div>
      )}

      {sessions.map((s) => (
        <SessionEditor key={s.id} nl={nl} session={s} />
      ))}
    </div>
  );
}

function SessionEditor({ nl, session }: { nl: boolean; session: AdminSession }) {
  const base = nl ? "" : "/en";
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold capitalize">
          {session.dateLabel}
          {!session.isOpen && (
            <span className="ml-2 align-middle text-xs font-normal text-red-600">
              {nl ? "gesloten" : "closed"}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-3 text-sm text-[#5c667f]">
          <span>
            {session.orderCount} {nl ? "bestellingen" : "orders"}
          </span>
          <Link
            href={`${base}/admin/theokot/turflijst?date=${session.dateValue}`}
            className="rounded-full border border-vtk-blue/15 px-3 py-1 text-vtk-ink hover:bg-vtk-blue-soft/60"
          >
            {nl ? "Lijst bestelde broodjes" : "Ordered sandwiches list"}
          </Link>
        </div>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
          {nl ? "Uren & status bewerken" : "Edit hours & status"}
        </summary>
        <form action={updateSessionAction} className="mt-3 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="sessionId" value={session.id} />
          <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="isOpen" defaultChecked={session.isOpen} />
            {nl ? "Theokot is open deze dag" : "Theokot is open this day"}
          </label>
          <div>
            <Label>{nl ? "Afhalen vanaf" : "Pickup from"}</Label>
            <Input type="time" name="pickupStart" defaultValue={session.pickupStart} />
          </div>
          <div>
            <Label>{nl ? "Afhalen tot" : "Pickup until"}</Label>
            <Input type="time" name="pickupEnd" defaultValue={session.pickupEnd} />
          </div>
          <div>
            <Label>{nl ? "Besteldeadline (uur)" : "Order deadline (time)"}</Label>
            <Input type="time" name="orderCloseTime" defaultValue={session.orderCloseTime} />
          </div>
          <div>
            <Label>{nl ? "Bestellen opent" : "Ordering opens"}</Label>
            <Input type="datetime-local" name="orderOpenAt" defaultValue={session.orderOpenAt} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm">
              {nl ? "Uren opslaan" : "Save hours"}
            </Button>
          </div>
        </form>
      </details>

      <details className="group mt-2">
        <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
          {nl ? `Aanbod bewerken (${session.items.length})` : `Edit offering (${session.items.length})`}
        </summary>
        <form action={updateSessionItemsAction} className="mt-3 space-y-2">
          <input type="hidden" name="sessionId" value={session.id} />
          <OfferingRows nl={nl} initial={session.items} />
          <Button type="submit" size="sm">
            {nl ? "Aanbod opslaan" : "Save offering"}
          </Button>
        </form>
      </details>
    </Card>
  );
}

/**
 * Bewerkbare aanbod-tabel. Rendert per rij de velden `item-<i>-{id,nameNl,nameEn,price,quantity,weekly}`
 * plus een `itemCount`. Gebruikt in zowel het week-aanmaakformulier als de per-dag
 * aanbod-editor, zodat beide dezelfde velden posten.
 */
function OfferingRows({ nl, initial }: { nl: boolean; initial: AdminItem[] }) {
  const [rows, setRows] = useState<AdminItem[]>(initial);

  function update(i: number, patch: Partial<AdminItem>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((r) => [
      ...r,
      { id: "", nameNl: "", nameEn: "", priceEuro: "2.60", quantity: 10, isWeeklySpecial: false, hasLines: false },
    ]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="itemCount" value={rows.length} />

      <div className="hidden gap-2 text-xs font-semibold uppercase tracking-wide text-[#5c667f] sm:grid sm:grid-cols-[1fr_1fr_5rem_4rem_3rem_2rem]">
        <span>{nl ? "Naam (NL)" : "Name (NL)"}</span>
        <span>{nl ? "Naam (EN)" : "Name (EN)"}</span>
        <span>{nl ? "Prijs €" : "Price €"}</span>
        <span>{nl ? "Aantal" : "Qty"}</span>
        <span>{nl ? "V/d week" : "Weekly"}</span>
        <span />
      </div>

      {rows.map((row, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_4rem_3rem_2rem] sm:items-center">
          <input type="hidden" name={`item-${i}-id`} value={row.id} />
          <Input
            name={`item-${i}-nameNl`}
            value={row.nameNl}
            onChange={(e) => update(i, { nameNl: e.target.value })}
            placeholder={nl ? "Naam" : "Name"}
            required
          />
          <Input
            name={`item-${i}-nameEn`}
            value={row.nameEn}
            onChange={(e) => update(i, { nameEn: e.target.value })}
            placeholder={nl ? "Naam (EN)" : "Name (EN)"}
          />
          <Input
            name={`item-${i}-price`}
            value={row.priceEuro}
            onChange={(e) => update(i, { priceEuro: e.target.value })}
            inputMode="decimal"
          />
          <Input
            name={`item-${i}-quantity`}
            type="number"
            min={0}
            value={row.quantity}
            onChange={(e) => update(i, { quantity: Number(e.target.value) })}
          />
          <label className="inline-flex items-center justify-center" title={nl ? "Broodje van de week" : "Sandwich of the week"}>
            <input
              type="checkbox"
              name={`item-${i}-weekly`}
              checked={row.isWeeklySpecial}
              onChange={(e) => update(i, { isWeeklySpecial: e.target.checked })}
            />
          </label>
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="text-zinc-400 hover:text-red-600"
            title={row.hasLines ? (nl ? "Heeft bestellingen — blijft behouden" : "Has orders — kept") : nl ? "Verwijderen" : "Remove"}
          >
            ✕
          </button>
        </div>
      ))}

      <Button type="button" variant="ghost" size="sm" onClick={addRow}>
        + {nl ? "Broodje toevoegen" : "Add sandwich"}
      </Button>
    </div>
  );
}
