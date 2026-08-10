"use client";

import { useId, useMemo } from "react";
import type { AnswerValue } from "@/lib/forms/visibility";
import {
  DEFAULT_SCALE_MAX,
  DEFAULT_SCALE_MIN,
  isMultiChoiceType,
  type FormFieldConfig,
} from "@/lib/forms/schema";

/**
 * Eén veld, zoals de bezoeker het ziet.
 *
 * Deze component wordt door twee schermen gebruikt: het publieke formulier en
 * de live preview in de veldeditor. Bewust dezelfde, want een preview die er
 * net iets anders uitziet dan het echte formulier is erger dan geen preview.
 */

export type PublicFormOption = {
  id: string;
  code: string;
  labelNl: string;
  labelEn: string | null;
  /** Vol: de optie blijft zichtbaar maar is niet meer te kiezen. */
  soldOut?: boolean;
  remaining?: number | null;
};

export type PublicFormField = {
  id: string;
  code: string;
  type: string;
  labelNl: string;
  labelEn: string | null;
  helpNl: string | null;
  helpEn: string | null;
  required: boolean;
  config: FormFieldConfig;
  options: PublicFormOption[];
};

export type FieldLocale = "nl" | "en";

function pickText(nl: string | null, en: string | null, locale: FieldLocale): string {
  if (locale === "en" && en) return en;
  return nl ?? "";
}

export function fieldLabel(field: PublicFormField, locale: FieldLocale): string {
  return pickText(field.labelNl, field.labelEn, locale);
}

/** Husselt stabiel per bezoeker: bij elke hertekening dezelfde volgorde. */
function shuffled<T>(items: T[], seed: string): T[] {
  const decorated = items.map((item, index) => {
    let hash = 0;
    const key = `${seed}:${index}`;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return { item, hash };
  });
  decorated.sort((a, b) => a.hash - b.hash);
  return decorated.map((entry) => entry.item);
}

