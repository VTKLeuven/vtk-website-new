"use client";

import { useState } from "react";
import { Card, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { ExclusiveChoiceGroup, type ExclusiveChoice } from "@/components/ui/ExclusiveChoiceGroup";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { formatEuro } from "@/lib/theokot";
import { hasMeetingOrder } from "@/lib/meetings";
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
  /**
   * Prijzen (per broodje, per drankje en het totaal) tonen. Bij een VTK Bureau
   * is de bestelling gratis voor de student — Onderwijs betaalt — dus daar
   * blijven die bedragen weg. Zie `meetingPricesVisible` in `lib/meetings.ts`.
   */
  showPrices: boolean;
  /** Theokot heeft voor die dag nog geen verkoopdag klaarstaan. */
  offeringProvisional: boolean;
  reservation: MeetingReservationView | null;
};

const NONE = "";

/**
 * De regel onder een broodje: de prijs, de resterende voorraad, of allebei.
 * Waar de student niet betaalt (een VTK Bureau) valt de prijs weg en blijft
 * alleen de beschikbaarheid over; is er ook geen voorraad gekend, dan is er
 * niets om te tonen.
 */
function choiceDescription(
  option: MeetingChoiceView,
  showPrices: boolean,
  nl: boolean,
): string | undefined {
  const stock =
    option.remaining === null
      ? null
      : option.remaining <= 0
        ? nl
          ? "uitverkocht"
          : "sold out"
        : `${option.remaining} ${nl ? "beschikbaar" : "available"}`;
  const price = showPrices ? formatEuro(option.priceCents) : null;
  const description = [price, stock].filter((part): part is string => part !== null).join(" · ");
  return description === "" ? undefined : description;
}

/**
 * Eén vergadering met het inschrijfformulier eronder: een broodje, een drankje,
 * en bij een bureau een opmerking. Gedeeld door de grocomeet-pagina en de
 * bureaupagina, want het is dezelfde inschrijving.
 *
 * Alle drie zijn ze optioneel: opslaan zonder broodje en zonder drankje is een
 * inschrijving zonder bestelling, en die hoort even goed op de
 * aanwezigheidslijst (zie docs/design-decisions.md). Uitschrijven gebeurt enkel
 * met de knop onderaan, want anders is er geen verschil tussen "ik kom, zonder
 * broodje" en "ik kom niet".
 */
export function MeetingReservationCard({ nl, meeting }: { nl: boolean; meeting: MeetingCardView }) {
  const reservation = meeting.reservation;
  const [choice, setChoice] = useState(reservation?.choiceKey ?? NONE);
  const [drink, setDrink] = useState(reservation?.drink ?? NONE);

  // Wat er bewaard staat, niet wat er nu in het formulier gekozen is.
  const registeredWithoutOrder =
    reservation !== null &&
    reservation.invalidReason === null &&
    !hasMeetingOrder({ itemName: reservation.choiceLabel, drinkName: reservation.drink });

  const selected = meeting.choices.find((option) => option.key === choice);
  const totalCents = (selected?.priceCents ?? 0) + (drink ? meeting.drinks.priceCents : 0);

  const sandwichOptions: ExclusiveChoice[] = [
    { value: NONE, label: nl ? "Geen broodje" : "No sandwich" },
    ...meeting.choices.map((option) => ({
      value: option.key,
      label: option.label,
      description: choiceDescription(option, meeting.showPrices, nl),
      // Wel tonen, niet kiesbaar; behalve wanneer het al je eigen keuze is.
      disabled: option.remaining !== null && option.remaining <= 0 && option.key !== reservation?.choiceKey,
    })),
  ];

  const drinkOptions = [
    { value: NONE, label: nl ? "Geen drankje" : "No drink" },
    ...meeting.drinks.items.map((item) => ({
      value: item,
      label: meeting.showPrices ? `${item} · ${formatEuro(meeting.drinks.priceCents)}` : item,
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

      {registeredWithoutOrder && (
        <p className="mb-3 rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/40 px-3 py-2 text-sm text-[#34405e]">
          {nl
            ? "Je bent ingeschreven. Je bestelde geen broodje en geen drankje; dat hoeft ook niet."
            : "You are registered. You did not order a sandwich or a drink, which is fine."}
        </p>
      )}

      {meeting.state === "OPEN" ? (
        <SaveForm
          action={saveMeetingReservationAction}
          className="space-y-4"
          resetOnSuccess={false}
          submitLabel={
            reservation
              ? nl
                ? "Inschrijving bijwerken"
                : "Update registration"
              : nl
                ? "Inschrijven"
                : "Register"
          }
          savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
          savedMessage={nl ? "Je inschrijving is opgeslagen" : "Your registration has been saved"}
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
          fallbackErrorMessage={
            nl ? "Opslaan van je inschrijving mislukt." : "Saving your registration failed."
          }
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
            {meeting.showPrices && (
              <span className="text-sm text-[#34405e]">
                {nl ? "Totaal" : "Total"}:{" "}
                <span className="font-semibold tabular-nums text-vtk-ink">{formatEuro(totalCents)}</span>
              </span>
            )}
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
            title={nl ? "Inschrijving annuleren" : "Cancel registration"}
            description={
              nl
                ? "Je inschrijving voor deze vergadering verdwijnt, samen met je broodje, je drankje en je opmerking. Zolang de deadline niet verstreken is, kan je je nadien opnieuw inschrijven."
                : "Your registration for this meeting will be removed, together with your sandwich, your drink and your comment. You can register again until the deadline."
            }
            confirmLabel={nl ? "Uitschrijven" : "Cancel registration"}
            cancelLabel={nl ? "Terug" : "Back"}
            successMessage={
              nl ? "Je inschrijving is geannuleerd" : "Your registration has been cancelled"
            }
          >
            {nl ? "Inschrijving annuleren" : "Cancel registration"}
          </DeleteButton>
        </div>
      )}
    </Card>
  );
}

/**
 * Wat er te zien is wanneer er (nog) niet ingeschreven of gewijzigd kan worden.
 * Een bestaande inschrijving blijft staan, ook zonder broodje of drankje: dat is
 * dan de bevestiging dat je op de lijst staat.
 */
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
          <li className="font-medium text-vtk-ink">
            {nl ? "Je bent ingeschreven." : "You are registered."}
          </li>
          <li>
            {nl ? "Broodje" : "Sandwich"}:{" "}
            <span className="font-medium">{reservation.choiceLabel ?? (nl ? "geen" : "none")}</span>
          </li>
          <li>
            {nl ? "Drankje" : "Drink"}:{" "}
            <span className="font-medium">{reservation.drink ?? (nl ? "geen" : "none")}</span>
          </li>
          {meeting.showPrices && (
            <li className="mt-1 border-t border-vtk-blue/10 pt-1">
              {nl ? "Totaal" : "Total"}:{" "}
              <span className="font-semibold tabular-nums">{formatEuro(reservation.totalCents)}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
