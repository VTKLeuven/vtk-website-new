'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UitleenCategory } from '@prisma/client';
import {
  activateItemAction,
  deactivateCategoryAction,
  deactivateItemAction,
  saveCategoryAction,
  saveItemAction,
  setItemQuantityAction,
} from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { PhotoUpload } from '@/components/photo-upload';
import { SaveForm } from '@/components/ui/save-form';
import { useToast } from '@/components/ui/toast';
import { SortHeader, compareText, useSort } from '@/app/beheer/sortable-header';
import type { AdminInventoryItem } from '@/lib/uitleen-server';

type InventorySortKey = 'name' | 'category' | 'condition';

const STALE_MESSAGE = 'Iemand anders paste dit net aan. Herlaad de pagina en probeer opnieuw.';
const CATEGORY_ERRORS = { NAME_REQUIRED: 'Geef de categorie een naam.', STALE: STALE_MESSAGE };
const ITEM_ERRORS = {
  NAME_REQUIRED: 'Geef het item een naam.',
  QUANTITY_INVALID: 'Het aantal moet minstens 1 zijn.',
  AMOUNT_INVALID: 'Prijs en waarborg moeten bedragen zijn, bv. 2,50.',
  STALE: STALE_MESSAGE,
};

const CONDITIONS: Array<{ value: string; label: string }> = [
  { value: 'WERKT', label: 'Werkt' },
  { value: 'TESTEN', label: 'Nog testen' },
  { value: 'ONVOLLEDIG', label: 'Onvolledig' },
  { value: 'KAPOT', label: 'Kapot / vervangen' },
];

const CONDITION_LABEL: Record<string, string> = Object.fromEntries(CONDITIONS.map((c) => [c.value, c.label]));

const inputClass = 'h-10 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

function centsToEuroInput(cents: number): string {
  return cents === 0 ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

type SetRow = { label: string; quantity: number };

function SetContentsEditor({ initial }: { initial: SetRow[] }) {
  const [rows, setRows] = useState<SetRow[]>(initial.length > 0 ? initial : [{ label: '', quantity: 1 }]);
  const update = (index: number, patch: Partial<SetRow>) =>
    setRows((cur) => cur.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="grid gap-2">
      <input type="hidden" name="setContents" value={JSON.stringify(rows.filter((r) => r.label.trim()))} />
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={row.label}
            onChange={(e) => update(index, { label: e.target.value })}
            placeholder="Bv. XLR-kabel 5m"
            className={`${inputClass} flex-1`}
          />
          <input
            type="number"
            min={1}
            value={row.quantity}
            onChange={(e) => update(index, { quantity: Number.parseInt(e.target.value, 10) || 1 })}
            className={`${inputClass} w-20`}
          />
          <button
            type="button"
            onClick={() => setRows((cur) => cur.filter((_, i) => i !== index))}
            className="grid h-9 w-9 place-items-center rounded-full border border-vtk-navy/15 text-vtk-muted transition hover:border-vtk-navy/40"
            aria-label="Rij verwijderen"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((cur) => [...cur, { label: '', quantity: 1 }])}
        className="justify-self-start rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40"
      >
        + Onderdeel
      </button>
    </div>
  );
}

