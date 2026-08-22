'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  deleteCollectEnGoOrderAction,
  ignoreCollectEnGoOrderAction,
  importPastedMailAction,
  pollCollectEnGoAction,
} from '@/app/actions/collectengo';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { SaveForm } from '@/components/ui/save-form';
import { formatEuro } from '@/lib/uitleen';

export type InboxOrder = {
  id: string;
  reservationNumber: string;
  status: 'NEW' | 'IMPORTED' | 'IGNORED';
  source: string;
  pickupFrom: Date | null;
  pickupPoint: string | null;
  receivedAt: Date;
  totalCents: number | null;
  lineCount: number;
  importedAt: Date | null;
  importedByName: string | null;
};

const PASTE_ERRORS = {
  EMPTY: 'Plak de mail of kies een .eml-bestand.',
  FILE_TOO_LARGE: 'Dat bestand is te groot; een mail blijft ruim onder 5 MB.',
  PARSE_FAILED: 'Deze mail kon niet gelezen worden als een Collect&Go-bevestiging.',
};

const STATUS_LABELS: Record<InboxOrder['status'], string> = {
  NEW: 'Klaar om te importeren',
  IMPORTED: 'Geïmporteerd',
  IGNORED: 'Terzijde',
};

function dateTimeLabel(date: Date | null): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function CollectEnGoInbox({
  orders,
  mailbox,
}: {
  orders: InboxOrder[];
  mailbox: { user: string; mailbox: string } | null;
}) {
  const [search, setSearch] = useState('');

  const needle = search.trim().replace(/\s/g, '');
  const shown = useMemo(
    () => (needle ? orders.filter((order) => order.reservationNumber.includes(needle)) : orders),
    [orders, needle]
  );
  const waiting = orders.filter((order) => order.status === 'NEW');
  const noMatch = needle.length > 0 && shown.length === 0;

  return (
    <div className="grid gap-8">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">Collect&Go</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-vtk-body">
              De bevestigingsmails van Colruyt komen hier per reservatienummer klaar te staan. Open er een om
              de bestelling in één keer aan de flesserke-voorraad toe te voegen; je duidt per lijn aan waar ze
              naartoe gaat.
            </p>
            {mailbox ? (
              <p className="mt-2 text-xs text-vtk-muted">
                Mailbox: {mailbox.user} ({mailbox.mailbox}). De worker kijkt elke vijf minuten na.
              </p>
            ) : (
              <p className="mt-2 text-xs text-vtk-muted">
                Er is geen mailbox ingesteld (COLLECTENGO_IMAP_*). Plak de mail hieronder.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="grid grid-cols-2 divide-x divide-vtk-navy/10 overflow-hidden rounded-[14px] border border-vtk-navy/10 text-center">
              <div className="px-3 py-2.5">
                <p className="text-lg font-semibold text-vtk-ink">{waiting.length}</p>
                <p className="text-[11px] text-vtk-muted">wachten</p>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-lg font-semibold text-vtk-ink">{orders.length}</p>
                <p className="text-[11px] text-vtk-muted">mails</p>
              </div>
            </div>
            {mailbox ? (
              <ConfirmActionButton
                label="Nu mails ophalen"
                action={pollCollectEnGoAction}
                successMessage="Mailbox nagekeken."
                confirm={false}
                variant="secondary"
              />
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Reservatienummer
          <input
            type="search"
            inputMode="numeric"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Bv. 40288042"
            className="h-10 w-56 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
          />
        </label>
      </div>

      {noMatch ? (
        <p className="rounded-[14px] border border-dashed border-vtk-navy/25 bg-vtk-paper/55 px-4 py-3 text-sm text-vtk-body">
          Geen mail met reservatienummer {needle}. Haal de mailbox op, of plak de mail hieronder.
        </p>
      ) : null}

      <section>
        <h3 className="text-lg font-semibold tracking-tight text-vtk-ink">Bestellingen ({shown.length})</h3>

        {shown.length === 0 && !noMatch ? (
          <p className="mt-3 text-sm text-vtk-muted">Er staat nog geen Collect&Go-mail klaar.</p>
        ) : null}

        {/* Kaartjes op mobile, tabel vanaf md. */}
        <ul className="mt-4 grid gap-3 md:hidden">
          {shown.map((order) => (
            <li key={order.id} className="rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/beheer/collectengo/${order.id}`} className="text-base font-semibold text-vtk-ink underline-offset-2 hover:underline">
                    {order.reservationNumber}
                  </Link>
                  <p className="text-xs text-vtk-muted">{STATUS_LABELS[order.status]}</p>
                </div>
                <p className="text-sm font-medium text-vtk-ink">{order.totalCents !== null ? formatEuro(order.totalCents) : '-'}</p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-vtk-muted">Afhaalmoment</dt><dd className="text-vtk-ink">{dateTimeLabel(order.pickupFrom)}</dd></div>
                <div><dt className="text-vtk-muted">Lijnen</dt><dd className="text-vtk-ink">{order.lineCount}</dd></div>
                <div><dt className="text-vtk-muted">Binnengekomen</dt><dd className="text-vtk-ink">{dateTimeLabel(order.receivedAt)}</dd></div>
                <div><dt className="text-vtk-muted">Bron</dt><dd className="text-vtk-ink">{order.source === 'IMAP' ? 'Mailbox' : 'Geplakt'}</dd></div>
              </dl>
              <div className="mt-3 flex items-center gap-2">
                <Link href={`/beheer/collectengo/${order.id}`} className="text-sm font-medium text-vtk-ink underline">
                  Openen
                </Link>
                <OrderRowActions order={order} />
              </div>
            </li>
          ))}
        </ul>

        {/* `relative` is nodig: sr-only tekst in een scroller anders op de pagina (CLAUDE.md). */}
        <div className="relative mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-vtk-navy/10 text-left text-xs uppercase tracking-wide text-vtk-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Reservatienummer</th>
                <th scope="col" className="py-2 pr-3 font-medium">Afhaalmoment</th>
                <th scope="col" className="py-2 pr-3 font-medium">Lijnen</th>
                <th scope="col" className="py-2 pr-3 font-medium">Totaal</th>
                <th scope="col" className="py-2 pr-3 font-medium">Binnengekomen</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 font-medium">Acties</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((order) => (
                <tr key={order.id} className="border-b border-vtk-navy/10 last:border-0">
                  <td className="py-2.5 pr-3">
                    <Link href={`/beheer/collectengo/${order.id}`} className="font-medium text-vtk-ink underline-offset-2 hover:underline">
                      {order.reservationNumber}
                    </Link>
                    <span className="block text-xs text-vtk-muted">{order.pickupPoint ?? (order.source === 'IMAP' ? 'Mailbox' : 'Geplakt')}</span>
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-vtk-body">{dateTimeLabel(order.pickupFrom)}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-vtk-body">{order.lineCount}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-vtk-body">{order.totalCents !== null ? formatEuro(order.totalCents) : '-'}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-vtk-body">{dateTimeLabel(order.receivedAt)}</td>
                  <td className="py-2.5 pr-3">
                    <span className="text-vtk-body">{STATUS_LABELS[order.status]}</span>
                    {order.importedAt ? (
                      <span className="block text-xs text-vtk-muted">
                        {dateTimeLabel(order.importedAt)}{order.importedByName ? ` door ${order.importedByName}` : ''}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1">
                      <OrderRowActions order={order} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="rounded-[16px] border border-dashed border-vtk-navy/25 bg-vtk-surface p-5" open={waiting.length === 0}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-vtk-ink [&::-webkit-details-marker]:hidden">
          <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-vtk-yellow text-base leading-none">+</span>
          Mail zelf toevoegen
        </summary>
        <div className="mt-4">
          <p className="mb-3 max-w-2xl text-sm leading-6 text-vtk-body">
            Kwam de mail op een privéadres toe? Plak ze hier (de tekst van de mail, of de HTML-bron), of kies het
            opgeslagen <code>.eml</code>-bestand. Je komt daarna meteen in het importscherm.
          </p>
          <SaveForm
            action={importPastedMailAction}
            submitLabel="Mail inlezen"
            savingLabel="Inlezen..."
            savedMessage="Mail ingelezen."
            errorMessages={PASTE_ERRORS}
            className="grid gap-3"
          >
            <label className="grid gap-1 text-xs font-medium text-vtk-muted">
              Mailtekst
              <textarea
                name="mail"
                rows={8}
                placeholder="Bedankt voor je reservatie ..."
                className="w-full rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-sm text-vtk-ink"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-vtk-muted">
              Of een .eml-bestand
              <input type="file" name="file" accept=".eml,message/rfc822,text/plain,text/html" className="text-sm text-vtk-body" />
            </label>
          </SaveForm>
        </div>
      </details>
    </div>
  );
}

function OrderRowActions({ order }: { order: InboxOrder }) {
  return (
    <>
      {order.status === 'NEW' ? (
        <ConfirmActionButton
          label={`Terzijde schuiven: ${order.reservationNumber}`}
          action={ignoreCollectEnGoOrderAction.bind(null, order.id)}
          successMessage="Bestelling terzijde geschoven."
          confirm={false}
          icon={<LogisticsIcon name="hide" className="h-4 w-4" />}
        />
      ) : null}
      <ConfirmActionButton
        label={`Verwijderen: ${order.reservationNumber}`}
        confirmLabel="Bestelling verwijderen"
        action={deleteCollectEnGoOrderAction.bind(null, order.id)}
        successMessage="Bestelling verwijderd."
        destructive
        dialogTitle="Deze mail verwijderen?"
        dialogDescription={
          order.status === 'IMPORTED'
            ? `De ingelezen mail van ${order.reservationNumber} verdwijnt, met de prijzen erin. De ladingen die je ermee toevoegde blijven gewoon in de voorraad staan.`
            : `De ingelezen mail van ${order.reservationNumber} verdwijnt, met haar ${order.lineCount} lijnen. Er is nog niets in de voorraad gezet, dus daar verandert niets aan.`
        }
        icon={<LogisticsIcon name="close" className="h-4 w-4" />}
      />
    </>
  );
}
