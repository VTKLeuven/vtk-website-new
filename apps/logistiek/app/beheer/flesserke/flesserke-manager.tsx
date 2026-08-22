'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import type { UitleenFlesserkeCategory } from '@prisma/client';
import {
  deactivateFlesserkeCategoryAction,
  deleteFlesserkeBatchAction,
  saveFlesserkeBatchAction,
  saveFlesserkeCategoryAction,
  saveFlesserkeItemAction,
  setFlesserkeItemActiveAction,
} from '@/app/actions/beheer';
import { FlesserkeItemName } from '@/components/flesserke-item-name';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { SaveForm } from '@/components/ui/save-form';
import { SortHeader, compareText, useSort } from '@/app/beheer/sortable-header';
import { CONTENT_UNITS, formatContentAmount } from '@/lib/uitleen';
import type { AdminFlesserkeItem } from '@/lib/uitleen-server';

type FlesserkeSortKey = 'name' | 'category';

const STALE_MESSAGE = 'Iemand anders paste dit net aan. Herlaad de pagina en probeer opnieuw.';
const ITEM_ERRORS = {
  NAME_REQUIRED: 'Geef het item een naam.',
  QUANTITY_INVALID: 'Het aantal moet 0 of meer zijn.',
  DATE_INVALID: 'De vervaldatum is ongeldig.',
  STALE: STALE_MESSAGE,
};
const CATEGORY_ERRORS = { NAME_REQUIRED: 'Geef de categorie een naam.', STALE: STALE_MESSAGE };
const BATCH_ERRORS = {
  NOT_FOUND: 'Dit item bestaat niet meer.',
  QUANTITY_INVALID: 'Het aantal moet 0 of meer zijn.',
  DATE_INVALID: 'De vervaldatum is ongeldig.',
};

/** "YYYY-MM-DD" voor een date-input; leeg wanneer er geen datum is. */
function dateInputValue(date: Date | null): string {
  return date
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date)
    : '';
}

function dateLabel(date: Date | null): string {
  return date
    ? new Intl.DateTimeFormat('nl-BE', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date)
    : 'geen datum';
}

const inputClass = 'h-9 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

