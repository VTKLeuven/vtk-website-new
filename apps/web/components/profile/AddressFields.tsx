"use client";

import { useId, useState } from "react";
import { Input, Label } from "@vtk/ui";

export type AddressValues = {
  noKot: boolean;
  street: string | null;
  houseNumber: string | null;
  bus: string | null;
  postalCode: string | null;
  city: string | null;
  homeStreet: string | null;
  homeHouseNumber: string | null;
  homeBus: string | null;
  homePostalCode: string | null;
  homeCity: string | null;
};

export type AddressLabels = {
  noKot: string;
  kotAddressHeading: string;
  homeAddressHeading: string;
  homeAddressHint: string;
  street: string;
  houseNumber: string;
  bus: string;
  busHint: string;
  postalCode: string;
  city: string;
};

function AddressInputs({
  prefix,
  idPrefix,
  values,
  labels,
  disabled = false,
}: {
  prefix: "" | "home";
  idPrefix: string;
  values: AddressValues;
  labels: AddressLabels;
  disabled?: boolean;
}) {
  const field = (name: "Street" | "HouseNumber" | "Bus" | "PostalCode" | "City") =>
    prefix ? `${prefix}${name}` : `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  const value = (name: ReturnType<typeof field>) => values[name as keyof AddressValues] as string | null;

  const street = field("Street");
  const houseNumber = field("HouseNumber");
  const bus = field("Bus");
  const postalCode = field("PostalCode");
  const city = field("City");
  const id = (name: string) => `${idPrefix}-${name}`;
  const section = prefix === "home" ? "section-home" : "section-kot";

  return (
    <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-6">
      <div className="sm:col-span-3">
        <Label htmlFor={id(street)}>{labels.street}</Label>
        <Input
          id={id(street)}
          name={street}
          autoComplete={`${section} address-line1`}
          defaultValue={value(street) ?? ""}
          required={!disabled}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-1">
        <Label htmlFor={id(houseNumber)}>{labels.houseNumber}</Label>
        <Input
          id={id(houseNumber)}
          name={houseNumber}
          autoComplete={`${section} address-line2`}
          defaultValue={value(houseNumber) ?? ""}
          required={!disabled}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={id(bus)} className="whitespace-nowrap">
          {labels.bus} <span className="text-xs text-[#5c667f]">({labels.busHint})</span>
        </Label>
        <Input
          id={id(bus)}
          name={bus}
          autoComplete={`${section} address-line3`}
          defaultValue={value(bus) ?? ""}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={id(postalCode)}>{labels.postalCode}</Label>
        <Input
          id={id(postalCode)}
          name={postalCode}
          autoComplete={`${section} postal-code`}
          defaultValue={value(postalCode) ?? ""}
          required={!disabled}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-4">
        <Label htmlFor={id(city)}>{labels.city}</Label>
        <Input
          id={id(city)}
          name={city}
          autoComplete={`${section} address-level2`}
          defaultValue={value(city) ?? ""}
          required={!disabled}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/** De gedeelde editor voor onboarding, account en jaarlijkse bevestiging. */
export function AddressFields({ values, labels }: { values: AddressValues; labels: AddressLabels }) {
  const [noKot, setNoKot] = useState(values.noKot);
  const idPrefix = useId();
  const homeHintId = `${idPrefix}-home-hint`;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-vtk-muted/80 bg-vtk-blue-soft/35 px-3 py-2 text-sm font-medium text-vtk-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-vtk-ink">
          <input
            type="checkbox"
            name="noKot"
            checked={noKot}
            onChange={(event) => setNoKot(event.target.checked)}
          />
          {labels.noKot}
        </label>

        <fieldset className="space-y-3" disabled={noKot} hidden={noKot}>
          <legend className="text-sm font-semibold text-vtk-ink">{labels.kotAddressHeading}</legend>
          <AddressInputs
            prefix=""
            idPrefix={idPrefix}
            values={values}
            labels={labels}
            disabled={noKot}
          />
        </fieldset>
      </div>

      <div className="border-t border-vtk-blue/10 pt-5">
        <fieldset className="space-y-3" aria-describedby={homeHintId}>
          <legend className="text-sm font-semibold text-vtk-ink">{labels.homeAddressHeading}</legend>
          <p id={homeHintId} className="text-xs text-[#5c667f]">{labels.homeAddressHint}</p>
          <AddressInputs prefix="home" idPrefix={idPrefix} values={values} labels={labels} />
        </fieldset>
      </div>
    </div>
  );
}
