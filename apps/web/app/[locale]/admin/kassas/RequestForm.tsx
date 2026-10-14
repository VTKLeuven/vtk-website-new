"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { formatEuro } from "@/lib/rekeningen/expenses";
import type { Counts } from "@/lib/kassas/kassa";
import { countInputsFrom, DenominationGrid, inputsTotalCents } from "./DenominationGrid";

export type RequestFormValues = {
  id?: string;
  date: string;
  activity: string;
  groupId: string;
  responsibleName: string;
  wantsBancontact: boolean;
  wantsPayconiq: boolean;
  comment: string;
  startCounts: Counts;
};

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
  labels,
  redirectAfter,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  posts: Array<{ id: string; name: string }>;
  values: RequestFormValues;
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
  const [start, setStart] = useState(() => countInputsFrom(values.startCounts, true));
  const total = inputsTotalCents(start);

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="date">{nl ? "Datum van de activiteit" : "Date of the activity"}</Label>
          <Input id="date" name="date" type="date" required defaultValue={values.date} />
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
        <p className="mb-3 mt-1 text-xs text-vtk-muted">
          {nl
            ? "Hoeveel stuks je van elke munt en elk briefje wil om wisselgeld te kunnen geven. Laat leeg wat je niet nodig hebt."
            : "How many pieces of each coin and note you want, so you can give change. Leave empty what you do not need."}
        </p>
        <DenominationGrid
          locale={locale}
          prefix="start_"
          idPrefix="start"
          values={start}
          onChange={setStart}
        />
      </fieldset>

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
