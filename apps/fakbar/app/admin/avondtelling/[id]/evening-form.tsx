'use client';

import { useMemo, useState } from 'react';
import { Input, Label, Select } from '@vtk/ui';
import { SaveForm } from '@/components/ui/save-form';
import { ElixirIcon } from '@/components/elixir-icon';
import { saveEveningAction } from '@/app/actions/fakbar';
import { saveMessages } from '@/lib/saveMessages';
import {
  CONSUMPTION_LABELS,
  CONSUMPTION_ORDER,
  DENOMINATIONS,
  VOUCHER_FIELDS,
  formatEuro,
} from '@/lib/fakbar-format';
import type { Tapper } from '@/lib/tappers';

type Item = { id: string; name: string; category: string; salesPrice: number };
type CashCount = Record<string, number> | null;
type ConsumptionRow = { itemId: string; category: string; quantity: number };

/** Cent naar de tekst die in een euro-veld hoort ("2.30", niet "2,30"). */
function euroValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * De hele avondtelling in één formulier: wie tapte, de kassa, het tappersblad
 * en wat er naar de kluis ging.
 *
 * Client component omdat elk deel meteen moet terugrekenen terwijl je tikt. Een
 * kassatelling waarvan je het totaal pas na het opslaan ziet, is een telling
 * die je twee keer doet.
 */
