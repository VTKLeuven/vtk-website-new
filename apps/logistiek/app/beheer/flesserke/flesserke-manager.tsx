'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { UitleenFlesserkeCategory } from '@prisma/client';
import {
  deactivateFlesserkeCategoryAction,
  saveFlesserkeCategoryAction,
  saveFlesserkeItemAction,
  setFlesserkeItemActiveAction,
  setFlesserkeQuantityAction,
} from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { SaveForm } from '@/components/ui/save-form';
import { useToast } from '@/components/ui/toast';
import { SortHeader, compareText, useSort } from '@/app/beheer/sortable-header';
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

const inputClass = 'h-9 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

function isExpiringSoon(date: Date | null): boolean {
  if (!date) return false;
  const days = (date.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  return days < 21; // binnen 3 weken (of al verlopen)
}

function QuantityQuickEdit({ itemId, quantity }: { itemId: string; quantity: number }) {
  const router = useRouter();
  const showToast = useToast();
  const [value, setValue] = useState(String(quantity));
  const [pending, startTransition] = useTransition();

  function save() {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      showToast({ message: 'Ongeldig aantal.', variant: 'error', duration: 0 });
      return;
    }
    if (parsed === quantity) return;
    startTransition(async () => {
      const result = await setFlesserkeQuantityAction(itemId, parsed);
      if (result.ok) {
        showToast({ message: 'Voorraad bijgewerkt.', variant: 'success' });
        router.refresh();
      } else {
        showToast({ message: result.error ?? 'Er ging iets mis.', variant: 'error', duration: 0 });
      }
    });
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
      className={`${inputClass} w-20`}
      aria-label="Voorraad"
    />
  );
}

function ItemFields({ item, categories }: { item?: AdminFlesserkeItem; categories: UitleenFlesserkeCategory[] }) {
  const expiryValue = item?.expiryDate
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
        item.expiryDate
      )
    : '';
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {item ? <input type="hidden" name="expectedUpdatedAt" value={item.updatedAt.toISOString()} /> : null}
      <label className="grid gap-1 text-xs font-medium text-vtk-muted xl:col-span-2">
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
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Aantal<input type="number" name="quantity" min={0} defaultValue={item?.quantity ?? 0} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Hoeveelheid<input type="text" name="contentAmount" defaultValue={item?.contentAmount ?? ''} placeholder="Bv. 0,5 L" className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Vervaldatum<input type="date" name="expiryDate" defaultValue={expiryValue} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Schap<input type="text" name="locationShelf" defaultValue={item?.locationShelf ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Rek<input type="text" name="locationRack" defaultValue={item?.locationRack ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted xl:col-span-2">
        Colruyt-link<input type="url" name="colruytUrl" defaultValue={item?.colruytUrl ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted xl:col-span-2">
        Notitie<input type="text" name="note" defaultValue={item?.note ?? ''} className={inputClass} />
      </label>
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
          (item.brand ?? '').toLowerCase().includes(needle)
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
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-vtk-navy/10 text-left text-xs text-vtk-muted">
                <SortHeader label="Item" sortKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
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
                return (
                  <tr key={item.id} className="border-b border-vtk-navy/5">
                    <td className="py-2 pr-3 text-vtk-ink">
                      {item.name}
                      {item.brand ? <span className="text-vtk-muted"> · {item.brand}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-vtk-muted">{categoryName}</td>
                    <td className={`py-2 pr-3 ${soon ? 'font-semibold text-red-700' : 'text-vtk-muted'}`}>
                      {item.expiryDate
                        ? new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(item.expiryDate)
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-vtk-muted">{item.reserved}</td>
                    <td className={`py-2 pr-3 font-semibold ${available <= 0 ? 'text-red-700' : 'text-vtk-ink'}`}>
                      {available}
                    </td>
                    <td className="py-2 pr-3">
                      <QuantityQuickEdit itemId={item.id} quantity={item.quantity} />
                    </td>
                    <td className="py-2">
                      <ConfirmActionButton
                        label="Uit lijst"
                        successMessage="Uit de lijst gehaald."
                        action={setFlesserkeItemActiveAction.bind(null, item.id, false)}
                        destructive
                        dialogTitle="Uit de flesserke-lijst halen?"
                        dialogDescription="Leden kunnen dit niet meer aanvragen; de historiek blijft bewaard."
                      />
                    </td>
                  </tr>
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
