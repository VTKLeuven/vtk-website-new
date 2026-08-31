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

  return (
    <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-6">
      <div className="sm:col-span-3">
        <Label htmlFor={id(street)}>{labels.street}</Label>
        <Input
          id={id(street)}
          name={street}
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
          defaultValue={value(houseNumber) ?? ""}
          required={!disabled}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={id(bus)} className="whitespace-nowrap">
          {labels.bus} <span className="text-xs text-[#5c667f]">({labels.busHint})</span>
        </Label>
        <Input id={id(bus)} name={bus} defaultValue={value(bus) ?? ""} disabled={disabled} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={id(postalCode)}>{labels.postalCode}</Label>
        <Input
          id={id(postalCode)}
          name={postalCode}
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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/35 px-3 py-2 text-sm font-medium text-vtk-ink">
          <input
            type="checkbox"
            name="noKot"
            checked={noKot}
            onChange={(event) => setNoKot(event.target.checked)}
          />
          {labels.noKot}
        </label>

        <div className={noKot ? "hidden" : "space-y-3"} aria-hidden={noKot}>
          <h3 className="text-sm font-semibold text-vtk-ink">{labels.kotAddressHeading}</h3>
          <AddressInputs
            prefix=""
            idPrefix={idPrefix}
            values={values}
            labels={labels}
            disabled={noKot}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-vtk-blue/10 pt-5">
        <div>
          <h3 className="text-sm font-semibold text-vtk-ink">{labels.homeAddressHeading}</h3>
          <p className="mt-1 text-xs text-[#5c667f]">{labels.homeAddressHint}</p>
        </div>
        <AddressInputs prefix="home" idPrefix={idPrefix} values={values} labels={labels} />
      </div>
    </div>
  );
}
