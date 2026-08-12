"use client";

export type ExclusiveChoice = {
  value: string;
  label: string;
  description?: string;
  /** Zichtbaar maar niet te kiezen (bv. uitverkocht). Weglaten leest als verdwenen. */
  disabled?: boolean;
};

/** Eén keuze uit enkele duidelijke kaarten, als leesbaar alternatief voor een dropdown. */
export function ExclusiveChoiceGroup({
  name,
  value,
  options,
  onChange,
  columns = 3,
  ariaLabel,
}: {
  name: string;
  value: string;
  options: readonly ExclusiveChoice[];
  onChange: (value: string) => void;
  columns?: 2 | 3;
  ariaLabel: string;
}) {
  return (
    <div
      className="vtk-exclusive-choices"
      data-columns={columns}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <label
          key={option.value}
          data-selected={value === option.value || undefined}
          data-disabled={option.disabled || undefined}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span>
            <strong>{option.label}</strong>
            {option.description ? <small>{option.description}</small> : null}
          </span>
        </label>
      ))}
    </div>
  );
}
