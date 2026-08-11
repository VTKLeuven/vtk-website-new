"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export type ThemedSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/**
 * Toegankelijke keuzelijst met de eigen site-opmaak.
 *
 * De echte waarde zit in een visueel verborgen input, zodat gewone GET-forms,
 * server actions en autosave dezelfde FormData blijven ontvangen als bij een
 * native select.
 */
export function ThemedSelect({
  id,
  name,
  options,
  value,
  defaultValue,
  onChange,
  disabled = false,
  required = false,
  ariaLabel,
  ariaDescribedBy,
  invalid = false,
  variant = "admin",
}: {
  id?: string;
  name: string;
  options: readonly ThemedSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  invalid?: boolean;
  variant?: "admin" | "public";
}) {
  const generatedId = useId();
  const buttonId = id ?? generatedId;
  const listId = `${buttonId}-options`;
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? options.find((option) => !option.disabled)?.value ?? ""
  );
  const selectedValue = controlled ? value : internalValue;
  const selected = options.find((option) => option.value === selectedValue);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedValue)
  );
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  function moveHighlight(direction: -1 | 1, from = highlighted) {
    if (options.length === 0) return;
    let next = from;
    do {
      next = (next + direction + options.length) % options.length;
    } while (options[next]?.disabled && next !== from);
    setHighlighted(next);
  }

  function choose(nextValue: string) {
    const option = options.find((item) => item.value === nextValue);
    if (!option || option.disabled) return;
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
    buttonRef.current?.focus();

    // Een programmatische React-wijziging op de verborgen input vuurt zelf
    // geen input-event af. Autosave luistert net naar dat event.
    requestAnimationFrame(() => {
      inputRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      moveHighlight(event.key === "ArrowDown" ? 1 : -1, open ? highlighted : selectedIndex);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const candidates = options
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => !option.disabled);
      const target = event.key === "Home" ? candidates[0] : candidates.at(-1);
      if (target) setHighlighted(target.index);
      setOpen(true);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      const option = options[highlighted];
      if (option) choose(option.value);
    }
  }

  return (
    <div
      ref={rootRef}
      className="vtk-themed-select"
      data-open={open || undefined}
      data-variant={variant}
    >
      <input
        ref={inputRef}
        className="vtk-themed-select-value"
        name={name}
        value={selectedValue}
        required={required}
        disabled={disabled}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        onInvalid={(event) => {
          event.preventDefault();
          buttonRef.current?.focus();
          setOpen(true);
        }}
      />
      <button
        ref={buttonRef}
        id={buttonId}
        className="vtk-themed-select-trigger"
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${listId}-${highlighted}` : undefined}
        disabled={disabled}
        onClick={() => {
          if (!open) setHighlighted(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.label ?? ""}</span>
        <ChevronDown aria-hidden="true" size={17} />
      </button>
      {open ? (
        <div id={listId} className="vtk-themed-select-options" role="listbox">
          {options.map((option, index) => (
            <button
              id={`${listId}-${index}`}
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === selectedValue}
              data-highlighted={index === highlighted || undefined}
              disabled={option.disabled}
              onPointerMove={() => setHighlighted(index)}
              onClick={() => choose(option.value)}
            >
              <span>{option.label}</span>
              {option.value === selectedValue ? <Check aria-hidden="true" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
