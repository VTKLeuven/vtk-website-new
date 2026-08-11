import {
  formatDateTime,
  formatDateWithPart,
  itemLocation,
  REQUESTER_TYPE_LABELS,
} from '@/lib/uitleen';
import type { UitleenRequesterType } from '@prisma/client';

/**
 * Eén A4 per aanvraag, om aan het rek te hangen.
 *
 * Puur CSS: `@media print` in globals.css verbergt de header, de voetnoot en de
 * beheernavigatie, en zet een pagina-einde na elk blad. Geen PDF-generator, want
 * dit blad is een afdruk van wat op het scherm staat en niet een document dat
 * bewaard moet worden.
 *
 * De vakjes zijn met opzet leeg: online afvinken en op papier afvinken zijn twee
 * manieren om hetzelfde te doen, en welke van de twee de waarheid is, staat in
 * `docs/design-decisions.md` (het scherm).
 */
export type PrintSheetReservation = {
  id: string;
  eventName: string;
  eventLocation: string | null;
  eventStart: Date | null;
  requesterType: UitleenRequesterType;
  requesterName: string | null;
  group: { nameNl: string } | null;
  user: { name: string; email: string };
  contactName: string | null;
  contactPhone: string | null;
  pickupDate: Date;
  returnDate: Date;
  pickupPart: string | null;
  returnPart: string | null;
  memberNote: string | null;
  adminNote: string | null;
  delivery: boolean;
  deliveryNote: string | null;
  lines: Array<{
    id: string;
    itemName: string;
    quantity: number;
    note: string | null;
    preparedAt: Date | null;
    item: { locationShelf: string | null; locationRack: string | null };
  }>;
  flesserkeLines: Array<{ id: string; itemName: string; quantity: number }>;
};

function requesterLabel(reservation: PrintSheetReservation): string {
  if (reservation.requesterType === 'INTERN') {
    return reservation.group?.nameNl ?? REQUESTER_TYPE_LABELS.INTERN;
  }
  return reservation.requesterName ?? REQUESTER_TYPE_LABELS[reservation.requesterType];
}