function isExpiringSoon(date: Date | null): boolean {
  if (!date) return false;
  const days = (date.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  return days < 21; // binnen 3 weken (of al verlopen)
}

/**
 * De velden van een flesserke-item. Aantal en vervaldatum horen bij een lading en
 * niet bij het item; bij het aanmaken vraagt het formulier ze wel, want dat wordt
 * meteen de eerste lading.
 */
function ItemFields({
  item,
  categories,
}: {
  item?: AdminFlesserkeItem;
  categories: UitleenFlesserkeCategory[];
}) {
  return (
    <div className="@container">
    <div className="grid gap-3 @lg:grid-cols-2 @2xl:grid-cols-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {item ? <input type="hidden" name="expectedUpdatedAt" value={item.updatedAt.toISOString()} /> : null}
      <label className="grid gap-1 text-xs font-medium text-vtk-muted @2xl:col-span-2">
        Naam<input type="text" name="name" defaultValue={item?.name ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Merk<input type="text" name="brand" defaultValue={item?.brand ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Categorie
        <select name="categoryId" defaultValue={item?.categoryId ?? ''} className={inputClass}>
          <option value="">Overig</option>
          {categories.filter((c) => c.active).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {item ? null : (
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Aantal<input type="number" name="quantity" min={0} defaultValue={0} className={inputClass} />
        </label>
      )}
      {/* Getal en eenheid apart. De Excel-import gaf enkel het getal ("0.14"),
          en dan is een pot tomatenpuree van 140 g niet te onderscheiden van
          140 ml. De eenheid blijft optioneel: borden en dweilen hebben er geen. */}
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Hoeveelheid
        <input type="text" name="contentAmount" defaultValue={item?.contentAmount ?? ''} placeholder="Bv. 0,5" className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Eenheid
        <select name="contentUnit" defaultValue={item?.contentUnit ?? ''} className={inputClass}>
          <option value="">Geen</option>
          {CONTENT_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </label>
      {item ? null : (
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Vervaldatum<input type="date" name="expiryDate" className={inputClass} />
        </label>
      )}
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Schap<input type="text" name="locationShelf" defaultValue={item?.locationShelf ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Rek<input type="text" name="locationRack" defaultValue={item?.locationRack ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted @lg:col-span-2">
        Colruyt-link<input type="url" name="colruytUrl" defaultValue={item?.colruytUrl ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted @lg:col-span-2">
        Notitie<input type="text" name="note" defaultValue={item?.note ?? ''} className={inputClass} />
      </label>
    </div>
    </div>
  );
}

/** De ladingen van één item, elk met een eigen aantal en vervaldatum. */
function BatchEditor({ item }: { item: AdminFlesserkeItem }) {
  return (
    <div className="grid gap-3">
      <div>
        <p className="text-sm font-semibold text-vtk-ink">Ladingen ({item.batches.length})</p>
        <p className="mt-1 text-xs text-vtk-muted">
          Twee bakken van hetzelfde product die je apart kocht, vervallen apart. De voorraad van het item
          is de som; verbruik gaat van de lading die het eerst vervalt. Dit is ook de plek waar je de
          voorraad aanpast: in de lijst is het getal enkel om te lezen.
        </p>
        <p className="mt-1 text-xs text-vtk-muted">
          Vervalt het niet (borden, bekers, kuisgerief), laat de vervaldatum dan leeg. Zo&apos;n lading
          gaat als laatste op, en één lading zonder datum volstaat voor zulke items.
        </p>
      </div>

      <ul className="grid gap-2">
        {item.batches.map((batch) => (
          <li key={batch.id} className="rounded-[12px] border border-vtk-navy/10 bg-white p-3">
            <SaveForm
              action={saveFlesserkeBatchAction}
              submitLabel="Opslaan"
              savingLabel="Opslaan..."
              savedMessage="Lading opgeslagen."
              errorMessages={BATCH_ERRORS}
              className="grid gap-2"
            >
              <input type="hidden" name="batchId" value={batch.id} />
              <input type="hidden" name="itemId" value={item.id} />
              <div className="grid gap-2 sm:grid-cols-[6rem_10rem_minmax(0,1fr)]">
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                  Aantal
                  <input
                    type="number"
                    name="quantity"
                    min={0}
                    defaultValue={batch.quantity}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                  Vervaldatum
                  <input
                    type="date"
                    name="expiryDate"
                    defaultValue={dateInputValue(batch.expiryDate)}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                  Notitie
                  <input
                    type="text"
                    name="note"
                    defaultValue={batch.note ?? ''}
                    placeholder="Bv. gekocht bij Colruyt Heverlee"
                    className={inputClass}
                  />
                </label>
              </div>
            </SaveForm>
            <div className="mt-2">
              <ConfirmActionButton
                label={`Lading verwijderen: ${item.name}, ${dateLabel(batch.expiryDate)}`}
                confirmLabel="Lading verwijderen"
                successMessage="Lading verwijderd."
                action={deleteFlesserkeBatchAction.bind(null, batch.id)}
                destructive
                dialogTitle="Deze lading verwijderen?"
                dialogDescription={`De voorraad van ${item.name} zakt met ${batch.quantity}. De andere ladingen en de historiek blijven staan.`}
              />
            </div>
          </li>
        ))}
      </ul>

      <details className="rounded-[12px] border border-dashed border-vtk-navy/25 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-vtk-ink">+ Lading toevoegen</summary>
        <div className="mt-3">
          <SaveForm
            action={saveFlesserkeBatchAction}
            submitLabel="Lading toevoegen"
            savingLabel="Toevoegen..."
            savedMessage="Lading toegevoegd."
            errorMessages={BATCH_ERRORS}
            className="grid gap-2"
          >
            <input type="hidden" name="itemId" value={item.id} />
            <div className="grid gap-2 sm:grid-cols-[6rem_10rem_minmax(0,1fr)]">
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                Aantal<input type="number" name="quantity" min={0} defaultValue={0} className={inputClass} />
              </label>
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                Vervaldatum<input type="date" name="expiryDate" className={inputClass} />
              </label>
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                Notitie<input type="text" name="note" className={inputClass} />
              </label>
            </div>
          </SaveForm>
        </div>
      </details>
    </div>
  );
}

export function FlesserkeManager({
  categories,
  items,
}: {
  categories: UitleenFlesserkeCategory[];
  items: AdminFlesserkeItem[];
}) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const sort = useSort<FlesserkeSortKey>('name');

  const active = items.filter((i) => i.active);
  const inactive = items.filter((i) => !i.active);
  const activeCategories = categories.filter((c) => c.active);
  const inactiveCategories = categories.filter((c) => !c.active);
  const stockCount = active.reduce((total, item) => total + item.quantity, 0);
  const categoryNameOf = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Overig';

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const nameOf = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Overig';
    const filtered = active
      .filter((item) => activeCategory === 'all' || (item.categoryId ?? 'overig') === activeCategory)
      .filter(
        (item) =>
          !needle ||
          item.name.toLowerCase().includes(needle) ||
          (item.brand ?? '').toLowerCase().includes(needle) ||
          formatContentAmount(item.contentAmount, item.contentUnit).toLowerCase().includes(needle)
      );
    return [...filtered].sort((a, b) => {
      if (sort.key === 'category') return compareText(nameOf(a.categoryId), nameOf(b.categoryId), sort.dir);
      return compareText(a.name, b.name, sort.dir);
    });
  }, [active, categories, search, activeCategory, sort.key, sort.dir]);

  return (
    <div className="grid gap-8">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">Flesserke</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-vtk-body">
              Verbruiksstock voor interne werking. Pas het aantal aan voor de wekelijkse upkeep; beschikbaar
              = voorraad min gereserveerd. Rood = vervalt binnen 3 weken.
            </p>
            <p className="mt-2 text-sm text-vtk-body">
              Boodschappen bij Colruyt gedaan?{' '}
              <Link href="/beheer/collectengo" className="font-medium text-vtk-ink underline underline-offset-2">
                Importeer de Collect&Go-bestelling
              </Link>{' '}
              in plaats van elk product apart toe te voegen.
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-vtk-navy/10 overflow-hidden rounded-[14px] border border-vtk-navy/10 text-center">
            <div className="px-3 py-2.5"><p className="text-lg font-semibold text-vtk-ink">{active.length}</p><p className="text-[11px] text-vtk-muted">items</p></div>
            <div className="px-3 py-2.5"><p className="text-lg font-semibold text-vtk-ink">{stockCount}</p><p className="text-[11px] text-vtk-muted">stuks</p></div>
            <div className="px-3 py-2.5"><p className="text-lg font-semibold text-vtk-ink">{activeCategories.length}</p><p className="text-[11px] text-vtk-muted">categorieën</p></div>
          </div>
        </div>
      </section>

      {/* Toevoegen bovenaan zodat je niet hoeft te scrollen. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <details className="rounded-[16px] border border-dashed border-vtk-navy/25 bg-vtk-surface p-5" open={active.length === 0}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-vtk-ink [&::-webkit-details-marker]:hidden">
            <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-vtk-yellow text-base leading-none">+</span>
            Nieuw item toevoegen
          </summary>
          <div className="mt-4">
            <SaveForm
              action={saveFlesserkeItemAction}
              submitLabel="Item toevoegen"
              savingLabel="Toevoegen..."
              savedMessage="Item toegevoegd."
              errorMessages={ITEM_ERRORS}
              className="grid gap-4"
            >
              <ItemFields categories={categories} />
            </SaveForm>
          </div>
        </details>

        <details className="rounded-[16px] border border-dashed border-vtk-navy/25 bg-vtk-surface p-5">
          <summary className="cursor-pointer list-none text-sm font-semibold text-vtk-ink [&::-webkit-details-marker]:hidden">
            <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-vtk-yellow text-base leading-none">+</span>
            Categorieën beheren
          </summary>
          <div className="mt-4 grid gap-3">
            <SaveForm
              action={saveFlesserkeCategoryAction}
              submitLabel="Categorie toevoegen"
              savingLabel="Toevoegen..."
              savedMessage="Categorie toegevoegd."
              errorMessages={CATEGORY_ERRORS}
              className="grid gap-3"
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-end">
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                  Nieuwe categorie<input type="text" name="name" className={`${inputClass} w-full`} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                  Volgorde<input type="number" name="sortIndex" defaultValue={0} className={`${inputClass} w-full`} />
                </label>
              </div>
            </SaveForm>
            <ul className="grid gap-2">
              {activeCategories.map((category) => (
                <li key={category.id} className="rounded-[12px] border border-vtk-navy/10 bg-vtk-paper/55">
                  <details>
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="font-medium text-vtk-ink">{category.name}</span>
                      <span className="text-xs text-vtk-muted">{active.filter((i) => i.categoryId === category.id).length} items</span>
                    </summary>
                    <div className="border-t border-vtk-navy/10 px-3 py-3">
                      <SaveForm action={saveFlesserkeCategoryAction} submitLabel="Opslaan" savingLabel="Opslaan..." savedMessage="Categorie opgeslagen." errorMessages={CATEGORY_ERRORS} className="grid gap-3">
                        <input type="hidden" name="id" value={category.id} />
                        <input type="hidden" name="expectedUpdatedAt" value={category.updatedAt.toISOString()} />
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-end">
                          <label className="grid gap-1 text-xs font-medium text-vtk-muted">Naam<input type="text" name="name" defaultValue={category.name} className={`${inputClass} w-full`} /></label>
                          <label className="grid gap-1 text-xs font-medium text-vtk-muted">Volgorde<input type="number" name="sortIndex" defaultValue={category.sortIndex} className={`${inputClass} w-full`} /></label>
                        </div>
                      </SaveForm>
                      <div className="mt-2">
                        <ConfirmActionButton label="Uit lijst halen" successMessage="Categorie uit de lijst gehaald." action={deactivateFlesserkeCategoryAction.bind(null, category.id)} destructive dialogTitle="Categorie uit de lijst halen?" dialogDescription="De categorie verdwijnt; haar items blijven bestaan en verhuizen naar ‘Overig’." />
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            {inactiveCategories.length > 0 ? (
              <p className="text-xs text-vtk-muted">{inactiveCategories.length} categorie(ën) niet meer in de lijst.</p>
            ) : null}
          </div>
        </details>
      </div>

      {/* Zoeken + filteren op categorie. */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek een item..."
          className="h-10 min-w-[200px] flex-1 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
        />
        <select
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
          className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
        >
          <option value="all">Alle categorieën</option>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="overig">Overig</option>
        </select>
      </div>

      <section>
        <h3 className="text-lg font-semibold tracking-tight text-vtk-ink">Voorraad ({shown.length})</h3>

        {/* Kaartjesweergave: zichtbaar op mobile, verborgen op md+ */}
        <ul className="mt-4 grid gap-3 md:hidden">
          {shown.map((item) => {
            const available = item.quantity - item.reserved;
            const soon = isExpiringSoon(item.expiryDate);
            const categoryName = categoryNameOf(item.categoryId);
            const editing = editingId === item.id;
            return (
              <Fragment key={item.id}>
                <li className="rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-vtk-ink">
                        <FlesserkeItemName name={item.name} colruytUrl={item.colruytUrl} />
                        {item.brand ? <span className="text-vtk-muted"> · {item.brand}</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-vtk-muted">
                        {formatContentAmount(item.contentAmount, item.contentUnit)}
                        {categoryName ? ` · ${categoryName}` : ''}
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>
                          <dt className="text-vtk-muted">Vervalt</dt>
                          <dd className={soon ? 'font-semibold text-red-700' : 'text-vtk-body'}>
                            {item.expiryDate ? dateLabel(item.expiryDate) : '—'}
                            {item.batches.length > 1 ? (
                              <span className="block font-normal text-vtk-muted">{item.batches.length} ladingen</span>
                            ) : null}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-vtk-muted">Gereserveerd</dt>
                          <dd className="text-vtk-body">{item.reserved}</dd>
                        </div>
                        <div>
                          <dt className="text-vtk-muted">Beschikbaar</dt>
                          <dd className={`font-semibold ${available <= 0 ? 'text-red-700' : 'text-vtk-ink'}`}>{available}</dd>
                        </div>
                        <div>
                          <dt className="text-vtk-muted">Voorraad</dt>
                          <dd className="font-semibold text-vtk-ink">
                            {item.quantity}
                            {item.batches.length === 0 ? (
                              <span className="block font-normal text-vtk-muted">geen lading</span>
                            ) : null}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(editing ? null : item.id)}
                      className="rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
                      aria-expanded={editing}
                    >
                      {editing ? 'Sluiten' : 'Bewerken'}
                    </button>
                    <ConfirmActionButton
                      label="Uit lijst"
                      successMessage="Uit de lijst gehaald."
                      action={setFlesserkeItemActiveAction.bind(null, item.id, false)}
                      destructive
                      dialogTitle="Uit de flesserke-lijst halen?"
                      dialogDescription="Leden kunnen dit niet meer aanvragen; de historiek blijft bewaard."
                    />
                  </div>
                  {editing ? (
                    <div className="mt-4 border-t border-vtk-navy/10 pt-4">
                      <p className="mb-4 text-sm font-semibold text-vtk-ink">Item aanpassen</p>
                      <SaveForm
                        action={saveFlesserkeItemAction}
                        submitLabel="Wijzigingen opslaan"
                        savingLabel="Opslaan..."
                        savedMessage="Item opgeslagen."
                        errorMessages={ITEM_ERRORS}
                        className="grid gap-4"
                      >
                        <ItemFields item={item} categories={categories} />
                      </SaveForm>
                      <div className="mt-5 border-t border-vtk-navy/10 pt-4">
                        <BatchEditor item={item} />
                      </div>
                    </div>
                  ) : null}
                </li>
              </Fragment>
            );
          })}
        </ul>

        {/* Tabelweergave: verborgen op mobile, zichtbaar op md+ */}
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-vtk-navy/10 text-left text-xs text-vtk-muted">
                <SortHeader label="Item" sortKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                <th className="py-2 pr-3 font-medium">Inhoud</th>
                <SortHeader label="Categorie" sortKey="category" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                <th className="py-2 pr-3 font-medium">Vervalt</th>
                <th className="py-2 pr-3 font-medium">Gereserveerd</th>
                <th className="py-2 pr-3 font-medium">Beschikbaar</th>
                <th className="py-2 pr-3 font-medium">Voorraad</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => {
                const available = item.quantity - item.reserved;
                const soon = isExpiringSoon(item.expiryDate);
                const categoryName = categoryNameOf(item.categoryId);
                const editing = editingId === item.id;
                const multiBatch = item.batches.length > 1;
                return (
                  <Fragment key={item.id}>
                    <tr className="border-b border-vtk-navy/5">
                      <td className="py-2 pr-3 text-vtk-ink">
                        <FlesserkeItemName name={item.name} colruytUrl={item.colruytUrl} />
                        {item.brand ? <span className="text-vtk-muted"> · {item.brand}</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-vtk-muted">
                        {formatContentAmount(item.contentAmount, item.contentUnit)}
                      </td>
                      <td className="py-2 pr-3 text-vtk-muted">{categoryName}</td>
                      <td className={`py-2 pr-3 ${soon ? 'font-semibold text-red-700' : 'text-vtk-muted'}`}>
                        {item.expiryDate ? dateLabel(item.expiryDate) : '—'}
                        {multiBatch ? (
                          <span className="block text-[11px] font-normal text-vtk-muted">
                            {item.batches.length} ladingen
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-vtk-muted">{item.reserved}</td>
                      <td className={`py-2 pr-3 font-semibold ${available <= 0 ? 'text-red-700' : 'text-vtk-ink'}`}>
                        {available}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-vtk-ink">
                        {item.quantity}
                        {item.batches.length === 0 ? (
                          <span className="block text-[11px] font-normal text-vtk-muted">
                            geen lading
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(editing ? null : item.id)}
                            className="rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
                            aria-expanded={editing}
                          >
                            {editing ? 'Sluiten' : 'Bewerken'}
                          </button>
                          <ConfirmActionButton
                            label="Uit lijst"
                            successMessage="Uit de lijst gehaald."
                            action={setFlesserkeItemActiveAction.bind(null, item.id, false)}
                            destructive
                            dialogTitle="Uit de flesserke-lijst halen?"
                            dialogDescription="Leden kunnen dit niet meer aanvragen; de historiek blijft bewaard."
                          />
                        </div>
                      </td>
                    </tr>
                    {editing ? (
                      <tr>
                        <td colSpan={8} className="border-b border-vtk-navy/10 bg-vtk-paper/55 px-4 py-5">
                          <p className="mb-4 text-sm font-semibold text-vtk-ink">Item aanpassen</p>
                          <SaveForm
                            action={saveFlesserkeItemAction}
                            submitLabel="Wijzigingen opslaan"
                            savingLabel="Opslaan..."
                            savedMessage="Item opgeslagen."
                            errorMessages={ITEM_ERRORS}
                            className="grid gap-4"
                          >
                            <ItemFields item={item} categories={categories} />
                          </SaveForm>
                          <div className="mt-5 border-t border-vtk-navy/10 pt-4">
                            <BatchEditor item={item} />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {inactive.length > 0 ? (
        <p className="text-xs text-vtk-muted">{inactive.length} item(s) staan niet meer in de lijst.</p>
      ) : null}
    </div>
  );
}
