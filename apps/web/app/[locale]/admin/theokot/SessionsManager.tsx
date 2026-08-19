"use client";

import Link from "next/link";
import { Button, Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { createWeekSessionsAction, updateSessionAction, updateSessionItemsAction } from "@/app/actions/theokot";
import { OfferingRows, type OfferingRow } from "./OfferingRows";

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
  items: OfferingRow[];
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
  defaultProducts: OfferingRow[];
  defaultHours: DefaultHours;
}) {
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Verkoopweek aanmaken" : "Create a sale week"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Uren en aanbod gelden voor de hele week. Pas ze hier aan (bv. een week met een ander aanbod) en maak dan de week aan. Nadien kan je nog per dag bijsturen. Bestaande dagen worden overgeslagen. Elke dag die je hier aanmaakt, krijgt meteen ook zijn Theokot-shiften (smeren, middag, namiddag), gerekend vanaf het afhaaluur van die dag; staan er al Theokot-shiften op een dag, dan blijven die ongemoeid."
            : "Hours and offering apply to the whole week. Adjust them here (e.g. a week with a different offering), then create the week. You can still tweak individual days afterwards. Existing days are skipped. Every day you create here also gets its Theokot shifts (spreading, midday, afternoon) right away, counted from that day's pickup time; days that already have Theokot shifts are left alone."}
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
              <OfferingRows nl={nl} initial={defaultProducts} prefix="item" countField="itemCount" />
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
        <SaveForm
          action={updateSessionAction}
          className="mt-3 grid gap-4 sm:grid-cols-2"
          submitLabel={nl ? "Uren opslaan" : "Save hours"}
          savingLabel={nl ? "Bezig..." : "Saving..."}
          savedMessage={nl ? "Uren opgeslagen" : "Hours saved"}
          errorMessages={
            nl
              ? { SESSION_NOT_FOUND: "Deze verkoopdag bestaat niet meer." }
              : { SESSION_NOT_FOUND: "This sale day no longer exists." }
          }
          fallbackErrorMessage={nl ? "Opslaan van de uren mislukt." : "Saving the hours failed."}
        >
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
        </SaveForm>
      </details>

      <details className="group mt-2">
        <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
          {nl ? `Aanbod bewerken (${session.items.length})` : `Edit offering (${session.items.length})`}
        </summary>
        <SaveForm
          action={updateSessionItemsAction}
          className="mt-3 space-y-2"
          submitLabel={nl ? "Aanbod opslaan" : "Save offering"}
          savingLabel={nl ? "Bezig..." : "Saving..."}
          savedMessage={nl ? "Aanbod opgeslagen" : "Offering saved"}
          errorMessages={
            nl
              ? { INVALID_IMAGE: "Eén van de foto's is niet geldig. Laad ze opnieuw op." }
              : { INVALID_IMAGE: "One of the photos is not valid. Upload it again." }
          }
          fallbackErrorMessage={nl ? "Opslaan van het aanbod mislukt." : "Saving the offering failed."}
        >
          <input type="hidden" name="sessionId" value={session.id} />
          <OfferingRows nl={nl} initial={session.items} prefix="item" countField="itemCount" />
        </SaveForm>
      </details>
    </Card>
  );
}
