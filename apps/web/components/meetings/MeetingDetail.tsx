"use client";

import { useCallback, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import Link from "@/components/ui/Link";
import type { MeetingKind } from "@prisma/client";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { BureauLinkButton } from "./BureauLinkButton";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, MaximizeIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { formatEuro } from "@/lib/theokot";
import { handoutCounts, personEntries, type CountRow } from "./meetingPeople";
import {
  deleteMeetingAction,
  saveMeetingAction,
  saveMeetingOptionsAction,
  toggleGrocomeetOrderPaidAction,
  toggleReservationPaidAction,
} from "@/app/actions/meetings";

// Het uitdeelscherm opent pas na een klik; zijn code en css hoeven niet mee met
// elke vergaderpagina.
const MeetingHandoutScreen = dynamic(() => import("./MeetingHandoutScreen"), { ssr: false });

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
  /** Big bureau: het broodje wordt extern besteld, niet bij Theokot. */
  external: boolean;
  /** Theokot maakt dit broodje bovenop het aanbod (bureauvoorraad). */
  extra: boolean;
  /** Er is een broodje of een drankje besteld; anders komt die persoon enkel. */
  hasOrder: boolean;
};

/**
 * Wat een groco zelf bij Theokot bestelde (bv. het broodje van de week) en dus
 * in de doos van deze GM meegaat. Staat los van de inschrijvingen: wie zo
 * bestelt, hoeft niet ingeschreven te zijn.
 */
export type MeetingTheokotOrderRow = {
  id: string;
  name: string;
  /** "1× Broodje kip curry, 1× Broodje kaas" */
  items: string;
  /** Dezelfde regels apart, om ze bij "Uit te delen" op te tellen. */
  lines: Array<{ name: string; quantity: number }>;
  totalCents: number;
  paid: boolean;
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
  /** Levert Theokot maar de eerste `theokotLimit` broodjes? */
  bigBureau: boolean;
  theokotLimit: number | null;
  /** Broodjes die van Theokot komen (geldige, met een broodje). */
  theokotCount: number;
  /** Broodjes uit de bureauvoorraad: Theokot maakt ze bovenop het aanbod. */
  extraCount: number;
  /** Wat extern besteld moet worden, per broodje. Leeg zonder big bureau. */
  externalItems: Array<{ name: string; count: number }>;
  /** De vergadering is al begonnen; in de lijst staat ze dan grijs. */
  past: boolean;
  /** De bestelling is dicht; Theokot werkt misschien al met de turflijst. */
  deadlinePassed: boolean;
  options: MeetingOptionView[];
  /** Volledige link naar het bestelformulier (enkel voor een bureau). */
  shareUrl: string | null;
  /** Staat er die dag een Theokot-verkoopdag klaar? */
  sessionState: "NONE" | "OPEN" | "CLOSED";
  reservations: MeetingReservationRow[];
  /** Enkel bij een GM; bij een bureau altijd leeg. */
  theokotOrders: MeetingTheokotOrderRow[];
  /** Hoeveel van de inschrijvingen ook echt iets bestelden. */
  orderCount: number;
  /** Inschrijvingen plus de Theokot-bestellingen in de doos. */
  totalCents: number;
  openCents: number;
  /** Toont de betaalkolom (de GM rekent per persoon af, het bureau niet). */
  showPaid: boolean;
};

/**
 * Eén moment in het beheer, op een eigen pagina: wat er uitgedeeld moet worden,
 * wie wat krijgt, en daaronder de gegevens en het eigen aanbod.
 *
 * Bovenaan de tellingen per broodje en per drankje: daarmee haal je de doos op
 * en zie je in één blik of alles erin zit. Daaronder per persoon, als tabel (met
 * bedragen en afvinken) of in twee kolommen, zodat bij het uitdelen de hele
 * groep op één scherm past. De lijst is een aanwezigheidslijst: een inschrijving
 * zonder broodje of drankje staat er even goed in.
 */
