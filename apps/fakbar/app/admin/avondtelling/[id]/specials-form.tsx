'use client';

import { useState } from 'react';
import { Input, Label, Select } from '@vtk/ui';
import { SaveForm } from '@/components/ui/save-form';
import { ElixirIcon } from '@/components/elixir-icon';
import { saveEveningSpecialsAction } from '@/app/actions/fakbar';
import { saveMessages } from '@/lib/saveMessages';
import { formatEuro } from '@/lib/fakbar-format';

type Item = { id: string; name: string; salesPrice: number };

export type SpecialRow = {
  kind: 'DRANK' | 'ACTIE';
  title: string;
  note: string;
  itemId: string;
  /** Als tekst in euro, zoals het in het veld staat. Leeg = gewone prijs. */
  price: string;
};

/** Hetzelfde maximum als in de actie; het bord aan de toog is ook niet oneindig. */
const MAX_SPECIALS = 8;

const KIND_LABELS: Record<SpecialRow['kind'], string> = {
  DRANK: 'Extra drank',
  ACTIE: 'Actie of korting',
};

const KIND_HINTS: Record<SpecialRow['kind'], string> = {
  DRANK: 'Iets dat er die avond bij staat en niet op de vaste kaart hoort.',
  ACTIE: 'Een aanbieding op wat er al staat, bijvoorbeeld 2+1 gratis Stella.',
};

function emptyRow(kind: SpecialRow['kind'] = 'ACTIE'): SpecialRow {
  return { kind, title: '', note: '', itemId: '', price: '' };
}

/**
 * De specials van één avond.
 *
 * Apart van de telling, en met een eigen opslaan-knop: dit vul je **vóór** de
 * avond in (wat komt er op het bord), terwijl de telling erna gebeurt. Ze in
 * hetzelfde formulier zetten zou betekenen dat je 's avonds de hele kassa moet
 * openen om er 's middags een actie bij te zetten.
 *
 * De hele lijst gaat als één geheel naar de server en vervangt wat er stond;
 * zie `saveEveningSpecialsAction`.
 */
export function SpecialsForm({
  eveningId,
  readOnly,
  items,
  initial,
}: {
  eveningId: string;
  readOnly: boolean;
  items: Item[];
  initial: SpecialRow[];
}) {
  const [rows, setRows] = useState<SpecialRow[]>(initial);

  function update(index: number, patch: Partial<SpecialRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  return (
    <SaveForm
      action={saveEveningSpecialsAction}
      submitLabel="Specials opslaan"
      savingLabel="Opslaan…"
      savedMessage="Specials opgeslagen."
      errorMessages={saveMessages}
      submitDisabled={readOnly}
      className="fakbar-card space-y-5"
    >
      <input type="hidden" name="eveningId" value={eveningId} />

      <div>
        <h3 className="text-base font-semibold text-[var(--ink)]">Specials van deze avond</h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          Wat er die avond anders is aan de toog: een extra drank, of een actie zoals 2+1 gratis Stella. Ze staan op
          de homepagina en boven de drankkaart zolang de avond loopt.
        </p>
      </div>

      <fieldset disabled={readOnly} className="space-y-4 disabled:opacity-60">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line-2)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            Geen specials vanavond.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row, index) => (
              <li key={index} className="fakbar-special-row">
                <div className="fakbar-special-grid">
                  <div>
                    <Label htmlFor={`special-kind-${index}`}>Soort</Label>
                    <Select
                      id={`special-kind-${index}`}
                      name={`special:${index}:kind`}
                      value={row.kind}
                      onChange={(event) => update(index, { kind: event.target.value as SpecialRow['kind'] })}
                    >
                      {(['ACTIE', 'DRANK'] as const).map((kind) => (
                        <option key={kind} value={kind}>
                          {KIND_LABELS[kind]}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor={`special-title-${index}`}>Op het bord</Label>
                    <Input
                      id={`special-title-${index}`}
                      name={`special:${index}:title`}
                      value={row.title}
                      maxLength={120}
                      placeholder={row.kind === 'ACTIE' ? '2+1 gratis Stella' : 'Cocktail van de maand'}
                      onChange={(event) => update(index, { title: event.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`special-item-${index}`}>Artikel</Label>
                    <Select
                      id={`special-item-${index}`}
                      name={`special:${index}:itemId`}
                      value={row.itemId}
                      onChange={(event) => update(index, { itemId: event.target.value })}
                    >
                      <option value="">Geen specifiek artikel</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({formatEuro(item.salesPrice)})
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor={`special-price-${index}`}>Prijs vanavond</Label>
                    <Input
                      id={`special-price-${index}`}
                      name={`special:${index}:price`}
                      inputMode="decimal"
                      value={row.price}
                      placeholder="gewone prijs"
                      onChange={(event) => update(index, { price: event.target.value })}
                    />
                  </div>

                  <div className="fakbar-special-note">
                    <Label htmlFor={`special-note-${index}`}>Toelichting (optioneel)</Label>
                    <Input
                      id={`special-note-${index}`}
                      name={`special:${index}:note`}
                      value={row.note}
                      maxLength={200}
                      placeholder="Enkel tot middernacht"
                      onChange={(event) => update(index, { note: event.target.value })}
                    />
                  </div>

                  <button
                    type="button"
                    className="fakbar-special-remove"
                    aria-label={`Special verwijderen: ${row.title || `regel ${index + 1}`}`}
                    title="Regel verwijderen"
                    onClick={() => remove(index)}
                  >
                    <ElixirIcon name="trash" className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 text-xs text-[var(--muted)]">{KIND_HINTS[row.kind]}</p>
              </li>
            ))}
          </ul>
        )}

        {rows.length < MAX_SPECIALS ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="fakbar-btn fakbar-btn-ghost"
              onClick={() => setRows((current) => [...current, emptyRow('ACTIE')])}
            >
              <ElixirIcon name="plus" className="h-4 w-4" />
              Actie toevoegen
            </button>
            <button
              type="button"
              className="fakbar-btn fakbar-btn-ghost"
              onClick={() => setRows((current) => [...current, emptyRow('DRANK')])}
            >
              <ElixirIcon name="plus" className="h-4 w-4" />
              Extra drank toevoegen
            </button>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Acht is het maximum. Haal er eerst een weg als er nog een bij moet.
          </p>
        )}
      </fieldset>
    </SaveForm>
  );
}
