'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { importCollectEnGoOrderAction } from '@/app/actions/collectengo';
import { SaveForm } from '@/components/ui/save-form';
import { splitProductName, type MatchSuggestion } from '@/lib/collectengo/match';
import { CONTENT_UNITS, formatContentAmount, formatEuro } from '@/lib/uitleen';

type OrderView = {
  id: string;
  reservationNumber: string;
  status: 'NEW' | 'IMPORTED' | 'IGNORED';
  customerName: string | null;
  pickupPoint: string | null;
  pickupFrom: Date | null;
  pickupUntil: Date | null;
  orderedAt: Date | null;
  subtotalCents: number | null;
  discountCents: number | null;
  serviceCostCents: number | null;
  totalCents: number | null;
  importedAt: Date | null;
  importedByName: string | null;
};

type LineView = {
  id: string;
  category: string | null;
  productName: string;
  note: string | null;
  unit: 'PIECE' | 'WEIGHT';
  quantity: number;
  quantityText: string | null;
  unitPriceCents: number | null;
  unitPriceBasis: string | null;
  totalPriceCents: number | null;
  depositCents: number | null;
  lineDiscountCents: number | null;
  flesserkeItemId: string | null;
  importedQuantity: number | null;
};

type ItemView = {
  id: string;
  name: string;
  brand: string | null;
  contentAmount: string | null;
  contentUnit: string | null;
  categoryId: string | null;
  quantity: number;
};

type LineState = {
  destination: string; // SKIP, NEW of een itemId
  quantity: string;
  expiry: string;
  name: string;
  brand: string;
  contentAmount: string;
  contentUnit: string;
  categoryId: string;
};

const SKIP = '__skip__';
const NEW = '__new__';

const IMPORT_ERRORS = {
  NOT_FOUND: 'Deze bestelling bestaat niet meer.',
  ALREADY_IMPORTED: 'Deze bestelling is al geïmporteerd; herlaad de pagina.',
  NOTHING_SELECTED: 'Er staat geen enkele lijn aangeduid om te importeren.',
  QUANTITY_INVALID: 'Elk aantal moet minstens 1 zijn.',
  DATE_INVALID: 'Een van de vervaldatums is ongeldig.',
  ITEM_REQUIRED: 'Kies voor elke lijn een bestemming, of zet ze op "niet importeren".',
  NAME_REQUIRED: 'Geef elk nieuw item een naam.',
};

const inputClass = 'h-9 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

function dateTimeLabel(date: Date | null): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function pickupLabel(order: OrderView): string {
  if (!order.pickupFrom) return 'onbekend';
  const day = new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'Europe/Brussels', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  }).format(order.pickupFrom);
  const time = (date: Date) =>
    new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }).format(date);
  return order.pickupUntil
    ? `${day}, ${time(order.pickupFrom)} - ${time(order.pickupUntil)}`
    : `${day}, ${time(order.pickupFrom)}`;
}

function itemLabel(item: ItemView): string {
  const content = formatContentAmount(item.contentAmount, item.contentUnit);
  return [item.brand, item.name, content ? `(${content})` : ''].filter(Boolean).join(' ');
}

/** Een lijn die de aandacht van het team vraagt voor ze geïmporteerd wordt. */
function needsAttention(line: LineView, suggestion: MatchSuggestion | null): boolean {
  return suggestion === null || suggestion.confidence === 'FUZZY' || line.unit === 'WEIGHT' || line.note !== null;
}

