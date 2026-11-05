"use client";

import { useId, useState } from "react";
import { Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { formatEuro } from "@/lib/rekeningen/expenses";

export type CarryOverCandidate = {
  id: string;
  activity: string;
  /** "13/10/2026 20:00-23:00: Cantus (Cultuur), te maken", zoals in de keuzelijst. */
  optionLabel: string;
  /** "Cantus (13/10/2026)", voor de bevestiging. */
  shortLabel: string;
  startCents: number;
  /** Haar startkassa is al deze eindkassa, per coupure. */
  matchesEnd: boolean;
  /** Al geteld: dan verschuift haar resultaat mee. Enkel mogelijk voor de huidige. */
  counted: boolean;
  /** De andere kassa waarvan haar startkassa nu komt, of `null`. */
  fromOther: string | null;
};

/**
 * De eindkassa als startkassa van een volgende kassa zetten. De keuzelijst toont
 * meteen wat de startkassa daar nu is en wat ze wordt, en de bevestiging zegt
 * wat er verandert en wat blijft, want het overschrijft de startkassa van een
 * andere kassa.
 */
export function CarryOverForm({
  locale,
  action,
  id,
  counted,
  endCents,
  candidates,
  currentTargetId,
  errorMessages,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  id: string;
  counted: boolean;
  /** De eindkassa van deze kassa; enkel betekenisvol als `counted`. */
  endCents: number;
  candidates: CarryOverCandidate[];
  /** De kassa die er al mee verderging, of `null`. */
  currentTargetId: string | null;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const uid = useId();
  const [targetId, setTargetId] = useState(currentTargetId ?? candidates[0]?.id ?? "");
  const target = candidates.find((candidate) => candidate.id === targetId) ?? null;
  const current = candidates.find((candidate) => candidate.id === currentTargetId) ?? null;
  const euro = (cents: number) => formatEuro(cents, locale);

  const description = target
    ? [
        nl
          ? `De startkassa van ${target.shortLabel} wordt ${euro(endCents)}: de eindkassa van deze kassa, per munt en briefje. Nu staat ze op ${euro(target.startCents)}.`
          : `The starting float of ${target.shortLabel} becomes ${euro(endCents)}: this register's closing count, coin by coin and note by note. It is ${euro(target.startCents)} now.`,
        target.counted
          ? nl
            ? `${target.activity} is al geteld, dus haar resultaat verschuift mee.`
            : `${target.activity} has already been counted, so its result shifts too.`
          : "",
        target.fromOther
          ? nl
            ? `Die startkassa kwam van ${target.fromOther}; die koppeling vervalt.`
            : `That float came from ${target.fromOther}; that link goes away.`
          : "",
        current && current.id !== target.id
          ? nl
            ? `${current.shortLabel} houdt haar startkassa, maar staat niet langer als vervolg van deze kassa.`
            : `${current.shortLabel} keeps its starting float, but is no longer listed as the follow-up of this register.`
          : "",
        nl
          ? "De bonnen, Bancontact en Payconiq blijven bij deze kassa."
          : "Vouchers, Bancontact and Payconiq stay with this register.",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Doorschuiven" : "Carry over"}
      savingLabel={nl ? "Bezig met doorschuiven..." : "Carrying over..."}
      savedMessage={nl ? "Doorgeschoven." : "Carried over."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Doorschuiven mislukt." : "Could not carry over."}
      resetOnSuccess={false}
      submitDisabled={!counted || !target}
      confirmSubmit={
        target
          ? {
              title: nl ? "Eindkassa doorschuiven?" : "Carry over the closing count?",
              description,
              confirmLabel: nl ? "Doorschuiven" : "Carry over",
              cancelLabel: nl ? "Annuleren" : "Cancel",
            }
          : null
      }
      className="space-y-3"
    >
      <input type="hidden" name="id" value={id} />
      <div className="max-w-xl">
        <Label htmlFor={`${uid}-target`}>{nl ? "Volgende kassa" : "Next register"}</Label>
        <Select
          id={`${uid}-target`}
          name="targetId"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          disabled={!counted}
        >
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.optionLabel}
            </option>
          ))}
        </Select>
        {target && counted ? (
          <p className="mt-1 text-xs text-vtk-muted">
            {target.matchesEnd ? (
              nl ? (
                "Daar staat deze eindkassa al als startkassa."
              ) : (
                "This closing count is already its starting float."
              )
            ) : (
              <>
                {nl ? "Startkassa daar nu " : "Starting float there now "}
                <span className="tabular-nums">{euro(target.startCents)}</span>
                {nl ? ", na het doorschuiven " : ", after carrying over "}
                <strong className="tabular-nums text-vtk-ink">{euro(endCents)}</strong>.
              </>
            )}
          </p>
        ) : null}
      </div>
    </SaveForm>
  );
}
