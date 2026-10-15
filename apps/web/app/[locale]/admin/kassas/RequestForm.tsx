"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { formatEuro } from "@/lib/rekeningen/expenses";
import {
  countsTotalCents,
  DENOMINATIONS,
  piecesOf,
  standardPieces,
  startCountsFromPicks,
  type Counts,
  type Denomination,
} from "@/lib/kassas/kassa";
import { countInputsFrom, DenominationGrid, inputsTotalCents } from "./DenominationGrid";
import { FloatPicker } from "./FloatPicker";

export type RequestFormValues = {
  id?: string;
  date: string;
  /** "20:00"; leeg bij een kassa van voor er naar de uren gevraagd werd. */
  startTime: string;
  endTime: string;
  activity: string;
  groupId: string;
  responsibleName: string;
  wantsBancontact: boolean;
  wantsPayconiq: boolean;
  comment: string;
  startCounts: Counts;
};

/**
 * Hoe de startkassa in dit formulier staat:
 * - `pick`: knoppen per munt en briefje, voor wie aanvraagt;
 * - `count`: stuks per coupure, voor Beheer na het aanvaarden;
 * - `keep`: niet hier, want ze staat in het aanvaardformulier ernaast. Twee
 *   rasters voor hetzelfde wisselgeld op één scherm, en je weet niet meer
 *   welk er telt.
 */
export type FloatMode = "pick" | "count" | "keep";

/**
 * De aanvraag: wanneer, voor welke activiteit en post, wie verantwoordelijk is,
 * of er Bancontact of Payconiq bij moet, en welk wisselgeld er in de kassa moet.
 * Om aan te vragen en om een aanvraag aan te passen; het verschil zit in de
 * action en in `id`.
 */
export function RequestForm({
  locale,
  action,
  posts,
  values,
  floatMode,
  labels,
  redirectAfter,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  posts: Array<{ id: string; name: string }>;
  values: RequestFormValues;
  floatMode: FloatMode;
  labels: {
    submitLabel: string;
    savingLabel: string;
    savedMessage: string;
    fallbackErrorMessage: string;
    errorMessages: Record<string, string>;
  };
  /** Waarheen na een geslaagde opslag. Leeg = op de pagina blijven. */
  redirectAfter?: string;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const isEdit = Boolean(values.id);
  const [picked, setPicked] = useState<Denomination[]>(() =>
    DENOMINATIONS.filter(
      (denomination) => standardPieces(denomination) !== null && piecesOf(values.startCounts, denomination) > 0,
    ),
  );
  const [start, setStart] = useState(() => countInputsFrom(values.startCounts, true));
  const total =
    floatMode === "count"
      ? inputsTotalCents(start)
      : countsTotalCents(startCountsFromPicks(picked, values.startCounts));

  return (
    <SaveForm
      action={action}
      submitLabel={labels.submitLabel}
      savingLabel={labels.savingLabel}
      savedMessage={labels.savedMessage}
      errorMessages={labels.errorMessages}
      fallbackErrorMessage={labels.fallbackErrorMessage}
      resetOnSuccess={!isEdit}
      onSuccess={() => {
        if (redirectAfter) router.push(redirectAfter);
        else router.refresh();
      }}
      className="space-y-6"
    >
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="startMode" value={floatMode} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="date">{nl ? "Datum van de activiteit" : "Date of the activity"}</Label>
          <Input id="date" name="date" type="date" required defaultValue={values.date} />
        </div>
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="startTime">{nl ? "Van" : "From"}</Label>
              <Input id="startTime" name="startTime" type="time" required defaultValue={values.startTime} />
            </div>
            <div>
              <Label htmlFor="endTime">{nl ? "Tot" : "Until"}</Label>
              <Input id="endTime" name="endTime" type="time" required defaultValue={values.endTime} />
            </div>
          </div>
          <p className="mt-1 text-xs text-vtk-muted">
            {nl
              ? "Loopt het over middernacht, vul dan gewoon het uur van de nacht in, bv. 22:00 tot 03:00."
              : "Past midnight? Just enter the time at night, e.g. 22:00 to 03:00."}
          </p>
        </div>
        <div>
          <Label htmlFor="activity">{nl ? "Activiteit" : "Activity"}</Label>
          <Input
            id="activity"
            name="activity"
            required
            maxLength={120}
            defaultValue={values.activity}
            placeholder={nl ? "bv. Croque bar" : "e.g. Croque bar"}
          />
        </div>
        <div>
          <Label htmlFor="groupId">{nl ? "Post" : "Post"}</Label>
          <Select id="groupId" name="groupId" required defaultValue={values.groupId}>
            <option value="" disabled>
              {nl ? "Kies een post" : "Choose a post"}
            </option>
            {posts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="responsibleName">{nl ? "Verantwoordelijke" : "Person responsible"}</Label>
          <Input
            id="responsibleName"
            name="responsibleName"
            required
            maxLength={120}
            defaultValue={values.responsibleName}
          />
          <p className="mt-1 text-xs text-vtk-muted">
            {nl
              ? "Wie die dag voor de kassa instaat en ze terugbrengt."
              : "Who is in charge of the register that day and brings it back."}
          </p>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-vtk-ink">
          {nl ? "Betalen met de kaart" : "Card payments"}
        </legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm text-vtk-body">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="wantsBancontact" defaultChecked={values.wantsBancontact} />
            {nl ? "Bancontact nodig" : "Bancontact needed"}
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="wantsPayconiq" defaultChecked={values.wantsPayconiq} />
            {nl ? "Payconiq nodig" : "Payconiq needed"}
          </label>
        </div>
      </fieldset>

      {floatMode !== "keep" && (
        <fieldset>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <legend className="text-sm font-medium text-vtk-ink">
              {nl ? "Startkassa (wisselgeld)" : "Starting float (change)"}
            </legend>
            <span className="text-sm text-vtk-body">
              {nl ? "Totaal" : "Total"}{" "}
              <strong className="tabular-nums text-vtk-ink">{formatEuro(total, locale)}</strong>
            </span>
          </div>
          {floatMode === "pick" ? (
            <>
              <p className="mb-3 mt-1 text-xs text-vtk-muted">
                {nl
                  ? "Duid aan welk wisselgeld je nodig hebt. Je krijgt telkens een volle rol munten of het aantal briefjes dat erop staat. Iets anders nodig, zoals 5 cent of een briefje van € 50? Zet het in de opmerking."
                  : "Tick the change you need. You get a full roll of coins or the number of notes shown. Need something else, like 5 cent or a € 50 note? Put it in the note."}
              </p>
              <FloatPicker locale={locale} picked={picked} onChange={setPicked} current={values.startCounts} />
            </>
          ) : (
            <>
              <p className="mb-3 mt-1 text-xs text-vtk-muted">
                {nl
                  ? "Hoeveel stuks van elke munt en elk briefje er in de kassa zitten. Laat leeg wat er niet in zit."
                  : "How many pieces of each coin and note are in the register. Leave empty what is not in it."}
              </p>
              <DenominationGrid
                locale={locale}
                prefix="start_"
                idPrefix="start"
                values={start}
                onChange={setStart}
              />
            </>
          )}
        </fieldset>
      )}

      <div>
        <Label htmlFor="comment">{nl ? "Opmerking (optioneel)" : "Note (optional)"}</Label>
        <Textarea
          id="comment"
          name="comment"
          rows={3}
          maxLength={2000}
          defaultValue={values.comment}
          placeholder={
            nl
              ? "bv. we hebben de kassa al op donderdag nodig"
              : "e.g. we need the register on Thursday already"
          }
        />
      </div>
    </SaveForm>
  );
}
