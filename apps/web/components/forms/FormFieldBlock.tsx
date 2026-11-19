"use client";

import { useId } from "react";
import dynamic from "next/dynamic";

// Via `next/dynamic`: de markdown-renderer (react-markdown, micromark en, via de
// fotogalerij, beide woordenboeken) is ~80 KB gzip. Statisch geïmporteerd kwam
// hij in een chunk die de bundler deelt met `Link` en dus op elke pagina laadde;
// zo komt hij enkel mee waar er echt markdown gerenderd wordt.
const Markdown = dynamic(() => import("@/components/ui/Markdown").then((m) => m.Markdown));
import type { AnswerValue } from "@/lib/forms/visibility";
import { storageKeyPath } from "@/lib/storageKeyPath";
import {
  FormFieldInput,
  fieldLabel,
  type FieldLocale,
  type PublicFormField,
} from "./FormFieldInput";

const NON_NATIVE_LABEL_TYPES = new Set([
  "BOOLEAN",
  "CONSENT",
  "DROPDOWN",
  "CALENDAR_EVENT",
  "SCALE",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
]);

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
  const inputId = `${uid}-${field.code}`;
  const labelId = `${uid}-label`;
  const helpId = `${uid}-help`;
  const errorId = `${uid}-error`;
  const help = locale === "en" && field.helpEn ? field.helpEn : field.helpNl;
  // Ja/nee en toestemming dragen hun label in het vinkje zelf; een tweede label
  // erboven leest dubbel.
  const labelInsideInput = field.type === "BOOLEAN" || field.type === "CONSENT";
  const usesNativeLabel = !NON_NATIVE_LABEL_TYPES.has(field.type);

  const describedBy = [help ? helpId : null, Boolean(error) ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const labelContent = (
    <>
      {fieldLabel(field, locale)}
      {field.required ? (
        <>
          <span className="vtk-form-required" aria-hidden="true">
            *
          </span>
          <span className="sr-only">{locale === "nl" ? " (verplicht)" : " (required)"}</span>
        </>
      ) : null}
    </>
  );

  return (
    <div className="vtk-form-field" data-invalid={error ? "true" : undefined}>
      {labelInsideInput ? null : usesNativeLabel ? (
        <label id={labelId} htmlFor={inputId} className="vtk-form-label">
          {labelContent}
        </label>
      ) : (
        <span id={labelId} className="vtk-form-label">
          {labelContent}
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
          <Markdown baseHeadingLevel={4} locale={locale}>
            {help}
          </Markdown>
        </div>
      ) : null}

      <FormFieldInput
        field={field}
        value={value}
        onChange={onChange}
        locale={locale}
        disabled={disabled}
        shuffleSeed={shuffleSeed}
        inputId={inputId}
        labelId={labelId}
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