export function PrintSheet({ reservation }: { reservation: PrintSheetReservation }) {
  return (
    <article className="print-sheet mx-auto w-full max-w-[820px] rounded-[18px] border border-vtk-navy/15 bg-white p-8 text-vtk-ink print:max-w-none print:rounded-none print:border-0 print:p-0">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-vtk-navy/20 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-vtk-muted">
            VTK Logistiek · klaarzetlijst
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{reservation.eventName}</h1>
        </div>
        <p className="text-right text-sm">
          <span className="block font-semibold">
            Afhalen {formatDateWithPart(reservation.pickupDate, reservation.pickupPart)}
          </span>
          <span className="block text-vtk-muted">
            Terug {formatDateWithPart(reservation.returnDate, reservation.returnPart)}
          </span>
        </p>
      </header>

      <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-vtk-muted">Namens</dt>
          <dd className="font-medium">{requesterLabel(reservation)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-vtk-muted">Aanvrager</dt>
          <dd className="font-medium">{reservation.user.name}</dd>
        </div>
        {reservation.eventLocation ? (
          <div className="flex gap-2">
            <dt className="text-vtk-muted">Locatie</dt>
            <dd className="font-medium">{reservation.eventLocation}</dd>
          </div>
        ) : null}
        {reservation.eventStart ? (
          <div className="flex gap-2">
            <dt className="text-vtk-muted">Startuur</dt>
            <dd className="font-medium">{formatDateTime(reservation.eventStart)}</dd>
          </div>
        ) : null}
        {reservation.contactName || reservation.contactPhone ? (
          <div className="flex gap-2">
            <dt className="text-vtk-muted">Contact</dt>
            <dd className="font-medium">
              {[reservation.contactName, reservation.contactPhone].filter(Boolean).join(' · ')}
            </dd>
          </div>
        ) : null}
        {reservation.delivery ? (
          <div className="flex gap-2">
            <dt className="text-vtk-muted">Levering</dt>
            <dd className="font-medium">{reservation.deliveryNote || 'Ja'}</dd>
          </div>
        ) : null}
      </dl>

      {reservation.lines.length > 0 ? (
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-vtk-navy/20 text-left">
              <th className="w-10 py-1.5 font-semibold">✓</th>
              <th className="w-14 py-1.5 text-right font-semibold">Aantal</th>
              <th className="py-1.5 pl-4 font-semibold">Materiaal</th>
              <th className="w-28 py-1.5 font-semibold">Plaats</th>
            </tr>
          </thead>
          <tbody>
            {reservation.lines.map((line) => (
              <tr key={line.id} className="border-b border-vtk-navy/10 align-top">
                <td className="py-2">
                  <span
                    className={`inline-block h-4 w-4 border border-vtk-navy/50 ${
                      line.preparedAt ? 'bg-vtk-navy/20' : ''
                    }`}
                    aria-hidden
                  />
                </td>
                <td className="py-2 text-right tabular-nums">{line.quantity}×</td>
                <td className="py-2 pl-4">
                  {line.itemName}
                  {line.note ? (
                    <span className="block text-xs italic text-vtk-body">{line.note}</span>
                  ) : null}
                </td>
                <td className="py-2 tabular-nums">{itemLocation(line.item) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {reservation.flesserkeLines.length > 0 ? (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-vtk-navy/20 text-left">
              <th className="w-10 py-1.5 font-semibold">✓</th>
              <th className="w-14 py-1.5 text-right font-semibold">Aantal</th>
              <th className="py-1.5 pl-4 font-semibold">Flesserke</th>
            </tr>
          </thead>
          <tbody>
            {reservation.flesserkeLines.map((line) => (
              <tr key={line.id} className="border-b border-vtk-navy/10">
                <td className="py-2">
                  <span className="inline-block h-4 w-4 border border-vtk-navy/50" aria-hidden />
                </td>
                <td className="py-2 text-right tabular-nums">{line.quantity}×</td>
                <td className="py-2 pl-4">{line.itemName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {reservation.memberNote ? (
        <p className="mt-4 text-sm">
          <span className="font-semibold">Nota van het lid: </span>
          {reservation.memberNote}
        </p>
      ) : null}
      {reservation.adminNote ? (
        <p className="mt-1 text-sm">
          <span className="font-semibold">Nota van het team: </span>
          {reservation.adminNote}
        </p>
      ) : null}

      <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p className="text-vtk-muted">Klaargezet door</p>
          <div className="mt-6 border-b border-vtk-navy/40" />
        </div>
        <div>
          <p className="text-vtk-muted">Afgehaald door (naam + handtekening)</p>
          <div className="mt-6 border-b border-vtk-navy/40" />
        </div>
      </div>
    </article>
  );
}

/** Wat beide printroutes per aanvraag nodig hebben. */
export const printSheetSelect = {
  id: true,
  eventName: true,
  eventLocation: true,
  eventStart: true,
  requesterType: true,
  requesterName: true,
  contactName: true,
  contactPhone: true,
  pickupDate: true,
  returnDate: true,
  pickupPart: true,
  returnPart: true,
  memberNote: true,
  adminNote: true,
  delivery: true,
  deliveryNote: true,
  group: { select: { nameNl: true } },
  user: { select: { name: true, email: true } },
  lines: {
    select: {
      id: true,
      itemName: true,
      quantity: true,
      note: true,
      preparedAt: true,
      item: { select: { locationShelf: true, locationRack: true } },
    },
    orderBy: { itemName: 'asc' as const },
  },
  flesserkeLines: {
    select: { id: true, itemName: true, quantity: true },
    orderBy: { itemName: 'asc' as const },
  },
} as const;
