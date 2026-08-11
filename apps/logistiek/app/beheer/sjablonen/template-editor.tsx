'use client';

import { useMemo, useState } from 'react';
import { saveTemplateAction } from '@/app/actions/beheer';
import { CategoryThumb } from '@/components/category-thumb';
import { QuantityInput } from '@/components/quantity-input';
import { SetContents } from '@/components/set-contents';
import { SaveForm } from '@/components/ui/save-form';
import type { CatalogCategory } from '@/lib/uitleen-server';

/**
 * Een sjabloon met de hand samenstellen: dezelfde catalogusbrowser als het
 * aanvraagformulier, zonder de datums, het evenement en de contactvelden. Die
 * horen bij een aanvraag en niet bij een sjabloon; een sjabloon is enkel een
 * materiaallijst.
 *
 * Wat er wel bij hoort: de drill-down per categorie, het zoekveld en de
 * plus/min-teller. Wie een sjabloon opstelt zoekt op precies dezelfde manier als
 * wie een aanvraag indient, en een tweede, kalere itemkiezer leren kennen is
 * werk zonder opbrengst.
 */
const ERRORS = {
  NAME_REQUIRED: 'Geef het sjabloon een naam, bv. "Cantus".',
  NO_LINES: 'Kies minstens één item; een leeg sjabloon vult niets in.',
};

const inputClass =
  'h-10 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

export type TemplateDraft = {
  id: string;
  name: string;
  description: string;
  /** Aantal per itemId. */
  quantities: Record<string, number>;
};

