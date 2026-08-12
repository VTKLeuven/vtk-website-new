'use client';

import { useState, type ReactNode } from 'react';
import { LogisticsIcon } from '@/components/logistics-icon';

/**
 * Eén rit in de dichte tabel: een samenvattingsrij, en de details plus de
 * beheeracties pas wanneer je ze opent.
 *
 * Alles openklappen was de vorige weergave, en met twintig goedgekeurde ritten
 * scrolde de transportverantwoordelijke zich suf. De samenvatting draagt wat je
 * nodig hebt om te scannen; laadadres, nota's en de knoppen zitten eronder.
 *
 * Het is bewust een `tbody` per rit: zo blijven de kolommen van de detailrij
 * uitgelijnd met die van de samenvatting, wat met een los blok niet lukt.
 */
export function BookingRow({
  summary,
  details,
  columns,
  label,
  highlight = false,
}: {
  /** De `td`-cellen van de samenvattingsrij. */
  summary: ReactNode;
  details: ReactNode;
  /** Aantal kolommen van `summary`, voor de colSpan van de detailrij. */
  columns: number;
  /** Waarover deze rij gaat, voor de screenreader: "Details: kar, Feest". */
  label: string;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <tbody className={highlight ? 'bg-vtk-yellow/10' : undefined}>
      <tr className="border-b border-vtk-navy/5 align-top">
        {summary}
        <td className="py-2 pl-2 text-right">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            title={open ? 'Details verbergen' : 'Details tonen'}
            className="grid h-8 w-8 place-items-center rounded-full border border-vtk-navy/15 text-vtk-navy transition hover:border-vtk-navy/40"
          >
            <LogisticsIcon
              name="chevron"
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
            <span className="sr-only">
              {open ? 'Details verbergen' : 'Details tonen'}: {label}
            </span>
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-vtk-navy/10">
          <td colSpan={columns + 1} className="px-1 pb-4">
            {details}
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
