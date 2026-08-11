"use client";

import { useState, useTransition } from "react";
import type { MeetingKind } from "@prisma/client";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { formatEuro } from "@/lib/theokot";
import {
  deleteMeetingAction,
  saveMeetingAction,
  saveMeetingOptionsAction,
  toggleReservationPaidAction,
} from "@/app/actions/meetings";

export type MeetingOptionView = { id: string; nameNl: string; nameEn: string; priceEuro: string };

export type MeetingReservationRow = {
  id: string;
  name: string;
  item: string | null;
  drink: string | null;
  comment: string | null;
  totalCents: number;
  paid: boolean;
  invalid: boolean;
};

export type MeetingAdminView = {
  id: string;
  kind: MeetingKind;
  dateLabel: string;
  startsAtValue: string;
  opensAtValue: string;
  location: string;
  noteNl: string;
  noteEn: string;
  useTheokot: boolean;
  options: MeetingOptionView[];
  /** Volledige link naar het bestelformulier (enkel voor een bureau). */
  shareUrl: string | null;
  /** Staat er die dag een Theokot-verkoopdag klaar? */
  sessionState: "NONE" | "OPEN" | "CLOSED";
  reservations: MeetingReservationRow[];
  totalCents: number;
  openCents: number;
  /** Toont de betaalkolom (de GM rekent per persoon af, het bureau niet). */
  showPaid: boolean;
};

/**
 * Eén moment in het beheer: de gegevens, het eigen aanbod wanneer Theokot die
 * dag niets voorziet, en de bestellingen die eraan hangen.
 */