function ItemFields({ item, categories }: { item?: AdminInventoryItem; categories: UitleenCategory[] }) {
  const [isSet, setIsSet] = useState(item?.isSet ?? false);
  return (
    <>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {item ? <input type="hidden" name="expectedUpdatedAt" value={item.updatedAt.toISOString()} /> : null}
      <div className="@container">
      <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-6">
        <div className="col-span-full">
          <PhotoUpload name="photoKey" initialKey={item?.photoKey ?? null} />
        </div>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted @3xl:col-span-2">
          Naam<input type="text" name="name" defaultValue={item?.name ?? ''} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted @3xl:col-span-2">
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
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Aantal<input type="number" name="quantity" min={1} defaultValue={item?.quantity ?? 1} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Huurprijs (€)
          <input type="text" name="price" inputMode="decimal" placeholder="0,00" defaultValue={item ? centsToEuroInput(item.priceCents) : ''} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Waarborg (€)
          <input type="text" name="deposit" inputMode="decimal" placeholder="0,00" defaultValue={item ? centsToEuroInput(item.depositCents) : ''} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Schap<input type="text" name="locationShelf" defaultValue={item?.locationShelf ?? ''} placeholder="Bv. 2R" className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Rek<input type="text" name="locationRack" defaultValue={item?.locationRack ?? ''} placeholder="Bv. A1" className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Staat
          <select name="condition" defaultValue={item?.condition ?? 'WERKT'} className={inputClass}>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted @lg:col-span-2 @3xl:col-span-4">
          Beschrijving <span className="font-normal">(optioneel)</span>
          <input type="text" name="description" defaultValue={item?.description ?? ''} placeholder="Bv. inclusief statief en kabel" className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted col-span-full">
          Notitie bij de staat <span className="font-normal">(optioneel)</span>
          <input type="text" name="conditionNote" defaultValue={item?.conditionNote ?? ''} className={inputClass} />
        </label>
      </div>
      </div>

      <div className="rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-vtk-ink">
          <input type="checkbox" name="isSet" checked={isSet} onChange={(e) => setIsSet(e.target.checked)} className="h-4 w-4" />
          Dit is een set (fysiek samengesteld pakket)
        </label>
        {isSet ? (
          <div className="mt-3">
            <p className="mb-2 text-xs text-vtk-muted">
              Wat zit er in de set? De inhoud is beschrijvend en telt niet apart mee voor de voorraad.
            </p>
            <SetContentsEditor initial={(item?.setContents ?? []).map((c) => ({ label: c.label, quantity: c.quantity }))} />
          </div>
        ) : null}
      </div>
    </>
  );
}

function QuantityQuickEdit({ itemId, quantity }: { itemId: string; quantity: number }) {
  const router = useRouter();
  const showToast = useToast();
  const [value, setValue] = useState(String(quantity));
  const [pending, setPending] = useState(false);

  async function save() {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      showToast({ message: 'Ongeldig aantal.', variant: 'error', duration: 0 });
      return;
    }
    if (parsed === quantity) return;
    setPending(true);
    const result = await setItemQuantityAction(itemId, parsed);
    setPending(false);
    if (result.ok) {
      showToast({ message: 'Voorraad bijgewerkt.', variant: 'success' });
      router.refresh();
    } else {
      showToast({ message: result.error ?? 'Er ging iets mis.', variant: 'error', duration: 0 });
    }
  }

  return (
    <input
      type="number"
      min={0}
      value={value}
      disabled={pending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={`${inputClass} h-9 w-20`}
      aria-label="Voorraad"
    />
  );
}

const CONDITION_TONE: Record<string, string> = {
  WERKT: 'text-vtk-muted',
  TESTEN: 'text-amber-700',
  ONVOLLEDIG: 'text-amber-700',
  KAPOT: 'font-semibold text-red-700',
};