export function EveningForm({
  eveningId,
  readOnly,
  tappers,
  hoofdtapperId,
  specialeActiviteit,
  bancontactRevenue,
  cashToSafe,
  cashCount,
  items,
  consumption,
}: {
  eveningId: string;
  readOnly: boolean;
  tappers: Tapper[];
  hoofdtapperId: string | null;
  specialeActiviteit: string | null;
  bancontactRevenue: number;
  cashToSafe: number;
  cashCount: CashCount;
  items: Item[];
  consumption: ConsumptionRow[];
}) {
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(DENOMINATIONS.map((denomination) => [denomination.field, cashCount?.[denomination.field] ?? 0])),
  );
  const [safe, setSafe] = useState(euroValue(cashToSafe));
  const [bancontact, setBancontact] = useState(euroValue(bancontactRevenue));

  // Enkel de artikelen die al op het tappersblad staan krijgen een rij; de rest
  // voeg je toe met de keuzelijst eronder. 27 artikelen maal 6 rubrieken zijn
  // 162 invoervelden, en op een gewone avond staan er vijf getallen op het blad.
  const [openItems, setOpenItems] = useState<string[]>(() => {
    const used = new Set(consumption.map((row) => row.itemId));
    return items.filter((item) => used.has(item.id)).map((item) => item.id);
  });
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(consumption.map((row) => [`${row.itemId}:${row.category}`, row.quantity])),
  );

  const countedCash = useMemo(
    () => DENOMINATIONS.reduce((total, denomination) => total + (counts[denomination.field] ?? 0) * denomination.cents, 0),
    [counts],
  );

  const safeCents = Math.round((Number(safe.replace(',', '.')) || 0) * 100);
  const bancontactCents = Math.round((Number(bancontact.replace(',', '.')) || 0) * 100);
  const inDrawer = countedCash - safeCents;

  const lostRevenue = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return Object.entries(quantities).reduce((total, [key, quantity]) => {
      const [itemId] = key.split(':');
      return total + (byId.get(itemId)?.salesPrice ?? 0) * quantity;
    }, 0);
  }, [quantities, items]);

  const available = items.filter((item) => !openItems.includes(item.id));

  return (
    <SaveForm
      action={saveEveningAction}
      submitLabel="Telling opslaan"
      savingLabel="Opslaan…"
      savedMessage="Telling opgeslagen."
      errorMessages={saveMessages}
      submitDisabled={readOnly}
      className="space-y-6"
    >
      <input type="hidden" name="eveningId" value={eveningId} />

      <fieldset disabled={readOnly} className="space-y-6 disabled:opacity-60">
        <section className="fakbar-card">
          <h3 className="text-base font-semibold text-[var(--ink)]">De avond</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="hoofdtapper">Hoofdtapper</Label>
              <Select id="hoofdtapper" name="hoofdtapperId" defaultValue={hoofdtapperId ?? ''}>
                <option value="">Niet ingevuld</option>
                {tappers.map((tapper) => (
                  <option key={tapper.id} value={tapper.id}>
                    {tapper.name}
                  </option>
                ))}
              </Select>
              {tappers.length === 0 ? (
                <p className="mt-1.5 text-xs text-[var(--muted)]">
                  Er staan dit werkingsjaar nog geen leden bij de post Fakbar; die komen uit de VTK-admin.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="speciale">Speciale activiteit</Label>
              <Input
                id="speciale"
                name="specialeActiviteit"
                defaultValue={specialeActiviteit ?? ''}
                placeholder="Cantus, TD, verhuur…"
              />
            </div>
          </div>
        </section>

        <section className="fakbar-card">
          <h3 className="text-base font-semibold text-[var(--ink)]">Kassatelling</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Tel het geld in de kassa op het einde van de avond. Het totaal telt mee terwijl je tikt.
          </p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {DENOMINATIONS.map((denomination) => (
              <div
                key={denomination.field}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3.5 py-2.5"
              >
                <Label htmlFor={denomination.field} className="!mb-0 !normal-case !tracking-normal !text-[var(--ink)] !text-sm !font-medium">
                  {denomination.label}
                </Label>
                <Input
                  id={denomination.field}
                  name={denomination.field}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className="!w-20 text-right"
                  value={String(counts[denomination.field] ?? 0)}
                  onChange={(event) =>
                    setCounts((current) => ({
                      ...current,
                      [denomination.field]: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-[var(--line)] pt-5">
            <h4 className="text-xs font-bold uppercase tracking-[0.07em] text-[var(--muted)]">Bonnen</h4>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Bonnen zijn geen geld in de kassa; ze verklaren waarom er drank weg is zonder cash. Ze tellen niet mee
              in het totaal hieronder.
            </p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
              {VOUCHER_FIELDS.map((voucher) => (
                <div key={voucher.field}>
                  <Label htmlFor={voucher.field}>{voucher.label}</Label>
                  <Input
                    id={voucher.field}
                    name={voucher.field}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    defaultValue={cashCount?.[voucher.field] ?? 0}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="fakbar-card">
          <h3 className="text-base font-semibold text-[var(--ink)]">Ontvangsten</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cashToSafe">Naar de kluis (cash)</Label>
              <Input
                id="cashToSafe"
                name="cashToSafe"
                inputMode="decimal"
                value={safe}
                onChange={(event) => setSafe(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bancontactRevenue">Bancontact</Label>
              <Input
                id="bancontactRevenue"
                name="bancontactRevenue"
                inputMode="decimal"
                value={bancontact}
                onChange={(event) => setBancontact(event.target.value)}
              />
            </div>
          </div>

          <dl className="mt-5 grid gap-3 border-t border-[var(--line)] pt-5 sm:grid-cols-3">
            <Readout label="Geteld in de kassa" value={formatEuro(countedCash)} />
            <Readout
              label="Blijft in de kassa"
              value={formatEuro(inDrawer)}
              tone={inDrawer < 0 ? 'negative' : undefined}
              note={inDrawer < 0 ? 'Er gaat meer naar de kluis dan er geteld is.' : 'Wisselgeld voor morgen.'}
            />
            <Readout label="Ontvangsten deze avond" value={formatEuro(safeCents + bancontactCents)} />
          </dl>
        </section>

        <section className="fakbar-card">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[var(--ink)]">Tappersblad</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Drank die weggegaan is zonder omzet. Voeg enkel de artikelen toe die vanavond op het blad stonden.
              </p>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Gemiste inkomsten <strong className="ml-1 tabular-nums text-[var(--ink)]">{formatEuro(lostRevenue)}</strong>
            </p>
          </div>

          {openItems.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-[var(--line-2)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              Nog niets op het blad.
            </p>
          ) : (
            <div className="fakbar-table-wrap mt-4 !rounded-xl">
              <table className="fakbar-table fakbar-table-stack">
                <thead>
                  <tr>
                    <th>Artikel</th>
                    {CONSUMPTION_ORDER.map((category) => (
                      <th key={category} className="num">
                        {CONSUMPTION_LABELS[category]}
                      </th>
                    ))}
                    <th className="num">Waarde</th>
                    <th>
                      <span className="sr-only">Rij verwijderen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {openItems.map((itemId) => {
                    const item = items.find((candidate) => candidate.id === itemId);
                    if (!item) return null;
                    const rowValue = CONSUMPTION_ORDER.reduce(
                      (total, category) => total + (quantities[`${itemId}:${category}`] ?? 0) * item.salesPrice,
                      0,
                    );
                    return (
                      <tr key={itemId}>
                        <td data-label="Artikel">{item.name}</td>
                        {CONSUMPTION_ORDER.map((category) => {
                          const key = `${itemId}:${category}`;
                          return (
                            <td key={category} className="num" data-label={CONSUMPTION_LABELS[category]}>
                              <Input
                                name={`verbruik:${itemId}:${category}`}
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                aria-label={`${CONSUMPTION_LABELS[category]}: ${item.name}`}
                                value={String(quantities[key] ?? 0)}
                                onChange={(event) =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [key]: Math.max(0, Number(event.target.value) || 0),
                                  }))
                                }
                              />
                            </td>
                          );
                        })}
                        <td className="num tabular-nums" data-label="Waarde">
                          {formatEuro(rowValue)}
                        </td>
                        <td data-label="">
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                            aria-label={`Van het tappersblad halen: ${item.name}`}
                            title="Van het blad halen"
                            onClick={() => {
                              setOpenItems((current) => current.filter((id) => id !== itemId));
                              setQuantities((current) => {
                                const next = { ...current };
                                for (const category of CONSUMPTION_ORDER) delete next[`${itemId}:${category}`];
                                return next;
                              });
                            }}
                          >
                            <ElixirIcon name="trash" className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {available.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="w-full max-w-xs">
                <Label htmlFor="add-item">Artikel toevoegen</Label>
                <Select
                  id="add-item"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) setOpenItems((current) => [...current, event.target.value]);
                  }}
                >
                  <option value="">Kies een artikel…</option>
                  {available.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}
        </section>
      </fieldset>
    </SaveForm>
  );
}

function Readout({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'negative';
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.07em] text-[var(--muted)]">{label}</dt>
      <dd
        className="mt-1 text-xl font-bold tabular-nums tracking-[-0.02em]"
        style={{ color: tone === 'negative' ? 'var(--danger)' : 'var(--ink)' }}
      >
        {value}
      </dd>
      {note ? <p className="mt-0.5 text-xs text-[var(--muted)]">{note}</p> : null}
    </div>
  );
}