export function MeetingAdminCard({ nl, meeting }: { nl: boolean; meeting: MeetingAdminView }) {
  const [useTheokot, setUseTheokot] = useState(meeting.useTheokot);
  const invalidCount = meeting.reservations.filter((row) => row.invalid).length;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold capitalize text-vtk-ink">{meeting.dateLabel}</h3>
          <p className="text-sm text-[#5c667f]">
            {meeting.reservations.length} {nl ? "bestellingen" : "orders"} ·{" "}
            <span className="tabular-nums">{formatEuro(meeting.totalCents)}</span>
            {meeting.location ? ` · ${meeting.location}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {meeting.shareUrl && <CopyLinkButton nl={nl} url={meeting.shareUrl} />}
          <DeleteIconButton
            action={deleteMeetingAction}
            fields={{ meetingId: meeting.id }}
            label={nl ? "Verwijderen" : "Delete"}
            srLabel={`${nl ? "Verwijderen" : "Delete"}: ${meeting.dateLabel}`}
            title={nl ? "Vergadering verwijderen" : "Delete meeting"}
            description={
              nl
                ? `De vergadering van ${meeting.dateLabel} verdwijnt, samen met ${meeting.reservations.length} bestelling(en). De broodjes komen terug vrij voor studenten. Dit kan niet ongedaan gemaakt worden.`
                : `The meeting of ${meeting.dateLabel} will be removed, together with ${meeting.reservations.length} order(s). The sandwiches become available to students again. This cannot be undone.`
            }
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Vergadering verwijderd" : "Meeting deleted"}
          />
        </div>
      </div>

      {meeting.useTheokot && meeting.sessionState === "NONE" && (
        <p className="mb-3 rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/40 px-3 py-2 text-sm text-[#34405e]">
          {nl
            ? "Theokot heeft voor deze dag nog geen verkoopdag aangemaakt. De keuzes komen zolang uit het standaardaanbod; blijkt het aanbod die week anders, dan krijgen de bestellers een mail."
            : "Theokot has not created a sale day for this date yet. Choices come from the default offering until then; if that week's offering differs, everyone who ordered gets an email."}
        </p>
      )}

      {invalidCount > 0 && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {nl
            ? `${invalidCount} bestelling(en) zijn ongeldig geworden. Die mensen kregen een mail om opnieuw te kiezen.`
            : `${invalidCount} order(s) became invalid. Those people received an email to pick again.`}
        </p>
      )}

      <details className="group">
        <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
          {nl ? "Gegevens bewerken" : "Edit details"}
        </summary>
        <SaveForm
          action={saveMeetingAction}
          className="mt-3 space-y-4"
          resetOnSuccess={false}
          submitLabel={nl ? "Opslaan" : "Save"}
          savingLabel={nl ? "Bezig..." : "Saving..."}
          savedMessage={nl ? "Vergadering opgeslagen" : "Meeting saved"}
          errorMessages={
            nl
              ? { INVALID_DATE: "Geef een geldig moment op.", NOT_FOUND: "Deze vergadering bestaat niet meer." }
              : { INVALID_DATE: "Enter a valid moment.", NOT_FOUND: "This meeting no longer exists." }
          }
          fallbackErrorMessage={nl ? "Opslaan mislukt." : "Saving failed."}
        >
          <input type="hidden" name="meetingId" value={meeting.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{nl ? "Wanneer" : "When"}</Label>
              <Input type="datetime-local" name="startsAt" defaultValue={meeting.startsAtValue} required />
            </div>
            <div>
              <Label>{nl ? "Plaats" : "Location"}</Label>
              <Input name="location" defaultValue={meeting.location} />
            </div>
            {meeting.kind === "BUREAU" && (
              <div>
                <Label>{nl ? "Formulier opent" : "Form opens"}</Label>
                <Input type="datetime-local" name="opensAt" defaultValue={meeting.opensAtValue} />
              </div>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm text-[#34405e]">
            <input
              type="checkbox"
              name="useTheokot"
              checked={useTheokot}
              onChange={(event) => setUseTheokot(event.target.checked)}
              className="mt-1"
            />
            <span>
              {nl ? "Broodjes van Theokot" : "Sandwiches from Theokot"}
              <span className="block text-xs text-[#5c667f]">
                {nl
                  ? "Uit betekent: eigen aanbod hieronder, geen Theokot-voorraad en geen kolom op de turflijst."
                  : "Off means: own offering below, no Theokot stock and no column on the tally sheet."}
              </span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{nl ? "Toelichting (NL)" : "Note (NL)"}</Label>
              <Textarea name="noteNl" defaultValue={meeting.noteNl} />
            </div>
            <div>
              <Label>{nl ? "Toelichting (EN)" : "Note (EN)"}</Label>
              <Textarea name="noteEn" defaultValue={meeting.noteEn} />
            </div>
          </div>
        </SaveForm>
      </details>

      {!meeting.useTheokot && (
        <details className="group mt-2">
          <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
            {nl ? `Eigen aanbod (${meeting.options.length})` : `Own offering (${meeting.options.length})`}
          </summary>
          <SaveForm
            action={saveMeetingOptionsAction}
            className="mt-3 space-y-2"
            resetOnSuccess={false}
            submitLabel={nl ? "Aanbod opslaan" : "Save offering"}
            savingLabel={nl ? "Bezig..." : "Saving..."}
            savedMessage={nl ? "Aanbod opgeslagen" : "Offering saved"}
            fallbackErrorMessage={nl ? "Opslaan van het aanbod mislukt." : "Saving the offering failed."}
          >
            <input type="hidden" name="meetingId" value={meeting.id} />
            <OptionRows nl={nl} initial={meeting.options} />
          </SaveForm>
        </details>
      )}

      <details className="group mt-2">
        <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
          {nl ? `Bestellingen (${meeting.reservations.length})` : `Orders (${meeting.reservations.length})`}
        </summary>
        {meeting.reservations.length === 0 ? (
          <p className="mt-3 text-sm text-[#5c667f]">
            {nl ? "Nog geen bestellingen." : "No orders yet."}
          </p>
        ) : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  <th className="py-1 pr-3">{nl ? "Naam" : "Name"}</th>
                  <th className="py-1 pr-3">{nl ? "Broodje" : "Sandwich"}</th>
                  <th className="py-1 pr-3">{nl ? "Drankje" : "Drink"}</th>
                  <th className="py-1 pr-3 text-right">{nl ? "Bedrag" : "Amount"}</th>
                  {meeting.showPaid && <th className="py-1 text-right">{nl ? "Betaald" : "Paid"}</th>}
                </tr>
              </thead>
              <tbody>
                {meeting.reservations.map((row) => (
                  <tr key={row.id} className="border-t border-vtk-blue/10 align-top">
                    <td className="py-1.5 pr-3">
                      {row.name}
                      {row.comment && (
                        <span className="block text-xs text-[#5c667f]">“{row.comment}”</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      {row.item ?? <span className="text-[#5c667f]">—</span>}
                      {row.invalid && (
                        <span className="ml-1 text-xs text-red-600">
                          {nl ? "(ongeldig)" : "(invalid)"}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{row.drink ?? <span className="text-[#5c667f]">—</span>}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(row.totalCents)}</td>
                    {meeting.showPaid && (
                      <td className="py-1.5 text-right">
                        <PaidToggle nl={nl} reservationId={row.id} paid={row.paid} name={row.name} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </Card>
  );
}

/** Rijen van het eigen aanbod: naam en prijs, meer heeft een lasagne niet nodig. */
function OptionRows({ nl, initial }: { nl: boolean; initial: MeetingOptionView[] }) {
  const [rows, setRows] = useState(initial);

  function update(index: number, patch: Partial<MeetingOptionView>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="optionCount" value={rows.length} />
      {rows.map((row, index) => (
        <div key={row.id || `new-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_2rem] sm:items-end">
          <input type="hidden" name={`option-${index}-id`} value={row.id} />
          <div>
            <Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label>
            <Input
              name={`option-${index}-nameNl`}
              value={row.nameNl}
              onChange={(event) => update(index, { nameNl: event.target.value })}
              required
            />
          </div>
          <div>
            <Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label>
            <Input
              name={`option-${index}-nameEn`}
              value={row.nameEn}
              onChange={(event) => update(index, { nameEn: event.target.value })}
            />
          </div>
          <div>
            <Label>{nl ? "Prijs €" : "Price €"}</Label>
            <Input
              name={`option-${index}-price`}
              value={row.priceEuro}
              onChange={(event) => update(index, { priceEuro: event.target.value })}
              inputMode="decimal"
            />
          </div>
          <button
            type="button"
            onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            className="mb-2 text-sm text-zinc-400 hover:text-red-600"
            title={nl ? "Verwijderen" : "Remove"}
          >
            ✕
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setRows((current) => [...current, { id: "", nameNl: "", nameEn: "", priceEuro: "5.00" }])}
      >
        + {nl ? "Keuze toevoegen" : "Add choice"}
      </Button>
    </div>
  );
}