export function InventoryManager({
  categories,
  items,
}: {
  categories: UitleenCategory[];
  items: AdminInventoryItem[];
}) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const sort = useSort<InventorySortKey>('name');

  const activeCategories = categories.filter((c) => c.active);
  const inactiveCategories = categories.filter((c) => !c.active);
  const activeItems = items.filter((item) => item.active);
  const inactiveItems = items.filter((item) => !item.active);
  const stockCount = activeItems.reduce((total, item) => total + item.quantity, 0);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Overig';

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const nameOf = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Overig';
    const filtered = activeItems
      .filter((item) => activeCategory === 'all' || (item.categoryId ?? 'overig') === activeCategory)
      .filter(
        (item) =>
          !needle ||
          item.name.toLowerCase().includes(needle) ||
          (item.description ?? '').toLowerCase().includes(needle)
      );
    return [...filtered].sort((a, b) => {
      if (sort.key === 'category') return compareText(nameOf(a.categoryId), nameOf(b.categoryId), sort.dir);
      if (sort.key === 'condition') {
        return compareText(CONDITION_LABEL[a.condition] ?? a.condition, CONDITION_LABEL[b.condition] ?? b.condition, sort.dir);
      }
      return compareText(a.name, b.name, sort.dir);
    });
  }, [activeItems, categories, search, activeCategory, sort.key, sort.dir]);

  return (
    <div className="grid gap-8">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">Inventaris</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-vtk-body">
              Beheer hier wat leden kunnen aanvragen. Pas het aantal aan voor de voorraad; open "Bewerken"
              voor de volledige details.
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-vtk-navy/10 overflow-hidden rounded-[14px] border border-vtk-navy/10 text-center">
            <div className="px-3 py-2.5"><p className="text-lg font-semibold text-vtk-ink">{activeItems.length}</p><p className="text-[11px] text-vtk-muted">items</p></div>
            <div className="px-3 py-2.5"><p className="text-lg font-semibold text-vtk-ink">{stockCount}</p><p className="text-[11px] text-vtk-muted">stuks</p></div>
            <div className="px-3 py-2.5"><p className="text-lg font-semibold text-vtk-ink">{activeCategories.length}</p><p className="text-[11px] text-vtk-muted">categorieën</p></div>
          </div>
        </div>
      </section>

      {/* Toevoegen bovenaan zodat je niet hoeft te scrollen. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <details className="rounded-[16px] border border-dashed border-vtk-navy/25 bg-vtk-surface p-5" open={activeItems.length === 0}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-vtk-ink [&::-webkit-details-marker]:hidden">
            <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-vtk-yellow text-base leading-none">+</span>
            Nieuw item toevoegen
          </summary>
          <div className="mt-4">
            <SaveForm action={saveItemAction} submitLabel="Item toevoegen" savingLabel="Toevoegen..." savedMessage="Item toegevoegd." errorMessages={ITEM_ERRORS} className="grid gap-4">
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
            <SaveForm action={saveCategoryAction} submitLabel="Categorie toevoegen" savingLabel="Toevoegen..." savedMessage="Categorie toegevoegd." errorMessages={CATEGORY_ERRORS} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-end">
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">Nieuwe categorie<input type="text" name="name" placeholder="Bv. Gereedschap" className={`${inputClass} w-full`} /></label>
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">Volgorde<input type="number" name="sortIndex" defaultValue={0} className={`${inputClass} w-full`} /></label>
              </div>
            </SaveForm>
            <ul className="grid gap-2">
              {activeCategories.map((category) => (
                <li key={category.id} className="rounded-[12px] border border-vtk-navy/10 bg-vtk-paper/55">
                  <details>
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="font-medium text-vtk-ink">{category.name}</span>
                      <span className="text-xs text-vtk-muted">{activeItems.filter((i) => i.categoryId === category.id).length} items</span>
                    </summary>
                    <div className="border-t border-vtk-navy/10 px-3 py-3">
                      <SaveForm action={saveCategoryAction} submitLabel="Opslaan" savingLabel="Opslaan..." savedMessage="Categorie opgeslagen." errorMessages={CATEGORY_ERRORS} className="grid gap-3">
                        <input type="hidden" name="id" value={category.id} />
                        <input type="hidden" name="expectedUpdatedAt" value={category.updatedAt.toISOString()} />
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-end">
                          <label className="grid gap-1 text-xs font-medium text-vtk-muted">Naam<input type="text" name="name" defaultValue={category.name} className={`${inputClass} w-full`} /></label>
                          <label className="grid gap-1 text-xs font-medium text-vtk-muted">Volgorde<input type="number" name="sortIndex" defaultValue={category.sortIndex} className={`${inputClass} w-full`} /></label>
                        </div>
                      </SaveForm>
                      <div className="mt-2">
                        <ConfirmActionButton label="Uit catalogus halen" successMessage="Categorie uit de catalogus gehaald." action={deactivateCategoryAction.bind(null, category.id)} destructive dialogTitle="Categorie uit de catalogus halen?" dialogDescription="De categorie verdwijnt; haar items blijven bestaan en verhuizen naar ‘Overig’." />
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            {inactiveCategories.length > 0 ? (
              <p className="text-xs text-vtk-muted">{inactiveCategories.length} categorie(ën) niet meer in de catalogus.</p>
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
        <h3 className="text-lg font-semibold tracking-tight text-vtk-ink">Items ({shown.length})</h3>
        {shown.length === 0 ? (
          <p className="mt-3 rounded-[14px] border border-dashed border-vtk-navy/20 bg-vtk-surface px-4 py-4 text-sm text-vtk-muted">
            Niets gevonden.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-vtk-navy/10 text-left text-xs text-vtk-muted">
                  <SortHeader label="Item" sortKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                  <SortHeader label="Categorie" sortKey="category" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                  <SortHeader label="Staat" sortKey="condition" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                  <th className="py-2 pr-3 font-medium">Locatie</th>
                  <th className="py-2 pr-3 font-medium">Voorraad</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => {
                  const editing = editingId === item.id;
                  const location = [item.locationShelf, item.locationRack].filter(Boolean).join(' · ') || '—';
                  return (
                    <Fragment key={item.id}>
                      <tr className="border-b border-vtk-navy/5 align-top">
                        <td className="py-2 pr-3 text-vtk-ink">
                          <span className="font-medium">{item.name}</span>
                          {item.isSet ? (
                            <span className="ml-2 rounded-full bg-vtk-yellow/25 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">Set</span>
                          ) : null}
                          {item.description ? <p className="text-xs text-vtk-muted">{item.description}</p> : null}
                        </td>
                        <td className="py-2 pr-3 text-vtk-muted">{categoryName(item.categoryId)}</td>
                        <td className={`py-2 pr-3 ${CONDITION_TONE[item.condition] ?? 'text-vtk-muted'}`}>
                          {CONDITION_LABEL[item.condition] ?? item.condition}
                        </td>
                        <td className="py-2 pr-3 text-vtk-muted">{location}</td>
                        <td className="py-2 pr-3">
                          <QuantityQuickEdit itemId={item.id} quantity={item.quantity} />
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
                              label="Uit catalogus"
                              successMessage="Item uit de catalogus gehaald."
                              action={deactivateItemAction.bind(null, item.id)}
                              destructive
                              dialogTitle="Item uit de catalogus halen?"
                              dialogDescription="Leden kunnen dit item niet meer aanvragen. Bestaande reservaties en de historiek blijven bewaard; je kan het item later terugzetten."
                            />
                          </div>
                        </td>
                      </tr>
                      {editing ? (
                        <tr>
                          <td colSpan={6} className="border-b border-vtk-navy/10 bg-vtk-paper/55 px-4 py-5">
                            <p className="mb-4 text-sm font-semibold text-vtk-ink">Item aanpassen</p>
                            <SaveForm
                              action={saveItemAction}
                              submitLabel="Wijzigingen opslaan"
                              savingLabel="Opslaan..."
                              savedMessage="Item opgeslagen."
                              errorMessages={ITEM_ERRORS}
                              onSuccess={() => setEditingId(null)}
                              className="grid gap-4"
                            >
                              <ItemFields item={item} categories={categories} />
                            </SaveForm>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inactiveItems.length > 0 ? (
        <details className="rounded-[16px] border border-vtk-navy/10 bg-vtk-paper/60">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-vtk-ink">Uit de catalogus ({inactiveItems.length})</summary>
          <ul className="grid gap-2 border-t border-vtk-navy/10 px-4 py-4">
            {inactiveItems.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-vtk-surface px-3 py-2.5 text-sm">
                <span className="text-vtk-muted">{item.name}</span>
                <ConfirmActionButton label="Terugzetten" successMessage="Item terug in de catalogus gezet." action={activateItemAction.bind(null, item.id)} confirm={false} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