export function TemplateEditor({
  catalog,
  initial,
  onDone,
  onCancel,
}: {
  catalog: CatalogCategory[];
  /** Leeg voor een nieuw sjabloon. */
  initial?: TemplateDraft;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(initial?.quantities ?? {});
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const itemsById = useMemo(() => {
    const map = new Map<string, CatalogCategory['items'][number] & { categoryName: string }>();
    for (const category of catalog) {
      for (const item of category.items) map.set(item.id, { ...item, categoryName: category.name });
    }
    return map;
  }, [catalog]);

  const chosen = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ item: itemsById.get(itemId), quantity }))
    .filter((row): row is { item: NonNullable<typeof row.item>; quantity: number } => Boolean(row.item))
    .sort((a, b) => a.item.name.localeCompare(b.item.name, 'nl'));

  const setQuantity = (itemId: string, next: number) =>
    setQuantities((current) => {
      const item = itemsById.get(itemId);
      const clamped = Math.min(Math.max(next, 0), item?.quantity ?? 0);
      if (clamped === 0) {
        const { [itemId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [itemId]: clamped };
    });

  const needle = search.trim().toLowerCase();
  const shownCatalog = useMemo(
    () =>
      catalog
        .filter((category) => activeCategory === 'all' || (category.id ?? 'overig') === activeCategory)
        .map((category) => ({
          ...category,
          items: category.items.filter(
            (item) =>
              !needle ||
              item.name.toLowerCase().includes(needle) ||
              (item.description ?? '').toLowerCase().includes(needle)
          ),
        }))
        .filter((category) => category.items.length > 0),
    [catalog, activeCategory, needle]
  );

  const browsing = Boolean(needle) || activeCategory !== 'all';

  return (
    <SaveForm
      action={saveTemplateAction}
      submitLabel={initial ? 'Sjabloon opslaan' : 'Sjabloon aanmaken'}
      savingLabel="Opslaan..."
      savedMessage={initial ? 'Sjabloon bijgewerkt.' : 'Sjabloon aangemaakt; het staat nu in het aanvraagformulier.'}
      errorMessages={ERRORS}
      onSuccess={onDone}
      className="grid gap-4 rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6"
    >
      {initial ? <input type="hidden" name="templateId" value={initial.id} /> : null}
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(chosen.map((row) => ({ itemId: row.item.id, quantity: row.quantity })))}
      />

      <div>
        <h3 className="text-lg font-semibold tracking-tight text-vtk-ink">
          {initial ? `Sjabloon aanpassen: ${initial.name}` : 'Nieuw sjabloon'}
        </h3>
        <p className="mt-1 text-sm text-vtk-muted">
          Enkel de materiaallijst. Datums, evenement en contactgegevens vult het lid zelf in wanneer
          het het sjabloon gebruikt.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Naam
          <input
            type="text"
            name="name"
            defaultValue={initial?.name ?? ''}
            placeholder="Bv. Cantus"
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Toelichting <span className="font-normal">(optioneel)</span>
          <input
            type="text"
            name="description"
            defaultValue={initial?.description ?? ''}
            placeholder="Bv. zonder de vaten"
            className={inputClass}
          />
        </label>
      </div>

      {/* Het gekozene bovenaan en niet onderaan: bij 405 items scroll je anders
          terug naar boven om te zien wat er al in zit. */}
      <div className="rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
        <p className="text-sm font-medium text-vtk-ink">
          In dit sjabloon{chosen.length > 0 ? ` (${chosen.length})` : ''}
        </p>
        {chosen.length === 0 ? (
          <p className="mt-1 text-xs text-vtk-muted">
            Nog niets gekozen. Zoek hieronder of open een categorie.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {chosen.map((row) => (
              <li
                key={row.item.id}
                className="flex items-center gap-2 rounded-full bg-vtk-surface px-3 py-1 text-sm text-vtk-ink shadow-sm"
              >
                <span className="font-semibold tabular-nums">{row.quantity}×</span>
                <span>{row.item.name}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(row.item.id, 0)}
                  className="grid h-5 w-5 place-items-center rounded-full text-vtk-muted transition hover:bg-vtk-paper hover:text-vtk-ink"
                  aria-label={`${row.item.name} uit het sjabloon halen`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Zoek materiaal..."
          className="h-10 min-w-[200px] flex-1 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
        />
        <select
          value={activeCategory}
          onChange={(event) => setActiveCategory(event.target.value)}
          className={inputClass}
        >
          <option value="all">Alle categorieën</option>
          {catalog.map((category) => (
            <option key={category.id ?? 'overig'} value={category.id ?? 'overig'}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Zoals in het aanvraagformulier: eerst de categorietegels, en pas na een
          klik of een zoekterm de items zelf. */}
      {!browsing ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.map((category) => (
            <button
              key={category.id ?? 'overig'}
              type="button"
              onClick={() => setActiveCategory(category.id ?? 'overig')}
              className="min-h-20 rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-4 text-left transition hover:border-vtk-navy/35"
            >
              <span className="block text-sm font-semibold text-vtk-ink">{category.name}</span>
              <span className="mt-1 block text-xs text-vtk-muted">{category.items.length} items</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {!needle ? (
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className="justify-self-start text-sm font-semibold text-vtk-navy"
            >
              ← Alle categorieën
            </button>
          ) : null}

          {shownCatalog.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-vtk-navy/20 bg-vtk-surface px-4 py-4 text-sm text-vtk-muted">
              Niets gevonden.
            </p>
          ) : null}

          {shownCatalog.map((category) => (
            <section
              key={category.id ?? 'overig'}
              className="@container rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5"
            >
              <h4 className="text-base font-semibold tracking-tight text-vtk-ink">{category.name}</h4>
              <ul className="mt-3 grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
                {category.items.map((item) => {
                  const quantity = quantities[item.id] ?? 0;
                  const imageKey = item.photoKey ?? item.photoKeys[0];
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col overflow-hidden rounded-[14px] border border-vtk-navy/10 bg-white"
                    >
                      <div className="aspect-[4/3] w-full bg-vtk-paper-2">
                        {imageKey ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/media/${imageKey.split('/').map(encodeURIComponent).join('/')}`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <CategoryThumb categoryName={category.name} />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-3">
                        <p className="flex items-center gap-2 text-sm font-medium text-vtk-ink">
                          {item.name}
                          {item.isSet ? (
                            <span className="rounded-full bg-vtk-yellow/25 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                              Set
                            </span>
                          ) : null}
                        </p>
                        {item.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-vtk-muted">{item.description}</p>
                        ) : null}
                        <SetContents contents={item.setContents} locale="nl" />
                        <p className="mt-0.5 text-xs text-vtk-muted">{item.quantity} in voorraad</p>
                        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                          <button
                            type="button"
                            onClick={() => setQuantity(item.id, quantity - 1)}
                            disabled={quantity <= 0}
                            aria-label={`Minder: ${item.name}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-vtk-navy/25 text-lg font-medium text-vtk-navy transition hover:bg-vtk-navy/5 disabled:opacity-30"
                          >
                            −
                          </button>
                          <QuantityInput
                            value={quantity}
                            max={item.quantity}
                            onChange={(next) => setQuantity(item.id, next)}
                            label={`Aantal: ${item.name}`}
                          />
                          <button
                            type="button"
                            onClick={() => setQuantity(item.id, quantity + 1)}
                            disabled={quantity >= item.quantity}
                            aria-label={`Meer: ${item.name}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-vtk-navy text-lg font-medium text-white transition hover:bg-vtk-ink disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="justify-self-start text-sm text-vtk-muted underline underline-offset-2"
      >
        Annuleren
      </button>
    </SaveForm>
  );
}
