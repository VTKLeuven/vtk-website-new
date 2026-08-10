"use client";

import { useId } from "react";
import { Markdown } from "@/components/ui/Markdown";
import type { AnswerValue } from "@/lib/forms/visibility";
import { storageKeyPath } from "@/lib/storageKeyPath";
import {
  FormFieldInput,
  fieldLabel,
  type FieldLocale,
  type PublicFormField,
} from "./FormFieldInput";

/**
 * Label, toelichting, eventuele afbeelding, het veld zelf en zijn foutmelding.
 *
 * De foutmelding hangt via `aria-describedby` aan het veld, zodat een
 * screenreader ze voorleest bij het veld waar ze over gaat en niet als losse
 * regel ergens op de pagina.
 */
export function FormFieldBlock({
  field,
  value,
  onChange,
  locale,
  error,
  disabled = false,
  shuffleSeed = "",
}: {
  field: PublicFormField;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  locale: FieldLocale;
  error?: string | null;
  disabled?: boolean;
  shuffleSeed?: string;
}) {
  const uid = useId();
  const helpId = `${uid}-help`;
  const errorId = `${uid}-error`;
  const help = locale === "en" && field.helpEn ? field.helpEn : field.helpNl;
  // Ja/nee en toestemming dragen hun label in het vinkje zelf; een tweede label
  // erboven leest dubbel.
  const labelInsideInput = field.type === "BOOLEAN" || field.type === "CONSENT";

  const describedBy = [help ? helpId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="vtk-form-field" data-invalid={error ? "true" : undefined}>
      {labelInsideInput ? null : (
        <span className="vtk-form-label">
          {fieldLabel(field, locale)}
          {field.required ? (
            <span className="vtk-form-required" aria-hidden="true">
              *
            </span>
          ) : null}
          {field.required ? (
            <span className="sr-only">{locale === "nl" ? "(verplicht)" : "(required)"}</span>
          ) : null}
        </span>
      )}

      {field.config.imageKey ? (
        // eslint-disable-next-line @next/next/no-img-element -- vrije verhouding, geen vaste maat bekend
        <img
          className="vtk-form-image"
          src={`/api/media/${storageKeyPath(field.config.imageKey)}`}
          alt=""
          loading="lazy"
        />
      ) : null}

      {help ? (
        <div className="vtk-form-help prose-vtk" id={helpId}>
          <Markdown>{help}</Markdown>
        </div>
      ) : null}

      <FormFieldInput
        field={field}
        value={value}
        onChange={onChange}
        locale={locale}
        disabled={disabled}
        shuffleSeed={shuffleSeed}
        describedById={describedBy || undefined}
        invalid={Boolean(error)}
      />

      {error ? (
        <p className="vtk-form-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
