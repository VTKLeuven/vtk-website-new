'use client';

import { useState } from 'react';
import { Input, Label, Select } from '@vtk/ui';
import { SaveForm } from '@/components/ui/save-form';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { ElixirIcon } from '@/components/elixir-icon';
import { deleteItemAction, saveItemAction } from '@/app/actions/fakbar';
import { saveMessages } from '@/lib/saveMessages';
import { CATEGORY_LABELS, CATEGORY_ORDER, formatEuro } from '@/lib/fakbar-format';

type Item = {
  id: string;
  name: string;
  category: string;
  salesPrice: number;
  _count: { consumptions: number; stockCounts: number };
};

type Group = { key: string; label: string; items: Item[] };

/**
 * De drankkaart beheren. Er staat hoogstens één bewerktaak tegelijk open
 * (CLAUDE.md): het formulier zit ofwel op "nieuw", ofwel op één rij, nooit op
 * allebei.
 */
export function MenuManager({ groups }: { groups: Group[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {groups.reduce((total, group) => total + group.items.length, 0)} artikelen
        </p>
        {!adding ? (
          <button
            type="button"
            className="fakbar-btn fakbar-btn-primary"
            onClick={() => {
              setAdding(true);
              setEditing(null);
            }}
          >
            <ElixirIcon name="plus" className="h-4 w-4" />
            Nieuw artikel
          </button>
        ) : null}
      </div>

      {adding ? (
        <ItemForm
          key="new"
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
          title="Nieuw artikel"
        />
      ) : null}

      {groups.map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.key}>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.07em] text-[var(--muted)]">{group.label}</h3>
            <div className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)]">
              {group.items.map((item, index) =>
                editing === item.id ? (
                  <div
                    key={item.id}
                    className={index < group.items.length - 1 ? 'border-b border-[var(--line)] p-4' : 'p-4'}
                  >
                    <ItemForm
                      item={item}
                      title={`${item.name} bewerken`}
                      onDone={() => setEditing(null)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      index < group.items.length - 1 ? 'border-b border-[var(--line)]' : ''
                    }`}
                  >
                    <span className="flex-1 font-medium text-[var(--ink)]">{item.name}</span>
                    <span className="tabular-nums text-sm font-semibold text-[var(--ink)]">
                      {formatEuro(item.salesPrice)}
                    </span>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                      aria-label={`Bewerken: ${item.name}`}
                      title="Bewerken"
                      onClick={() => {
                        setEditing(item.id);
                        setAdding(false);
                      }}
                    >
                      <ElixirIcon name="edit" className="h-4 w-4" />
                    </button>
                    <ConfirmActionButton
                      label={`Verwijderen: ${item.name}`}
                      icon={<ElixirIcon name="trash" className="h-4 w-4" />}
                      destructive
                      confirmLabel="Verwijderen"
                      dialogTitle={`${item.name} verwijderen?`}
                      dialogDescription={<DeleteWarning item={item} />}
                      action={() => deleteItemAction(item.id)}
                      successMessage="Het artikel is van de kaart gehaald."
                    />
                  </div>
                ),
              )}
            </div>
          </section>
        ),
      )}
    </div>
  );
}

/** Zeg wat er precies weg is en wat blijft, niet enkel "weet je het zeker?". */
function DeleteWarning({ item }: { item: Item }) {
  const rows = item._count.consumptions + item._count.stockCounts;
  return (
    <>
      Het artikel verdwijnt van de publieke drankkaart en uit de keuzelijsten van de tellingen.
      {rows > 0 ? (
        <>
          {' '}
          De {item._count.consumptions} regels op tappersbladen en {item._count.stockCounts} stocktellingsrijen van dit
          artikel verdwijnen mee, dus de weekcijfers van eerdere weken veranderen. De overige artikelen en de rest van
          die tellingen blijven zoals ze zijn.
        </>
      ) : (
        ' Er hangen nog geen tellingen aan.'
      )}{' '}
      Dit kan niet ongedaan gemaakt worden.
    </>
  );
}

function ItemForm({
  item,
  title,
  onDone,
  onCancel,
}: {
  item?: Item;
  title: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <SaveForm
      action={saveItemAction}
      submitLabel="Opslaan"
      savingLabel="Opslaan…"
      savedMessage="Artikel opgeslagen."
      errorMessages={saveMessages}
      // Sluit het formulier zelf; de actie redirect niet meer, en een nieuw
      // artikel mag niet in "nieuw"-modus blijven staan, anders maakt een
      // tweede klik op opslaan een duplicaat (CLAUDE.md).
      onSuccess={onDone}
      className={item ? 'space-y-4' : 'fakbar-card fakbar-card-accent space-y-4'}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--ink)]">{title}</h3>
        <button type="button" className="text-sm text-[var(--muted)] underline underline-offset-2" onClick={onCancel}>
          Annuleren
        </button>
      </div>

      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-[2fr_1.2fr_1fr]">
        <div>
          <Label htmlFor={`name-${item?.id ?? 'new'}`}>Naam</Label>
          <Input id={`name-${item?.id ?? 'new'}`} name="name" defaultValue={item?.name ?? ''} required autoFocus />
        </div>
        <div>
          <Label htmlFor={`category-${item?.id ?? 'new'}`}>Categorie</Label>
          <Select id={`category-${item?.id ?? 'new'}`} name="category" defaultValue={item?.category ?? 'VAT'}>
            {CATEGORY_ORDER.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`price-${item?.id ?? 'new'}`}>Prijs in euro</Label>
          <Input
            id={`price-${item?.id ?? 'new'}`}
            name="salesPrice"
            inputMode="decimal"
            placeholder="2,30"
            defaultValue={item ? (item.salesPrice / 100).toFixed(2) : ''}
            required
          />
        </div>
      </div>
    </SaveForm>
  );
}
