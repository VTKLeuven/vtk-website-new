"use client";

import { useState } from "react";
import { AddressFields, type AddressLabels, type AddressValues } from "./AddressFields";

type ConfirmationLabels = {
  heading: string;
  question: string;
  yes: string;
  no: string;
  incomplete: string;
  noKot: string;
  kotAddress: string;
  homeAddress: string;
};

function formattedAddress(
  values: AddressValues,
  prefix: "" | "home",
  busLabel: string,
): string[] {
  const get = (name: "Street" | "HouseNumber" | "Bus" | "PostalCode" | "City") => {
    const key = prefix
      ? `${prefix}${name}`
      : `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
    return values[key as keyof AddressValues] as string | null;
  };
  const street = [get("Street"), get("HouseNumber"), get("Bus") ? `${busLabel} ${get("Bus")}` : null]
    .filter(Boolean)
    .join(" ");
  const city = [get("PostalCode"), get("City")].filter(Boolean).join(" ");
  return [street, city].filter(Boolean);
}

/**
 * Jaarlijkse vraag met een snelle bevestiging voor volledige profielen en de
 * gedeelde adreseditor zodra iets gewijzigd of nog onvolledig is.
 */
export function AddressConfirmation({
  values,
  complete,
  addressLabels,
  labels,
}: {
  values: AddressValues;
  complete: boolean;
  addressLabels: AddressLabels;
  labels: ConfirmationLabels;
}) {
  const [answer, setAnswer] = useState<"yes" | "no">(complete ? "yes" : "no");
  const kot = formattedAddress(values, "", addressLabels.bus);
  const home = formattedAddress(values, "home", addressLabels.bus);

  return (
    <section className="space-y-4 border-t border-vtk-blue/10 pt-6">
      <div>
        <h2 className="text-lg font-semibold text-vtk-ink">{labels.heading}</h2>
        <p className="mt-1 text-sm text-[#5c667f]">{labels.question}</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-vtk-ink">
          <input
            type="radio"
            name="addressesCorrect"
            value="yes"
            checked={answer === "yes"}
            disabled={!complete}
            onChange={() => setAnswer("yes")}
          />
          {labels.yes}
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-vtk-ink">
          <input
            type="radio"
            name="addressesCorrect"
            value="no"
            checked={answer === "no"}
            onChange={() => setAnswer("no")}
          />
          {labels.no}
        </label>
      </div>

      {!complete && <p className="text-sm text-[#5c667f]">{labels.incomplete}</p>}

      {answer === "yes" ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/25 p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
              {labels.kotAddress}
            </dt>
            <dd className="mt-1 whitespace-pre-line text-sm text-vtk-ink">
              {values.noKot ? labels.noKot : kot.join("\n")}
            </dd>
          </div>
          <div className="rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/25 p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
              {labels.homeAddress}
            </dt>
            <dd className="mt-1 whitespace-pre-line text-sm text-vtk-ink">{home.join("\n")}</dd>
          </div>
        </dl>
      ) : (
        <AddressFields values={values} labels={addressLabels} />
      )}
    </section>
  );
}
