"use client";

import { useState } from "react";
import { Card, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { ExclusiveChoiceGroup, type ExclusiveChoice } from "@/components/ui/ExclusiveChoiceGroup";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { formatEuro } from "@/lib/theokot";
import {
  cancelMeetingReservationAction,
  saveMeetingReservationAction,
} from "@/app/actions/meetings";

export type MeetingChoiceView = {
  key: string;
  label: string;
  priceCents: number;
  /** Resterende voorraad, of null wanneer die (nog) niet vastligt. */
  remaining: number | null;
};

export type MeetingReservationView = {
  choiceKey: string | null;
  choiceLabel: string | null;
  drink: string | null;
  comment: string | null;
  totalCents: number;
  invalidReason: string | null;
};

export type MeetingCardView = {
  id: string;
  dateLabel: string;
  locationLabel: string | null;
  note: string | null;
  state: "UPCOMING" | "OPEN" | "CLOSED";
  opensLabel: string | null;
  closeLabel: string;
  choices: MeetingChoiceView[];
  drinks: { priceCents: number; items: string[] };
  askComment: boolean;
  /** Theokot heeft voor die dag nog geen verkoopdag klaarstaan. */
  offeringProvisional: boolean;
  reservation: MeetingReservationView | null;
};

const NONE = "";

/**
 * Eén vergadering met het bestelformulier eronder: een broodje, een drankje, en
 * bij een bureau een opmerking. Gedeeld door de grocomeet-pagina en de
 * bureaupagina, want het is dezelfde bestelling.
 */
export function MeetingReservationCard({ nl, meeting }: { nl: boolean; meeting: MeetingCardView }) {
  const reservation = meeting.reservation;
  const [choice, setChoice] = useState(reservation?.choiceKey ?? NONE);
  const [drink, setDrink] = useState(reservation?.drink ?? NONE);

  const selected = meeting.choices.find((option) => option.key === choice);
  const totalCents = (selected?.priceCents ?? 0) + (drink ? meeting.drinks.priceCents : 0);

  const sandwichOptions: ExclusiveChoice[] = [
    { value: NONE, label: nl ? "Geen broodje" : "No sandwich" },
    ...meeting.choices.map((option) => ({
      value: option.key,
      label: option.label,
      description:
        option.remaining === null
          ? formatEuro(option.priceCents)
          : option.remaining <= 0
            ? `${formatEuro(option.priceCents)} · ${nl ? "uitverkocht" : "sold out"}`
            : `${formatEuro(option.priceCents)} · ${option.remaining} ${nl ? "beschikbaar" : "available"}`,
      // Wel tonen, niet kiesbaar; behalve wanneer het al je eigen keuze is.
      disabled: option.remaining !== null && option.remaining <= 0 && option.key !== reservation?.choiceKey,
    })),
  ];

  const drinkOptions = [
    { value: NONE, label: nl ? "Geen drankje" : "No drink" },
    ...meeting.drinks.items.map((item) => ({
      value: item,
      label: `${item} · ${formatEuro(meeting.drinks.priceCents)}`,
    })),
  ];

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold capitalize text-vtk-ink">{meeting.dateLabel}</h2>
        {meeting.locationLabel && (
          <span className="text-sm text-[#5c667f]">{meeting.locationLabel}</span>
        )}
      </div>

      {meeting.note && (
        <p className="mb-3 whitespace-pre-wrap text-sm text-[#34405e]">{meeting.note}</p>
      )}

      {reservation?.invalidReason && (
        <div className="vtk-basic-alert vtk-basic-alert-danger mb-3">
          <div className="vtk-basic-alert-text">
            <div className="vtk-basic-alert-title">
              {nl ? "Je broodje kan niet meer" : "Your sandwich is no longer available"}
            </div>
            <p>
              {reservation.invalidReason}{" "}
              {nl
                ? "Kies hieronder opnieuw, of laat het broodje weg."
                : "Pick again below, or leave the sandwich out."}
            </p>
          </div>
        </div>
      )}

      {meeting.state === "OPEN" ? (
        <SaveForm
          action={saveMeetingReservationAction}
          className="space-y-4"
          resetOnSuccess={false}
          submitLabel={reservation ? (nl ? "Bestelling bijwerken" : "Update order") : nl ? "Reserveren" : "Reserve"}
          savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
          savedMessage={nl ? "Je bestelling is opgeslagen" : "Your order has been saved"}
          errorMessages={
            nl
              ? {
                  CLOSED: "De deadline voor deze dag is verstreken.",
                  NOT_OPEN_YET: "Dit formulier is nog niet open.",
                  SOLD_OUT: "Dat broodje is net uitverkocht. Kies iets anders.",
                  UNKNOWN_CHOICE: "Dat broodje staat niet (meer) op het aanbod.",
                  UNKNOWN_DRINK: "Dat drankje staat niet op de lijst.",
                }
              : {
                  CLOSED: "The deadline for this day has passed.",
                  NOT_OPEN_YET: "This form is not open yet.",
                  SOLD_OUT: "That sandwich just sold out. Please pick another one.",
                  UNKNOWN_CHOICE: "That sandwich is no longer on the offering.",
                  UNKNOWN_DRINK: "That drink is not on the list.",
                }
          }
          fallbackErrorMessage={nl ? "Opslaan van je bestelling mislukt." : "Saving your order failed."}
        >
          <input type="hidden" name="meetingId" value={meeting.id} />

          <div>
            <Label>{nl ? "Broodje" : "Sandwich"}</Label>
            <ExclusiveChoiceGroup
              name="choice"
              value={choice}
              onChange={setChoice}
              options={sandwichOptions}
              columns={2}
              ariaLabel={nl ? "Broodje" : "Sandwich"}
            />
            {meeting.offeringProvisional && (
              <p className="mt-2 text-xs text-[#5c667f]">
                {nl
                  ? "Theokot legt het aanbod van die week later vast. Kiest Theokot dan iets anders, dan krijg je een mail om opnieuw te kiezen."
                  : "Theokot sets that week's offering later. If it changes, you will get an email to pick again."}
              </p>
            )}
          </div>

          <div className="max-w-xs">
            <Label htmlFor={`drink-${meeting.id}`}>{nl ? "Drankje" : "Drink"}</Label>
            <ThemedSelect
              id={`drink-${meeting.id}`}
              name="drink"
              variant="public"
              value={drink}
              onChange={setDrink}
              options={drinkOptions}
              ariaLabel={nl ? "Drankje" : "Drink"}
            />
          </div>

          {meeting.askComment && (
            <div>
              <Label htmlFor={`comment-${meeting.id}`}>
                {nl ? "Opmerking (optioneel)" : "Comment (optional)"}
              </Label>
              <Textarea
                id={`comment-${meeting.id}`}
                name="comment"
                defaultValue={reservation?.comment ?? ""}
                placeholder={
                  nl
                    ? "Onderwijsfeedback die je alvast wil meegeven."
                    : "Education feedback you want to share up front."
                }
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-vtk-blue/10 pt-3">
            <span className="text-sm text-[#34405e]">
              {nl ? "Totaal" : "Total"}:{" "}
              <span className="font-semibold tabular-nums text-vtk-ink">{formatEuro(totalCents)}</span>
            </span>
            <span className="text-xs text-[#5c667f]">
              {nl ? "Aanpassen kan tot " : "You can change this until "}
              {meeting.closeLabel}.
            </span>
          </div>
        </SaveForm>
      ) : (
        <ClosedSummary nl={nl} meeting={meeting} />
      )}

      {reservation && meeting.state === "OPEN" && (
        <div className="mt-2">
          <DeleteButton
            action={cancelMeetingReservationAction}
            fields={{ meetingId: meeting.id }}
            title={nl ? "Bestelling annuleren" : "Cancel order"}
            description={
              nl
                ? "Je broodje en drankje voor deze vergadering worden geschrapt. Zolang de deadline niet verstreken is, kan je nadien opnieuw bestellen."
                : "Your sandwich and drink for this meeting will be removed. You can order again until the deadline."
            }
            confirmLabel={nl ? "Annuleren" : "Cancel order"}
            cancelLabel={nl ? "Terug" : "Back"}
            successMessage={nl ? "Je bestelling is geannuleerd" : "Your order has been cancelled"}
          >
            {nl ? "Bestelling annuleren" : "Cancel order"}
          </DeleteButton>
        </div>
      )}
    </Card>
  );
}

/** Wat er te zien is wanneer er (nog) niet besteld kan worden. */
function ClosedSummary({ nl, meeting }: { nl: boolean; meeting: MeetingCardView }) {
  const reservation = meeting.reservation;
  return (
    <div className="space-y-2 text-sm text-[#34405e]">
      <p className="text-[#5c667f]">
        {meeting.state === "UPCOMING"
          ? nl
            ? `Reserveren opent op ${meeting.opensLabel}.`
            : `Ordering opens on ${meeting.opensLabel}.`
          : nl
            ? `Reserveren is gesloten sinds ${meeting.closeLabel}.`
            : `Ordering has been closed since ${meeting.closeLabel}.`}
      </p>
      {reservation && (
        <ul className="rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/40 p-3">
          <li>
            {nl ? "Broodje" : "Sandwich"}:{" "}
            <span className="font-medium">{reservation.choiceLabel ?? (nl ? "geen" : "none")}</span>
          </li>
          <li>
            {nl ? "Drankje" : "Drink"}:{" "}
            <span className="font-medium">{reservation.drink ?? (nl ? "geen" : "none")}</span>
          </li>
          <li className="mt-1 border-t border-vtk-blue/10 pt-1">
            {nl ? "Totaal" : "Total"}:{" "}
            <span className="font-semibold tabular-nums">{formatEuro(reservation.totalCents)}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