/** Betaald of niet, met de uitkomst als toast en in het icoon zelf. */
function PaidToggle({
  nl,
  reservationId,
  paid,
  name,
}: {
  nl: boolean;
  reservationId: string;
  paid: boolean;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  const label = paid
    ? nl
      ? "Betaald; klik om terug te zetten"
      : "Paid; click to undo"
    : nl
      ? "Markeer als betaald"
      : "Mark as paid";

  return (
    <IconButton
      label={label}
      srLabel={`${label}: ${name}`}
      disabled={pending}
      onClick={() => {
        const form = new FormData();
        form.append("reservationId", reservationId);
        startTransition(async () => {
          await toggleReservationPaidAction(form);
          showToast({
            message: paid
              ? nl
                ? "Terug op openstaand gezet"
                : "Set back to outstanding"
              : nl
                ? "Als betaald gemarkeerd"
                : "Marked as paid",
            variant: "success",
          });
        });
      }}
    >
      {paid ? <CheckIcon /> : <span aria-hidden="true">€</span>}
    </IconButton>
  );
}

/** De deelbare link van een bureau kopiëren. */
function CopyLinkButton({ nl, url }: { nl: boolean; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? (nl ? "Gekopieerd" : "Copied") : nl ? "Link kopiëren" : "Copy link"}
      srLabel={nl ? "Link naar het bestelformulier kopiëren" : "Copy the link to the order form"}
      onClick={() => {
        navigator.clipboard?.writeText(url).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => setCopied(false),
        );
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </IconButton>
  );
}
