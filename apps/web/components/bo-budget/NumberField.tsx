'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { parseNumber, plain } from './format';

/**
 * Een getal zoals in een rekenblad: je typt "9,59" of "80,5", met de komma,
 * en zolang het veld de focus heeft, blijft staan wat je typte ("80," wordt
 * geen "80"). Pas bij het verlaten zet het veld het getal netjes.
 *
 * `percent` toont 0,805 als 80,5 en geeft 0,805 terug.
 */
export function NumberField({
  value,
  onValue,
  percent = false,
  decimals,
  allowEmpty = false,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined;
  onValue: (value: number | null) => void;
  percent?: boolean;
  /** Vast aantal decimalen bij het tonen (bedragen: 2). */
  decimals?: number;
  allowEmpty?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    value == null || Number.isNaN(value)
      ? ''
      : decimals != null
        ? new Intl.NumberFormat('nl-BE', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: Math.max(decimals, 4),
          })
            .format(percent ? value * 100 : value)
            .replace('-', '\u2212')
        : plain(percent ? Math.round(value * 1e8) / 1e6 : value);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      value={draft ?? shown}
      onFocus={(event) => {
        setDraft(shown);
        rest.onFocus?.(event);
      }}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const n = parseNumber(text);
        if (n === null) {
          if (allowEmpty && text.trim() === '') onValue(null);
          return;
        }
        onValue(percent ? n / 100 : n);
      }}
      onBlur={(event) => {
        setDraft(null);
        rest.onBlur?.(event);
      }}
    />
  );
}