export function MeetingDetail({
  nl,
  meeting,
  listHref,
}: {
  nl: boolean;
  meeting: MeetingAdminView;
  /** De lijst van vergaderingen: terug, en waarheen na verwijderen. */
  listHref: string;
}) {
  const [useTheokot, setUseTheokot] = useState(meeting.useTheokot);
  const [bigBureau, setBigBureau] = useState(meeting.bigBureau);
  const [personView, setPersonView] = useState<"columns" | "table">("columns");
  const [handoutOpen, setHandoutOpen] = useState(false);
  const closeHandout = useCallback(() => setHandoutOpen(false), []);
  const invalidCount = meeting.reservations.filter((row) => row.invalid).length;
  const externalCount = meeting.externalItems.reduce((total, row) => total + row.count, 0);
  const handout = handoutCounts(meeting);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link className="ticket-admin-back" href={listHref}>
              <ArrowLeft aria-hidden="true" size={14} />
              {nl ? "Alle vergaderingen" : "All meetings"}
            </Link>
            <h2 className="text-lg font-semibold text-vtk-ink first-letter:uppercase">{meeting.dateLabel}</h2>
            <p className="text-sm text-[#5c667f]">
              {meeting.reservations.length} {nl ? "ingeschreven" : "registered"} ·{" "}
              {meeting.orderCount} {nl ? "met bestelling" : "with an order"} ·{" "}
              {(meeting.bigBureau || externalCount > 0) &&
                (nl
                  ? `${meeting.theokotCount} van Theokot · ${externalCount} extern · `
                  : `${meeting.theokotCount} from Theokot · ${externalCount} external · `)}
              {meeting.extraCount > 0 &&
                `${meeting.extraCount} ${nl ? "uit de bureauvoorraad" : "from the bureau stock"} · `}
              {meeting.theokotOrders.length > 0 &&
                `${meeting.theokotOrders.length} ${nl ? "zelf bij Theokot" : "ordered at Theokot"} · `}
              <span className="tabular-nums">{formatEuro(meeting.totalCents)}</span>
              {meeting.location ? ` · ${meeting.location}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {meeting.shareUrl && (
              <BureauLinkButton nl={nl} url={meeting.shareUrl} dateLabel={meeting.dateLabel} />
            )}
            {/* Na verwijderen bestaat deze pagina niet meer: de action stuurt
                terug naar de lijst, en die navigatie is de bevestiging. */}
            <DeleteIconButton
              action={deleteMeetingAction}
              fields={{ meetingId: meeting.id, redirectTo: listHref }}
              label={nl ? "Verwijderen" : "Delete"}
              srLabel={`${nl ? "Verwijderen" : "Delete"}: ${meeting.dateLabel}`}
              title={nl ? "Vergadering verwijderen" : "Delete meeting"}
              description={
                (nl
                  ? `De vergadering van ${meeting.dateLabel} verdwijnt, samen met ${meeting.reservations.length} inschrijving(en) en hun opmerkingen${meeting.kind === "BUREAU" ? " en de genoteerde reclamemomenten" : ""}. De broodjes komen terug vrij voor studenten. Dit kan niet ongedaan gemaakt worden.`
                  : `The meeting of ${meeting.dateLabel} will be removed, together with ${meeting.reservations.length} registration(s) and their comments${meeting.kind === "BUREAU" ? " and the logged promotion moments" : ""}. The sandwiches become available to students again. This cannot be undone.`) +
                (meeting.theokotOrders.length > 0
                  ? nl
                    ? ` De ${meeting.theokotOrders.length} bestelling(en) die grocos zelf bij Theokot plaatsten, blijven bestaan maar gaan niet meer in de doos: die halen ze dan zelf af aan de balie en betalen ze daar.`
                    : ` The ${meeting.theokotOrders.length} order(s) grocos placed at Theokot themselves remain, but no longer go in the box: they then pick them up and pay at the counter.`
                  : "")
              }
              confirmLabel={nl ? "Verwijderen" : "Delete"}
              cancelLabel={nl ? "Annuleren" : "Cancel"}
            />
          </div>
        </div>

        {meeting.useTheokot && meeting.sessionState === "NONE" && (
          <p className="mt-3 rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/40 px-3 py-2 text-sm text-[#34405e]">
            {nl
              ? "Theokot heeft voor deze dag nog geen verkoopdag aangemaakt. De keuzes komen zolang uit het standaardaanbod; blijkt het aanbod die week anders, dan krijgen de bestellers een mail."
              : "Theokot has not created a sale day for this date yet. Choices come from the default offering until then; if that week's offering differs, everyone who ordered gets an email."}
          </p>
        )}

        {invalidCount > 0 && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {nl
              ? `${invalidCount} bestelling(en) zijn ongeldig geworden. Die mensen kregen een mail om opnieuw te kiezen; ze tellen hieronder niet mee bij wat er uitgedeeld wordt.`
              : `${invalidCount} order(s) became invalid. Those people received an email to pick again; they are not counted below in what is handed out.`}
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-base font-semibold">{nl ? "Uit te delen" : "To hand out"}</h3>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Hoeveel van elk broodje en elk drankje er mee moet, over alle inschrijvingen samen"
            : "How many of each sandwich and drink to bring, across all registrations"}
          {meeting.theokotOrders.length > 0
            ? nl
              ? ", met wat grocos zelf bij Theokot bestelden voor in de doos."
              : ", including what grocos ordered at Theokot themselves for the box."
            : "."}
        </p>
        {handout.items.length === 0 && handout.drinks.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{nl ? "Nog niets besteld." : "Nothing ordered yet."}</p>
        ) : (
          <div className="grid items-start gap-6 sm:grid-cols-2">
            <CountTable
              nl={nl}
              heading={nl ? "Broodjes" : "Sandwiches"}
              rows={handout.items}
              showExternal={externalCount > 0}
            />
            <CountTable nl={nl} heading={nl ? "Drankjes" : "Drinks"} rows={handout.drinks} showExternal={false} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{nl ? "Per persoon" : "Per person"}</h3>
            <p className="mt-1 text-sm text-[#5c667f]">
              {personView === "columns"
                ? nl
                  ? "Alfabetisch, in twee kolommen: om bij het uitdelen de hele groep op één scherm te zien."
                  : "Alphabetical, in two columns: to see the whole group on one screen while handing out."
                : nl
                  ? "Met de bedragen, in volgorde van inschrijven."
                  : "With the amounts, in order of registration."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="ticket-admin-subnav" role="group" aria-label={nl ? "Weergave" : "View"}>
              {(
                [
                  ["columns", nl ? "Twee kolommen" : "Two columns"],
                  ["table", nl ? "Tabel" : "Table"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={personView === value}
                  onClick={() => setPersonView(value)}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    personView === value ? "bg-vtk-blue-soft font-semibold text-vtk-ink" : "text-[#5c667f] hover:text-vtk-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="inline-flex items-center gap-1.5"
              onClick={() => {
                // Fullscreen moet in de klik zelf gevraagd worden; het scherm
                // laadt pas daarna. Lukt het niet, dan blijft het een overlay.
                void document.documentElement.requestFullscreen?.().catch(() => {});
                setHandoutOpen(true);
              }}
            >
              <MaximizeIcon />
              {nl ? "Volledig scherm" : "Full screen"}
            </Button>
          </div>
        </div>
        {handoutOpen && <MeetingHandoutScreen nl={nl} meeting={meeting} onClose={closeHandout} />}

        {meeting.reservations.length === 0 && meeting.theokotOrders.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{nl ? "Nog niemand ingeschreven." : "Nobody registered yet."}</p>
        ) : personView === "columns" ? (
          <PersonColumns nl={nl} meeting={meeting} />
        ) : (
          <PersonTables nl={nl} meeting={meeting} />
        )}
      </Card>

      {meeting.externalItems.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-1 text-base font-semibold">
            {nl ? `Extern te bestellen (${externalCount})` : `To order externally (${externalCount})`}
          </h3>
          <p className="mb-3 text-sm text-[#5c667f]">
            {nl
              ? "Deze broodjes levert Theokot niet: bestel ze zelf bij een externe zaak. Wie welk broodje krijgt, staat bij “Per persoon”. Ze zitten niet in het bedrag hierboven, want die rekening komt van die zaak."
              : "Theokot does not provide these sandwiches: order them yourself from an external vendor. Who gets which is listed under “Per person”. They are not in the amount above, since that bill comes from the vendor."}
          </p>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[20rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  <th className="py-1 pr-3">{nl ? "Broodje" : "Sandwich"}</th>
                  <th className="py-1 text-right">{nl ? "Aantal" : "Count"}</th>
                </tr>
              </thead>
              <tbody>
                {meeting.externalItems.map((row) => (
                  <tr key={row.name} className="border-t border-vtk-blue/10">
                    <td className="py-1.5 pr-3">{row.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="mb-3 text-base font-semibold">{nl ? "Gegevens" : "Details"}</h3>
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
                ? {
                    INVALID_DATE: "Geef een geldig moment op.",
                    NOT_FOUND: "Deze vergadering bestaat niet meer.",
                    DAY_TAKEN: "Op die dag staat er al een andere. Er kan er maar één per dag zijn.",
                    INVALID_LIMIT: "Geef bij big bureau op hoeveel broodjes Theokot levert (0 of meer).",
                    EXTERNAL_LEFT:
                      "Big bureau staat nog aan: Theokot heeft niet genoeg voorraad meer om de extern bestelde broodjes over te nemen, ook niet met de bureauvoorraad. Zet het aantal voor Theokot hoger, of vraag Theokot eerst om meer broodjes.",
                  }
                : {
                    INVALID_DATE: "Enter a valid moment.",
                    NOT_FOUND: "This meeting no longer exists.",
                    DAY_TAKEN: "There is already another one on that day. There can only be one per day.",
                    INVALID_LIMIT: "Enter how many sandwiches Theokot provides for a big bureau (0 or more).",
                    EXTERNAL_LEFT:
                      "Big bureau is still on: Theokot no longer has enough stock to take over the externally ordered sandwiches, not even with the bureau stock. Raise the number for Theokot, or ask Theokot for more sandwiches first.",
                  }
            }
            fallbackErrorMessage={nl ? "Opslaan mislukt." : "Saving failed."}
          >
            <input type="hidden" name="meetingId" value={meeting.id} />
            <input type="hidden" name="locale" value={nl ? "nl" : "en"} />
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

            {meeting.kind === "BUREAU" && useTheokot && (
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-[#34405e]">
                  <input
                    type="checkbox"
                    name="bigBureau"
                    checked={bigBureau}
                    onChange={(event) => setBigBureau(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Big bureau
                    <span className="block text-xs text-[#5c667f]">
                      {nl
                        ? "Theokot levert enkel de eerste broodjes, in volgorde van inschrijven. De rest blijft bewaard en bestel je zelf extern; die gaan niet van de Theokot-voorraad af en staan niet op de turflijst. Kan ook wanneer er al besteld is: wat boven het aantal valt, komt meteen terug vrij voor studenten."
                        : "Theokot only provides the first sandwiches, in order of registration. The rest is kept and you order it externally yourself; those do not come out of Theokot's stock and are not on the tally sheet. Works even when orders exist: whatever exceeds the number is released to students right away."}
                    </span>
                  </span>
                </label>
                {bigBureau && (
                  <div className="max-w-[14rem] pl-6">
                    <Label htmlFor={`theokot-limit-${meeting.id}`}>
                      {nl ? "Broodjes van Theokot" : "Sandwiches from Theokot"}
                    </Label>
                    <Input
                      id={`theokot-limit-${meeting.id}`}
                      type="number"
                      name="theokotLimit"
                      min={0}
                      step={1}
                      defaultValue={meeting.theokotLimit ?? ""}
                      required
                    />
                  </div>
                )}
                {meeting.deadlinePassed && (
                  <p className="pl-6 text-xs text-[#5c667f]">
                    {nl
                      ? "De deadline is voorbij: Theokot werkt misschien al met de turflijst. Wijzig je dit nu nog, verwittig Theokot dan zelf."
                      : "The deadline has passed: Theokot may already be working from the tally sheet. If you change this now, let Theokot know yourself."}
                  </p>
                )}
              </div>
            )}

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
      </Card>
    </div>
  );
}

function CountTable({
  nl,
  heading,
  rows,
  showExternal,
}: {
  nl: boolean;
  heading: string;
  rows: CountRow[];
  showExternal: boolean;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
          <th className="py-1 pr-3">{heading}</th>
          {showExternal && <th className="py-1 pr-3 text-right">{nl ? "Extern" : "External"}</th>}
          <th className="py-1 text-right">{nl ? "Aantal" : "Count"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr className="border-t border-vtk-blue/10">
            <td className="py-1.5 pr-3 text-[#5c667f]" colSpan={showExternal ? 3 : 2}>
              {nl ? "Geen" : "None"}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.name} className="border-t border-vtk-blue/10">
              <td className="py-1.5 pr-3">{row.name}</td>
              {showExternal && (
                <td className="py-1.5 pr-3 text-right tabular-nums text-[#5c667f]">{row.external || "—"}</td>
              )}
              <td className="py-1.5 text-right font-semibold tabular-nums">{row.count}</td>
            </tr>
          ))
        )}
        {rows.length > 1 && (
          <tr className="border-t-2 border-vtk-blue/20">
            <td className="py-1.5 pr-3 font-semibold" colSpan={showExternal ? 2 : 1}>
              {nl ? "Totaal" : "Total"}
            </td>
            <td className="py-1.5 text-right font-semibold tabular-nums">{total}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** Per persoon, alfabetisch, in twee kolommen (zie `personEntries`). */
function PersonColumns({ nl, meeting }: { nl: boolean; meeting: MeetingAdminView }) {
  const sorted = personEntries(meeting);

  return (
    <ul className="grid gap-x-8 sm:grid-cols-2">
      {sorted.map((entry) => {
        const row = entry.reservation;
        return (
          <li key={entry.key} className="flex items-start justify-between gap-3 border-t border-vtk-blue/10 py-2">
            <div className="min-w-0 text-sm">
              <span className="block font-semibold text-vtk-ink">{entry.name}</span>
              {row && (
                <span className={`block ${row.invalid ? "text-red-600" : "text-[#34405e]"}`}>
                  {row.hasOrder ? (
                    <>
                      {row.item ?? (nl ? "geen broodje" : "no sandwich")}
                      {row.external && (nl ? " (extern)" : " (external)")}
                      {row.extra && (nl ? " (bureauvoorraad)" : " (bureau stock)")}
                      {row.drink ? ` · ${row.drink}` : ""}
                      {row.invalid && (nl ? " (ongeldig)" : " (invalid)")}
                    </>
                  ) : (
                    <span className="text-[#5c667f]">{nl ? "komt zonder bestelling" : "coming without an order"}</span>
                  )}
                </span>
              )}
              {entry.theokot.map((order) => (
                <span key={order.id} className="block text-[#34405e]">
                  {order.items}
                  <span className="text-[#5c667f]">{nl ? " (zelf bij Theokot)" : " (ordered at Theokot)"}</span>
                </span>
              ))}
              {row?.comment && <span className="block text-xs text-[#5c667f]">“{row.comment}”</span>}
            </div>
            {meeting.showPaid && (
              <div className="flex shrink-0 gap-1">
                {row?.hasOrder && (
                  <PaidToggle
                    nl={nl}
                    action={toggleReservationPaidAction}
                    fields={{ reservationId: row.id }}
                    paid={row.paid}
                    name={entry.name}
                  />
                )}
                {entry.theokot.map((order) => (
                  <PaidToggle
                    key={order.id}
                    nl={nl}
                    action={toggleGrocomeetOrderPaidAction}
                    fields={{ orderId: order.id }}
                    paid={order.paid}
                    name={`${entry.name} (Theokot)`}
                  />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** De tabellen met bedragen: de inschrijvingen, en wat grocos zelf bij Theokot bestelden. */
function PersonTables({ nl, meeting }: { nl: boolean; meeting: MeetingAdminView }) {
  return (
    <div className="space-y-6">
      {meeting.reservations.length > 0 && (
        <div className="relative overflow-x-auto">
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
                    {row.comment && <span className="block text-xs text-[#5c667f]">“{row.comment}”</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    {row.item ?? <span className="text-[#5c667f]">—</span>}
                    {row.external && (
                      <span className="ml-1 text-xs text-[#5c667f]">{nl ? "(extern)" : "(external)"}</span>
                    )}
                    {row.extra && (
                      <span className="ml-1 text-xs text-[#5c667f]">{nl ? "(bureauvoorraad)" : "(bureau stock)"}</span>
                    )}
                    {row.invalid && <span className="ml-1 text-xs text-red-600">{nl ? "(ongeldig)" : "(invalid)"}</span>}
                  </td>
                  <td className="py-1.5 pr-3">{row.drink ?? <span className="text-[#5c667f]">—</span>}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {row.hasOrder ? formatEuro(row.totalCents) : <span className="text-[#5c667f]">—</span>}
                  </td>
                  {meeting.showPaid && (
                    <td className="py-1.5 text-right">
                      {/* Zonder bestelling valt er niets af te vinken; een knop van
                          nul euro leest als een openstaande schuld. */}
                      {row.hasOrder ? (
                        <PaidToggle
                          nl={nl}
                          action={toggleReservationPaidAction}
                          fields={{ reservationId: row.id }}
                          paid={row.paid}
                          name={row.name}
                        />
                      ) : (
                        <span className="text-[#5c667f]">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meeting.theokotOrders.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-vtk-ink">
            {nl
              ? `Zelf bij Theokot besteld (${meeting.theokotOrders.length})`
              : `Ordered at Theokot (${meeting.theokotOrders.length})`}
          </h4>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Deze grocos bestelden zelf bij Theokot. Hun broodjes gaan mee in de doos en worden hier afgerekend, niet aan de balie."
              : "These grocos ordered at Theokot themselves. Their sandwiches go in the box and are settled here, not at the counter."}
          </p>
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  <th className="py-1 pr-3">{nl ? "Naam" : "Name"}</th>
                  <th className="py-1 pr-3">{nl ? "Broodjes" : "Sandwiches"}</th>
                  <th className="py-1 pr-3 text-right">{nl ? "Bedrag" : "Amount"}</th>
                  <th className="py-1 text-right">{nl ? "Betaald" : "Paid"}</th>
                </tr>
              </thead>
              <tbody>
                {meeting.theokotOrders.map((row) => (
                  <tr key={row.id} className="border-t border-vtk-blue/10 align-top">
                    <td className="py-1.5 pr-3">{row.name}</td>
                    <td className="py-1.5 pr-3">{row.items}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(row.totalCents)}</td>
                    <td className="py-1.5 text-right">
                      <PaidToggle
                        nl={nl}
                        action={toggleGrocomeetOrderPaidAction}
                        fields={{ orderId: row.id }}
                        paid={row.paid}
                        name={row.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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
  action,
  fields,
  paid,
  name,
}: {
  nl: boolean;
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
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
        for (const [key, value] of Object.entries(fields)) form.append(key, value);
        startTransition(async () => {
          await action(form);
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

