"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import {
  closeSessionNowAction,
  createWeekSessionsAction,
  removeOrderAction,
  removeSessionAction,
  updateSessionAction,
  updateSessionItemsAction,
} from "@/app/actions/theokot";
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
  /**
   * Bestellingen die al opgehaald zijn of waarop bonnetjes afgeboekt zijn.
   * Zolang dat er zijn, kan de dag niet meer weg; ze zijn echt gebeurd.
   */
  pickedUpCount: number;
  /** De afhaal van deze dag is voorbij, dus sluiten heeft geen zin meer. */
  closed: boolean;
  items: OfferingRow[];
  orders: AdminOrder[];
};

export type AdminOrder = {
  id: string;
  userName: string;
  rNumber: string;
  status: string;
  itemsLabel: string;
  totalLabel: string;
  /** Opgehaald of met bonnetjes betaald: dan blijft ze staan. */
  canRemove: boolean;
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
        <SaveForm
          action={createWeekSessionsAction}
          className="space-y-4"
          submitLabel={nl ? "Week aanmaken" : "Create week"}
          savingLabel={nl ? "Bezig..." : "Creating..."}
          savedMessage={nl ? "Verkoopweek aangemaakt" : "Sale week created"}
          resetOnSuccess={false}
          errorMessages={
            nl
              ? {
                  INVALID_WEEKSTART: "Kies een geldige maandag voor deze week.",
                  INVALID_IMAGE: "Eén van de foto's is niet geldig. Laad ze opnieuw op.",
                  ORDER_WINDOW_EMPTY:
                    "Niet aangemaakt: met deze uren sluit het bestellen voor het opengaat. Kijk 'Bestellen opent', de besteldeadline en het aantal dagen vooraf na.",
                  PICKUP_WINDOW_EMPTY:
                    "Niet aangemaakt: het afhaaluur eindigt voor het begint.",
                }
              : {
                  INVALID_WEEKSTART: "Pick a valid Monday for this week.",
                  INVALID_IMAGE: "One of the photos is not valid. Upload it again.",
                  ORDER_WINDOW_EMPTY:
                    "Not created: with these hours ordering closes before it opens. Check 'Ordering opens', the order deadline and the lead days.",
                  PICKUP_WINDOW_EMPTY: "Not created: the pickup window ends before it starts.",
                }
          }
          fallbackErrorMessage={nl ? "Week aanmaken mislukt." : "Creating the week failed."}
        >
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

        </SaveForm>
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
  // Hoeveel gereserveerde broodjes er sneuvelen als het aanbod zo opgeslagen
  // wordt. De aanbodtabel rekent het uit; hier hangt de bevestiging eraan.
  const [shortfall, setShortfall] = useState(0);
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

      {/* Twee handelingen die op elkaar lijken en het niet zijn: sluiten rondt de
          verkoop af (wat niet opgehaald is, telt als niet opgehaald), verwijderen
          is voor de dag die niet doorgaat. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!session.closed && (
          <SaveForm
            action={closeSessionNowAction}
            submitLabel={nl ? "Afhaalronde afsluiten" : "End pickup round"}
            submitVariant="ghost"
            submitSize="sm"
            savingLabel={nl ? "Bezig..." : "Closing..."}
            savedMessage={nl ? "Afhaalronde afgesloten" : "Pickup round ended"}
            confirmSubmit={{
              title: nl ? "Afhaalronde nu afsluiten?" : "End the pickup round now?",
              description: nl
                ? "De afhaal is voorbij: er kan niets meer bijbesteld of geannuleerd worden en wat een kwartier later niet opgehaald is, telt als niet opgehaald. De dag zelf blijft bestaan, met haar bestellingen en haar historiek. Wat je daarna toch nog uitdeelt, zet je aan de balie op opgehaald."
                : "Pickup stops right away and nothing can be ordered or cancelled anymore. Whatever is not collected a quarter of an hour later counts as not picked up. The day itself stays, with its orders and its history.",
              confirmLabel: nl ? "Afhaalronde afsluiten" : "End pickup round",
              cancelLabel: nl ? "Annuleren" : "Cancel",
            }}
            errorMessages={
              nl
                ? {
                    SESSION_NOT_FOUND: "Deze verkoopdag bestaat niet meer.",
                    SESSION_ALREADY_CLOSED: "De afhaal van deze dag is al voorbij.",
                  }
                : {
                    SESSION_NOT_FOUND: "This sale day no longer exists.",
                    SESSION_ALREADY_CLOSED: "Pickup for this day is already over.",
                  }
            }
            fallbackErrorMessage={nl ? "Sluiten mislukt." : "Closing failed."}
          >
            <input type="hidden" name="sessionId" value={session.id} />
          </SaveForm>
        )}

        {session.pickedUpCount === 0 ? (
          <DeleteButton
            action={removeSessionAction}
            fields={{ sessionId: session.id }}
            title={nl ? "Verkoopdag verwijderen?" : "Remove this sale day?"}
            description={
              nl
                ? `${session.dateLabel} verdwijnt met haar aanbod en haar ${session.orderCount} bestelling(en). Iedereen die besteld had, krijgt een mail dat die dag niet doorgaat. Gaat de dag wel door en ben je gewoon klaar met verkopen, gebruik dan "Afhaalronde afsluiten".`
                : `${session.dateLabel} disappears with its offering and its ${session.orderCount} order(s). Everyone who ordered gets an email that the day is not happening. If the day did happen and you are simply done selling, use "End pickup round" instead.`
            }
            confirmLabel={nl ? "Verwijderen" : "Remove"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Verkoopdag verwijderd" : "Sale day removed"}
          >
            {nl ? "Verkoopdag verwijderen" : "Remove sale day"}
          </DeleteButton>
        ) : (
          <span className="text-xs text-[#5c667f]">
            {nl
              ? `Er zijn al ${session.pickedUpCount} bestelling(en) opgehaald of met bonnetjes betaald, dus deze dag kan niet meer verwijderd worden. Sluiten kan wel.`
              : `${session.pickedUpCount} order(s) have already been picked up or paid with vouchers, so this day can no longer be removed. Closing it still works.`}
          </span>
        )}
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
              ? {
                  SESSION_NOT_FOUND: "Deze verkoopdag bestaat niet meer.",
                  INVALID_TIME: "Niet opgeslagen: kijk de ingevulde uren na.",
                  ORDER_WINDOW_EMPTY:
                    "Niet opgeslagen: de besteldeadline ligt voor het moment waarop bestellen opent, dus niemand kan deze dag bestellen.",
                  PICKUP_WINDOW_EMPTY:
                    "Niet opgeslagen: 'Afhalen tot' ligt voor 'Afhalen vanaf'.",
                }
              : {
                  SESSION_NOT_FOUND: "This sale day no longer exists.",
                  INVALID_TIME: "Not saved: please check the times you entered.",
                  ORDER_WINDOW_EMPTY:
                    "Not saved: the order deadline falls before ordering opens, so nobody can order this day.",
                  PICKUP_WINDOW_EMPTY: "Not saved: 'Pickup until' falls before 'Pickup from'.",
                }
          }
          fallbackErrorMessage={nl ? "Opslaan van de uren mislukt." : "Saving the hours failed."}
        >
          <input type="hidden" name="sessionId" value={session.id} />
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="isOpen" defaultChecked={session.isOpen} />
              {nl ? "Theokot gaat door deze dag" : "Theokot is happening this day"}
            </label>
            {/* Dit vinkje en "Nu sluiten" lijken op elkaar en zijn het niet; dat
                hoort op het scherm te staan en niet enkel in de code. */}
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Haal je dit weg, dan gaat de dag niet door: gereserveerde broodjes voor een grocomeet of bureau van die dag worden ongeldig en die mensen krijgen een mail. Ben je gewoon klaar met verkopen, gebruik dan “Afhaalronde afsluiten”."
                : "Unchecking this means the day is not happening: sandwiches reserved for a grocomeet or bureau that day are invalidated and those people get an email. If you are simply done selling, use “End pickup round” instead."}
            </p>
          </div>
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
              ? {
                  INVALID_IMAGE: "Eén van de foto's is niet geldig. Laad ze opnieuw op.",
                  ITEM_NOT_IN_SESSION:
                    "Niet opgeslagen: een van de broodjes hoort niet bij deze verkoopdag. Herlaad de pagina.",
                }
              : {
                  INVALID_IMAGE: "One of the photos is not valid. Upload it again.",
                  ITEM_NOT_IN_SESSION:
                    "Not saved: one of the sandwiches does not belong to this sale day. Reload the page.",
                }
          }
          fallbackErrorMessage={nl ? "Opslaan van het aanbod mislukt." : "Saving the offering failed."}
          confirmSubmit={
            shortfall > 0
              ? {
                  title: nl ? "Minder broodjes dan besteld?" : "Fewer sandwiches than ordered?",
                  description: nl
                    ? `Je zet het aanbod onder wat er al gereserveerd is: ${shortfall} gereserveerd(e) broodje(s) meer dan er zullen zijn. Er wordt niets automatisch geschrapt; de bestellingen blijven staan. Kies zelf wie eruit gaat bij "Bestellingen" hieronder, dan krijgt die student er een mail over.`
                    : `You are setting the offering below what is already reserved: ${shortfall} reserved sandwich(es) more than there will be. Nothing is dropped automatically; the orders stay. Pick who goes under "Orders" below, and that student gets an email about it.`,
                  confirmLabel: nl ? "Toch opslaan" : "Save anyway",
                  cancelLabel: nl ? "Annuleren" : "Cancel",
                }
              : null
          }
        >
          <input type="hidden" name="sessionId" value={session.id} />
          <OfferingRows
            nl={nl}
            initial={session.items}
            prefix="item"
            countField="itemCount"
            onShortfall={setShortfall}
          />
        </SaveForm>
      </details>

      {session.orders.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
            {nl ? `Bestellingen (${session.orders.length})` : `Orders (${session.orders.length})`}
          </summary>
          {/* Hier kies je zelf wie eruit gaat wanneer er minder broodjes zijn dan
              er besteld is; er wordt niets automatisch geschrapt. */}
          <p className="mt-2 text-xs text-[#5c667f]">
            {nl
              ? "Een bestelling schrappen wist ze en verwittigt de student per mail. De broodjes komen weer vrij en die student kan opnieuw reserveren zolang het bestelvenster openstaat."
              : "Removing an order deletes it and emails the student. The sandwiches become available again and that student can reserve again while ordering is open."}
          </p>
          <ul className="mt-2 divide-y divide-vtk-blue/10">
            {session.orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-medium text-vtk-ink">{order.userName}</span>
                <span className="text-xs text-[#5c667f]">{order.rNumber}</span>
                <span className="text-[#34405e]">{order.itemsLabel}</span>
                <span className="tabular-nums text-[#5c667f]">{order.totalLabel}</span>
                <span className="ml-auto flex items-center gap-2">
                  {order.status !== "RESERVED" && (
                    <span className="text-xs text-[#5c667f]">
                      {order.status === "PICKED_UP"
                        ? nl
                          ? "opgehaald"
                          : "picked up"
                        : order.status === "NO_SHOW"
                          ? nl
                            ? "niet opgehaald"
                            : "not picked up"
                          : order.status.toLowerCase()}
                    </span>
                  )}
                  {order.canRemove && (
                    <DeleteIconButton
                      action={removeOrderAction}
                      fields={{ orderId: order.id }}
                      label={nl ? "Bestelling schrappen" : "Remove order"}
                      srLabel={
                        nl
                          ? `Bestelling schrappen: ${order.userName}`
                          : `Remove order: ${order.userName}`
                      }
                      title={nl ? "Bestelling schrappen?" : "Remove this order?"}
                      description={
                        nl
                          ? `De bestelling van ${order.userName} (${order.itemsLabel}) wordt gewist en ${order.userName} krijgt een mail dat ze geannuleerd is. De broodjes komen weer vrij.`
                          : `${order.userName}'s order (${order.itemsLabel}) is deleted and ${order.userName} gets an email that it was cancelled. The sandwiches become available again.`
                      }
                      confirmLabel={nl ? "Schrappen" : "Remove"}
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={nl ? "Bestelling geschrapt" : "Order removed"}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