export function ImportOrderForm({
  order,
  lines,
  items,
  categories,
  suggestions,
  siblings,
}: {
  order: OrderView;
  lines: LineView[];
  items: ItemView[];
  categories: Array<{ id: string; name: string }>;
  suggestions: Record<string, MatchSuggestion | null>;
  siblings: Array<{ id: string; receivedAt: Date; status: string }>;
}) {
  const router = useRouter();
  const imported = order.status === 'IMPORTED';

  const [state, setState] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      lines.map((line) => {
        const suggestion = suggestions[line.id] ?? null;
        const parts = splitProductName(line.productName);
        return [
          line.id,
          {
            destination: suggestion ? suggestion.itemId : NEW,
            quantity: String(line.quantity),
            expiry: '',
            name: parts.name,
            brand: parts.brand ?? '',
            contentAmount: parts.contentAmount ?? '',
            contentUnit: parts.contentUnit ?? '',
            categoryId: '',
          } satisfies LineState,
        ];
      })
    )
  );
  const [bulkExpiry, setBulkExpiry] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const itemsByCategory = useMemo(() => {
    const groups = new Map<string, ItemView[]>();
    for (const item of items) {
      const label = categories.find((category) => category.id === item.categoryId)?.name ?? 'Overig';
      const list = groups.get(label);
      if (list) list.push(item);
      else groups.set(label, [item]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'));
  }, [items, categories]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, LineView[]>();
    for (const line of lines) {
      const label = line.category ?? 'Zonder categorie';
      const list = byCategory.get(label);
      if (list) list.push(line);
      else byCategory.set(label, [line]);
    }
    return [...byCategory.entries()];
  }, [lines]);

  const selectedCount = lines.filter((line) => state[line.id]?.destination !== SKIP).length;
  const newCount = lines.filter((line) => state[line.id]?.destination === NEW).length;
  const attentionCount = lines.filter((line) => needsAttention(line, suggestions[line.id] ?? null)).length;

  // Colruyt telt het subtotaal vóór promo's, terwijl de prijs per lijn er al af
  // is. Klopt de som niet, dan is er iets misgelezen en zeggen we dat.
  const lineSum = lines.reduce(
    (total, line) => total + (line.totalPriceCents ?? 0) - (line.lineDiscountCents ?? 0),
    0
  );
  const sumMismatch = order.subtotalCents !== null && Math.abs(lineSum - order.subtotalCents) > 1;

  function update(lineId: string, patch: Partial<LineState>) {
    setState((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }));
  }

  function applyBulkExpiry() {
    if (!bulkExpiry) return;
    setState((current) => {
      const next = { ...current };
      for (const line of lines) {
        if (next[line.id].destination !== SKIP) next[line.id] = { ...next[line.id], expiry: bulkExpiry };
      }
      return next;
    });
  }

  function setGroup(groupLines: LineView[], skip: boolean) {
    setState((current) => {
      const next = { ...current };
      for (const line of groupLines) {
        if (skip) {
          next[line.id] = { ...next[line.id], destination: SKIP };
        } else if (next[line.id].destination === SKIP) {
          const suggestion = suggestions[line.id] ?? null;
          next[line.id] = { ...next[line.id], destination: suggestion ? suggestion.itemId : NEW };
        }
      }
      return next;
    });
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">
              Bestelling {order.reservationNumber}
            </h2>
            <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex gap-2"><dt className="text-vtk-muted">Afhaalmoment</dt><dd className="text-vtk-ink">{pickupLabel(order)}</dd></div>
              <div className="flex gap-2"><dt className="text-vtk-muted">Afhaalpunt</dt><dd className="text-vtk-ink">{order.pickupPoint ?? '-'}</dd></div>
              <div className="flex gap-2"><dt className="text-vtk-muted">Besteld op</dt><dd className="text-vtk-ink">{dateTimeLabel(order.orderedAt)}</dd></div>
              <div className="flex gap-2"><dt className="text-vtk-muted">Besteld door</dt><dd className="text-vtk-ink">{order.customerName ?? '-'}</dd></div>
            </dl>
          </div>
          <dl className="grid gap-1 rounded-[14px] border border-vtk-navy/10 px-4 py-3 text-sm">
            <div className="flex justify-between gap-6"><dt className="text-vtk-muted">Subtotaal</dt><dd className="tabular-nums text-vtk-ink">{order.subtotalCents !== null ? formatEuro(order.subtotalCents) : '-'}</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-vtk-muted">Kortingen</dt><dd className="tabular-nums text-vtk-ink">{order.discountCents !== null ? formatEuro(order.discountCents) : '-'}</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-vtk-muted">Servicekost</dt><dd className="tabular-nums text-vtk-ink">{order.serviceCostCents !== null ? formatEuro(order.serviceCostCents) : '-'}</dd></div>
            <div className="flex justify-between gap-6 border-t border-vtk-navy/10 pt-1"><dt className="font-medium text-vtk-ink">Totaal</dt><dd className="tabular-nums font-medium text-vtk-ink">{order.totalCents !== null ? formatEuro(order.totalCents) : '-'}</dd></div>
          </dl>
        </div>
      </section>

      {sumMismatch ? (
        <p className="rounded-[14px] border border-vtk-navy/15 bg-vtk-yellow/25 px-4 py-3 text-sm text-vtk-ink">
          De som van de lijnen ({formatEuro(lineSum)}) verschilt van het subtotaal in de mail
          ({formatEuro(order.subtotalCents ?? 0)}). Kijk de lijst na voor je importeert: er is mogelijk een lijn
          verkeerd gelezen.
        </p>
      ) : null}

      {siblings.length > 0 ? (
        <p className="rounded-[14px] border border-vtk-navy/15 bg-vtk-paper/55 px-4 py-3 text-sm text-vtk-body">
          Er {siblings.length === 1 ? 'is nog een mail' : `zijn nog ${siblings.length} mails`} met
          reservatienummer {order.reservationNumber} (Collect&Go stuurt een nieuwe mail bij een wijziging).{' '}
          {siblings.map((sibling, index) => (
            <span key={sibling.id}>
              {index > 0 ? ', ' : ''}
              <Link href={`/beheer/collectengo/${sibling.id}`} className="underline underline-offset-2">
                {dateTimeLabel(sibling.receivedAt)}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}

      {imported ? (
        <ImportedSummary order={order} lines={lines} itemsById={itemsById} />
      ) : (
        <SaveForm
          action={importCollectEnGoOrderAction}
          submitLabel={`Importeer ${selectedCount} lijn(en)`}
          savingLabel="Importeren..."
          savedMessage="Bestelling geïmporteerd."
          errorMessages={IMPORT_ERRORS}
          submitDisabled={selectedCount === 0}
          onSuccess={() => router.refresh()}
          className="grid gap-5"
        >
          <input type="hidden" name="orderId" value={order.id} />

          <div className="flex flex-wrap items-end gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3">
            <label className="grid gap-1 text-xs font-medium text-vtk-muted">
              Vervaldatum voor alle lijnen
              <input type="date" value={bulkExpiry} onChange={(event) => setBulkExpiry(event.target.value)} className={inputClass} />
            </label>
            <Button type="button" variant="secondary" size="sm" onClick={applyBulkExpiry} disabled={!bulkExpiry}>
              Zet op alle lijnen
            </Button>
            <label className="ml-auto flex items-center gap-2 text-sm text-vtk-body">
              <input type="checkbox" checked={onlyAttention} onChange={(event) => setOnlyAttention(event.target.checked)} />
              Enkel lijnen die aandacht vragen ({attentionCount})
            </label>
          </div>

          <p className="text-sm text-vtk-body">
            {selectedCount} van {lines.length} lijnen gaan naar de voorraad, waarvan {newCount} als nieuw item.
            De prijzen blijven bij de bestelling staan; een lading krijgt enkel het aantal, de vervaldatum en een
            verwijzing naar dit reservatienummer.
          </p>

          {groups.map(([label, groupLines]) => {
            const visible = onlyAttention
              ? groupLines.filter((line) => needsAttention(line, suggestions[line.id] ?? null))
              : groupLines;
            if (visible.length === 0) return null;
            const allSkipped = groupLines.every((line) => state[line.id]?.destination === SKIP);
            return (
              <section key={label} className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-vtk-navy/10 px-4 py-3">
                  <h3 className="text-sm font-semibold text-vtk-ink">
                    {label} <span className="font-normal text-vtk-muted">({groupLines.length})</span>
                  </h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setGroup(groupLines, !allSkipped)}>
                    {allSkipped ? 'Categorie toch importeren' : 'Hele categorie niet importeren'}
                  </Button>
                </header>
                <ul className="divide-y divide-vtk-navy/10">
                  {visible.map((line) => (
                    <LineRow
                      key={line.id}
                      line={line}
                      state={state[line.id]}
                      suggestion={suggestions[line.id] ?? null}
                      itemsByCategory={itemsByCategory}
                      categories={categories}
                      onChange={(patch) => update(line.id, patch)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </SaveForm>
      )}
    </div>
  );
}

function LineRow({
  line,
  state,
  suggestion,
  itemsByCategory,
  categories,
  onChange,
}: {
  line: LineView;
  state: LineState;
  suggestion: MatchSuggestion | null;
  itemsByCategory: Array<[string, ItemView[]]>;
  categories: Array<{ id: string; name: string }>;
  onChange: (patch: Partial<LineState>) => void;
}) {
  const skipped = state.destination === SKIP;
  const isNew = state.destination === NEW;
  const mode = skipped ? 'skip' : isNew ? 'new' : 'existing';

  return (
    <li className={`grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_5rem_minmax(0,2fr)_9rem] sm:items-start ${skipped ? 'opacity-60' : ''}`}>
      <input type="hidden" name={`mode-${line.id}`} value={mode} />
      <input type="hidden" name={`item-${line.id}`} value={isNew || skipped ? '' : state.destination} />

      <div className="min-w-0">
        <p className="text-sm font-medium text-vtk-ink">{line.productName}</p>
        <p className="mt-0.5 text-xs text-vtk-muted">
          {line.unit === 'WEIGHT' ? `${line.quantityText ?? 'per gewicht'} - controleer het aantal` : `${line.quantity} stuk(s)`}
          {line.unitPriceCents !== null ? ` - ${formatEuro(line.unitPriceCents)}/${line.unitPriceBasis ?? 'st'}` : ''}
          {line.totalPriceCents !== null ? ` - totaal ${formatEuro(line.totalPriceCents)}` : ''}
          {line.depositCents ? ` - leeggoed ${formatEuro(line.depositCents)}` : ''}
        </p>
        {line.note ? (
          <p className="mt-1 inline-block rounded-full bg-vtk-yellow/35 px-2 py-0.5 text-xs text-vtk-ink">{line.note}</p>
        ) : null}
      </div>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        <span className="sm:sr-only">Aantal</span>
        <input
          type="number"
          min={1}
          name={`quantity-${line.id}`}
          value={state.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
          disabled={skipped}
          className={inputClass}
        />
      </label>

      <div className="grid gap-2">
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          <span className="sm:sr-only">Bestemming</span>
          <select
            value={state.destination}
            onChange={(event) => onChange({ destination: event.target.value })}
            className={inputClass}
          >
            <option value={SKIP}>Niet importeren</option>
            <option value={NEW}>Nieuw item aanmaken</option>
            {itemsByCategory.map(([label, group]) => (
              <optgroup key={label} label={label}>
                {group.map((item) => (
                  <option key={item.id} value={item.id}>
                    {itemLabel(item)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {suggestion && !skipped ? (
          <p className="text-xs text-vtk-muted">
            {suggestion.confidence === 'REMEMBERED'
              ? 'Zo ging deze vorige keer.'
              : suggestion.confidence === 'EXACT'
                ? 'Naam en inhoud komen overeen.'
                : 'Lijkt hierop; kijk zeker na.'}
          </p>
        ) : null}
        {isNew ? (
          <div className="grid gap-2 rounded-[12px] border border-dashed border-vtk-navy/25 p-2 @container">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                Naam
                <input type="text" name={`name-${line.id}`} value={state.name} onChange={(e) => onChange({ name: e.target.value })} className={inputClass} />
              </label>
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                Merk
                <input type="text" name={`brand-${line.id}`} value={state.brand} onChange={(e) => onChange({ brand: e.target.value })} className={inputClass} />
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-[5rem_6rem_minmax(0,1fr)]">
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                Inhoud
                <input type="text" name={`contentAmount-${line.id}`} value={state.contentAmount} onChange={(e) => onChange({ contentAmount: e.target.value })} className={inputClass} />
              </label>
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                Eenheid
                <select name={`contentUnit-${line.id}`} value={state.contentUnit} onChange={(e) => onChange({ contentUnit: e.target.value })} className={inputClass}>
                  <option value="">-</option>
                  {CONTENT_UNITS.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                Categorie
                <select name={`category-${line.id}`} value={state.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} className={inputClass}>
                  <option value="">Overig</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}
      </div>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        <span className="sm:sr-only">Vervaldatum</span>
        <input
          type="date"
          name={`expiry-${line.id}`}
          value={state.expiry}
          onChange={(event) => onChange({ expiry: event.target.value })}
          disabled={skipped}
          className={inputClass}
        />
      </label>
    </li>
  );
}

/** Wat er met deze bestelling gebeurd is; een geïmporteerde mail is enkel nog historiek. */
function ImportedSummary({
  order,
  lines,
  itemsById,
}: {
  order: OrderView;
  lines: LineView[];
  itemsById: Map<string, ItemView>;
}) {
  const importedLines = lines.filter((line) => line.importedQuantity !== null);
  return (
    <section className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface">
      <header className="border-b border-vtk-navy/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-vtk-ink">
          Geïmporteerd op {dateTimeLabel(order.importedAt)}
          {order.importedByName ? ` door ${order.importedByName}` : ''}
        </h3>
        <p className="mt-1 text-xs text-vtk-muted">
          {importedLines.length} van {lines.length} lijnen kregen een lading in de flesserke-voorraad.
        </p>
      </header>
      {/* `relative` zodat sr-only tekst in deze scroller op de tabel ankert (CLAUDE.md). */}
      <div className="relative overflow-x-auto px-4 py-3">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-vtk-navy/10 text-left text-xs uppercase tracking-wide text-vtk-muted">
              <th scope="col" className="py-2 pr-3 font-medium">Product</th>
              <th scope="col" className="py-2 pr-3 font-medium">Aantal</th>
              <th scope="col" className="py-2 pr-3 font-medium">Prijs</th>
              <th scope="col" className="py-2 font-medium">In voorraad als</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const item = line.flesserkeItemId ? itemsById.get(line.flesserkeItemId) : null;
              return (
                <tr key={line.id} className="border-b border-vtk-navy/10 last:border-0">
                  <td className="py-2 pr-3 text-vtk-ink">
                    {line.productName}
                    {line.note ? <span className="block text-xs text-vtk-muted">{line.note}</span> : null}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-vtk-body">{line.importedQuantity ?? '-'}</td>
                  <td className="py-2 pr-3 tabular-nums text-vtk-body">
                    {line.totalPriceCents !== null ? formatEuro(line.totalPriceCents) : '-'}
                  </td>
                  <td className="py-2 text-vtk-body">
                    {item ? itemLabel(item) : line.importedQuantity !== null ? 'item niet meer in de lijst' : 'niet geïmporteerd'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
