'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { parseNumber, plain } from './format';

/**
 * Een getal zoals in een rekenblad: je typt "9,59" of "80,5", met de komma,
 * en zolang het veld de focus heeft, blijft staan wat je typte ("80," wordt
 * geen "80"). Pas bij het verlaten zet het veld het getal netjes.
 *
 * `percent` toont 0,805 als 80,5 en geeft 0,805 terug.
 *
 * Met `onFormula` neemt het veld ook een berekening aan, zoals een cel:
 * "=2,79/4" of "=[Aantal bedrijven]*2". Het veld toont het antwoord, en de
 * berekening zodra je erin klikt. De editor rekent ze uit (`formula.ts`).
 */
export function NumberField({
  value,
  onValue,
  percent = false,
  decimals,
  allowEmpty = false,
  className,
  formula,
  onFormula,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined;
  onValue: (value: number | null) => void;
  percent?: boolean;
  /** Vast aantal decimalen bij het tonen (bedragen: 2). */
  decimals?: number;
  allowEmpty?: boolean;
  /** De berekening achter dit getal, als er een is. */
  formula?: string;
  /** Het veld neemt berekeningen aan; null wist ze. */
  onFormula?: (formula: string | null) => void;
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
  const commit = (text: string) => {
    if (!onFormula) return;
    if (text.trim().startsWith('=') && text.trim().length > 1) {
      if (text.trim() !== formula) onFormula(text.trim());
    } else if (formula) onFormula(null);
  };
  return (
    <input
      {...rest}
      type="text"
      inputMode={onFormula ? 'text' : 'decimal'}
      autoComplete="off"
      className={className}
      data-fx={formula ? '1' : undefined}
      title={formula ? `${formula}${rest.title ? ` · ${rest.title}` : ''}` : rest.title}
      value={draft ?? shown}
      onFocus={(event) => {
        setDraft(formula ?? shown);
        rest.onFocus?.(event);
      }}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        // Een berekening telt pas wanneer ze af is: bij Enter of het verlaten van het veld.
        if (onFormula && text.trim().startsWith('=')) return;
        const n = parseNumber(text);
        if (n === null) {
          if (allowEmpty && text.trim() === '') onValue(null);
          return;
        }
        onValue(percent ? n / 100 : n);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && draft != null) commit(draft);
        rest.onKeyDown?.(event);
      }}
      onBlur={(event) => {
        if (draft != null) commit(draft);
        setDraft(null);
        rest.onBlur?.(event);
      }}
    />
  );
}