export function FormFieldInput({
  field,
  value,
  onChange,
  locale,
  disabled = false,
  shuffleSeed = "",
  describedById,
  invalid = false,
}: {
  field: PublicFormField;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  locale: FieldLocale;
  disabled?: boolean;
  shuffleSeed?: string;
  describedById?: string;
  invalid?: boolean;
}) {
  const uid = useId();
  const inputId = `${uid}-${field.code}`;
  const config = field.config;

  const options = useMemo(() => {
    const active = field.options;
    return config.shuffle ? shuffled(active, `${shuffleSeed}:${field.id}`) : active;
  }, [field.options, field.id, config.shuffle, shuffleSeed]);

  const common = {
    id: inputId,
    disabled,
    required: field.required,
    "aria-describedby": describedById,
    "aria-invalid": invalid || undefined,
  };

  switch (field.type) {
    case "LONG_TEXT":
      return (
        <textarea
          {...common}
          className="vtk-form-input"
          rows={config.rows ?? 5}
          maxLength={config.maxLength ?? undefined}
          placeholder={config.placeholder ?? undefined}
          value={value.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      );

    case "NUMBER":
      return (
        <input
          {...common}
          className="vtk-form-input"
          type="number"
          inputMode={config.integerOnly ? "numeric" : "decimal"}
          min={config.min ?? undefined}
          max={config.max ?? undefined}
          step={config.integerOnly ? 1 : "any"}
          placeholder={config.placeholder ?? undefined}
          value={value.number ?? ""}
          onChange={(event) =>
            onChange({ number: event.target.value === "" ? null : Number(event.target.value) })
          }
        />
      );

    case "DATE":
      return (
        <input
          {...common}
          className="vtk-form-input"
          type="date"
          min={config.minDate ?? undefined}
          max={config.maxDate ?? undefined}
          value={value.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      );

    case "TIME":
      return (
        <input
          {...common}
          className="vtk-form-input"
          type="time"
          value={value.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      );

    case "EMAIL":
    case "PHONE":
    case "URL":
      return (
        <input
          {...common}
          className="vtk-form-input"
          type={field.type === "EMAIL" ? "email" : field.type === "URL" ? "url" : "tel"}
          maxLength={config.maxLength ?? undefined}
          placeholder={config.placeholder ?? undefined}
          value={value.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      );

    case "BOOLEAN":
    case "CONSENT":
      return (
        <label className="vtk-form-check">
          <input
            {...common}
            type="checkbox"
            checked={Boolean(value.checked)}
            onChange={(event) => onChange({ checked: event.target.checked })}
          />
          <span>{fieldLabel(field, locale)}</span>
        </label>
      );

    case "SCALE": {
      const min = config.min ?? DEFAULT_SCALE_MIN;
      const max = config.max ?? DEFAULT_SCALE_MAX;
      const steps = Array.from({ length: max - min + 1 }, (_, index) => min + index);
      const stars = config.display === "stars";
      return (
        <div
          className="vtk-form-scale"
          role="radiogroup"
          aria-label={fieldLabel(field, locale)}
          aria-describedby={describedById}
        >
          {config.minLabelNl || config.minLabelEn ? (
            <span className="vtk-form-scale-label">
              {pickText(config.minLabelNl ?? null, config.minLabelEn ?? null, locale)}
            </span>
          ) : null}
          {steps.map((step) => (
            <label key={step} className="vtk-form-scale-step" data-stars={stars || undefined}>
              <input
                type="radio"
                name={inputId}
                value={step}
                disabled={disabled}
                checked={value.number === step}
                onChange={() => onChange({ number: step })}
              />
              <span aria-hidden={stars || undefined}>{stars ? "★" : step}</span>
              {stars ? <span className="sr-only">{step}</span> : null}
            </label>
          ))}
          {config.maxLabelNl || config.maxLabelEn ? (
            <span className="vtk-form-scale-label">
              {pickText(config.maxLabelNl ?? null, config.maxLabelEn ?? null, locale)}
            </span>
          ) : null}
        </div>
      );
    }

    case "DROPDOWN":
      return (
        <select
          {...common}
          className="vtk-form-input"
          value={value.options?.[0] ?? ""}
          onChange={(event) =>
            onChange({ options: event.target.value ? [event.target.value] : [] })
          }
        >
          <option value="">{locale === "nl" ? "Maak een keuze" : "Choose an option"}</option>
          {options.map((option) => (
            <option key={option.id} value={option.code} disabled={option.soldOut}>
              {pickText(option.labelNl, option.labelEn, locale)}
              {option.soldOut ? (locale === "nl" ? " (volzet)" : " (full)") : ""}
            </option>
          ))}
        </select>
      );

    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      const multiple = isMultiChoiceType(field.type);
      const selected = value.options ?? [];
      return (
        <div
          className="vtk-form-options"
          role={multiple ? "group" : "radiogroup"}
          aria-label={fieldLabel(field, locale)}
          aria-describedby={describedById}
        >
          {options.map((option) => (
            <label
              key={option.id}
              className="vtk-form-check"
              data-disabled={option.soldOut || undefined}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={inputId}
                value={option.code}
                // Wie de optie al aanduidde voor ze volliep, mag ze houden;
                // anders verliest hij bij het bewerken stil zijn keuze.
                disabled={disabled || (option.soldOut && !selected.includes(option.code))}
                checked={selected.includes(option.code)}
                onChange={(event) => {
                  if (!multiple) {
                    onChange({ options: [option.code], text: value.text ?? null });
                    return;
                  }
                  const next = event.target.checked
                    ? [...selected, option.code]
                    : selected.filter((code) => code !== option.code);
                  onChange({ options: next, text: value.text ?? null });
                }}
              />
              <span>
                {pickText(option.labelNl, option.labelEn, locale)}
                {option.soldOut ? (
                  <em className="vtk-form-soldout">
                    {locale === "nl" ? "volzet" : "full"}
                  </em>
                ) : option.remaining != null ? (
                  <em className="vtk-form-remaining">
                    {locale === "nl"
                      ? `nog ${option.remaining} plaatsen`
                      : `${option.remaining} spots left`}
                  </em>
                ) : null}
              </span>
            </label>
          ))}

          {config.allowOther ? (
            <label className="vtk-form-other">
              <span>
                {pickText(
                  config.otherLabelNl ?? "Andere, namelijk",
                  config.otherLabelEn ?? "Other, namely",
                  locale
                )}
              </span>
              <input
                className="vtk-form-input"
                type="text"
                maxLength={300}
                disabled={disabled}
                value={value.text ?? ""}
                onChange={(event) =>
                  onChange({ options: selected, text: event.target.value })
                }
              />
            </label>
          ) : null}
        </div>
      );
    }

    case "FILE":
      // De echte upload met voortgang zit in FormFileField; hier staat enkel
      // de keuzeknop, zodat de preview toont wat de bezoeker te zien krijgt.
      return (
        <input
          {...common}
          className="vtk-form-input"
          type="file"
          multiple={(config.maxFiles ?? 1) > 1}
          accept={config.allowedExtensions?.map((extension) => `.${extension}`).join(",")}
          disabled
        />
      );

    case "PROFILE":
    case "SHORT_TEXT":
    default:
      return (
        <input
          {...common}
          className="vtk-form-input"
          type="text"
          maxLength={config.maxLength ?? undefined}
          placeholder={config.placeholder ?? undefined}
          value={value.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      );
  }
}
