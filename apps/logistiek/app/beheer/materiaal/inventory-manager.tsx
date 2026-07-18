'use client';

import { useState } from 'react';
import type { UitleenCategory, UitleenItem } from '@prisma/client';
import { Button } from '@vtk/ui';
import {
  activateItemAction,
  deactivateCategoryAction,
  deactivateItemAction,
  saveCategoryAction,
  saveItemAction,
} from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { SaveForm } from '@/components/ui/save-form';
import { LogisticsIcon } from '@/components/logistics-icon';

const CATEGORY_ERRORS = { NAME_REQUIRED: 'Geef de categorie een naam.' };
const ITEM_ERRORS = {
  NAME_REQUIRED: 'Geef het item een naam.',
  QUANTITY_INVALID: 'Het aantal moet minstens 1 zijn.',
  AMOUNT_INVALID: 'Prijs en waarborg moeten bedragen zijn, bv. 2,50.',
};

const inputClass = 'h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

function centsToEuroInput(cents: number): string {
  return cents === 0 ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

function ItemFields({
  item,
  categories,
}: {
  item?: UitleenItem;
  categories: UitleenCategory[];
}) {
  return (
    <>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="grid gap-1 text-xs font-medium text-vtk-muted xl:col-span-2">
          Naam
          <input type="text" name="name" defaultValue={item?.name ?? ''} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted xl:col-span-2">
          Categorie
          <select name="categoryId" defaultValue={item?.categoryId ?? ''} className={inputClass}>
            <option value="">Overig</option>
            {categories
              .filter((category) => category.active)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Aantal
          <input type="number" name="quantity" min={1} defaultValue={item?.quantity ?? 1} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Huurprijs (€)
          <input type="text" name="price" inputMode="decimal" placeholder="0,00" defaultValue={item ? centsToEuroInput(item.priceCents) : ''} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted sm:col-span-2 xl:col-span-3">
          Waarborg (€)
          <input type="text" name="deposit" inputMode="decimal" placeholder="0,00" defaultValue={item ? centsToEuroInput(item.depositCents) : ''} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted sm:col-span-2 xl:col-span-3">
          Beschrijving <span className="font-normal">(optioneel)</span>
          <input type="text" name="description" defaultValue={item?.description ?? ''} placeholder="Bv. inclusief statief en kabel" className={inputClass} />
        </label>
      </div>
    </>
  );
}

function ItemCard({
  item,
  categories,
}: {
  item: UitleenItem;
  categories: UitleenCategory[];
}) {
  const [editing, setEditing] = useState(false);
  const categoryName = categories.find((category) => category.id === item.categoryId)?.name ?? 'Overig';
  const price = item.priceCents === 0 ? 'Gratis' : `€ ${(item.priceCents / 100).toFixed(2).replace('.', ',')}`;
  const deposit = item.depositCents === 0 ? 'Geen waarborg' : `€ ${(item.depositCents / 100).toFixed(2).replace('.', ',')} waarborg`;

  return (
    <li className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface">
      <div className="flex flex-wrap items-start gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-semibold text-vtk-ink">{item.name}</h3>
            <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-medium text-vtk-navy">{categoryName}</span>
          </div>
          {item.description ? <p className="mt-1 text-sm text-vtk-body">{item.description}</p> : null}
          <p className="mt-2 text-xs text-vtk-muted">{price} · {deposit}</p>
        </div>
        <div className="flex h-9 items-center gap-2 px-1 text-sm whitespace-nowrap text-vtk-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow-dark" aria-hidden />
          <span><strong className="text-vtk-ink">{item.quantity}</strong> in voorraad</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing((open) => !open)}
            className="w-8 !px-0"
            aria-expanded={editing}
            aria-label={editing ? 'Bewerken sluiten' : 'Item bewerken'}
            title={editing ? 'Bewerken sluiten' : 'Item bewerken'}
          >
            <LogisticsIcon name={editing ? 'close' : 'edit'} className="h-4 w-4" />
          </Button>
          <ConfirmActionButton
            label="Uit catalogus halen"
            successMessage="Item uit de catalogus gehaald."
            action={deactivateItemAction.bind(null, item.id)}
            destructive
            dialogTitle="Item uit de catalogus halen?"
            dialogDescription="Leden kunnen dit item niet meer aanvragen. Bestaande reservaties en de historiek blijven bewaard; je kan het item later terugzetten."
            icon={<LogisticsIcon name="hide" className="h-4 w-4" />}
          />
        </div>
      </div>

      {editing ? (
        <div className="border-t border-vtk-navy/10 bg-vtk-paper/55 px-5 py-5">
          <p className="mb-4 text-sm font-semibold text-vtk-ink">Item aanpassen</p>
          <SaveForm
            action={saveItemAction}
            submitLabel="Wijzigingen opslaan"
            savingLabel="Opslaan..."
            savedMessage="Item opgeslagen."
            errorMessages={ITEM_ERRORS}
            onSuccess={() => setEditing(false)}
            className="grid gap-4"
          >
            <ItemFields item={item} categories={categories} />
          </SaveForm>
        </div>
      ) : null}
    </li>
  );
}

export function InventoryManager({
  categories,
  items,
}: {
  categories: UitleenCategory[];
  items: UitleenItem[];
}) {
  const activeItems = items.filter((item) => item.active);
  const inactiveItems = items.filter((item) => !item.active);
  const activeCategories = categories.filter((category) => category.active);
  const inactiveCategories = categories.filter((category) => !category.active);
  const stockCount = activeItems.reduce((total, item) => total + item.quantity, 0);

  return (
    <div className="grid gap-8">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm text-vtk-muted"><span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />Catalogusbeheer</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">Inventaris</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-vtk-body">Beheer hier wat leden kunnen aanvragen. Voeg eerst een item toe, kies daarna de categorie, voorraad, huurprijs en waarborg.</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-vtk-navy/10 overflow-hidden rounded-[14px] border border-vtk-navy/10 text-center">
            <div className="px-3 py-2.5"><p className="text-lg font-semibold text-vtk-ink">{activeItems.length}</p><p className="text-[11px] text-vtk-muted">items</p></div>
            <div className="px-3 py-2.5"><p className="text-lg font-semibold text-vtk-ink">{stockCount}</p><p className="text-[11px] text-vtk-muted">stuks</p></div>
            <div className="px-3 py-2.5"><p className="text-lg font-semibold text-vtk-ink">{activeCategories.length}</p><p className="text-[11px] text-vtk-muted">categorieën</p></div>
          </div>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-vtk-ink">Items in de catalogus</h2>
              <p className="mt-1 text-sm text-vtk-muted">{activeItems.length === 1 ? '1 item zichtbaar voor leden.' : `${activeItems.length} items zichtbaar voor leden.`}</p>
            </div>
          </div>

          {activeItems.length === 0 ? (
            <p className="mt-4 rounded-[14px] border border-dashed border-vtk-navy/20 bg-vtk-surface px-4 py-4 text-sm text-vtk-muted">Er staan nog geen items in de catalogus. Voeg hieronder je eerste item toe.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {activeItems.map((item) => <ItemCard key={item.id} item={item} categories={categories} />)}
            </ul>
          )}

          <details className="mt-4 rounded-[16px] border border-dashed border-vtk-navy/25 bg-vtk-surface" open={activeItems.length === 0}>
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-vtk-ink [&::-webkit-details-marker]:hidden">
              <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-vtk-yellow text-base leading-none">+</span>
              Nieuw item toevoegen
            </summary>
            <div className="border-t border-vtk-navy/10 px-5 py-5">
              <p className="mb-4 text-sm text-vtk-muted">Dit item wordt meteen zichtbaar in de catalogus zodra je het opslaat.</p>
              <SaveForm action={saveItemAction} submitLabel="Item toevoegen" savingLabel="Toevoegen..." savedMessage="Item toegevoegd." errorMessages={ITEM_ERRORS} className="grid gap-4">
                <ItemFields categories={categories} />
              </SaveForm>
            </div>
          </details>

          {inactiveItems.length > 0 ? (
            <details className="mt-4 rounded-[16px] border border-vtk-navy/10 bg-vtk-paper/60">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-vtk-ink">Uit de catalogus ({inactiveItems.length})</summary>
              <ul className="grid gap-2 border-t border-vtk-navy/10 px-4 py-4">
                {inactiveItems.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-vtk-surface px-3 py-2.5 text-sm">
                    <span className="text-vtk-muted">{item.name}</span>
                    <ConfirmActionButton
                      label="Terug in catalogus zetten"
                      successMessage="Item terug in de catalogus gezet."
                      action={activateItemAction.bind(null, item.id)}
                      confirm={false}
                      icon={<LogisticsIcon name="show" className="h-4 w-4" />}
                    />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <aside className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 xl:sticky xl:top-6">
          <h2 className="text-xl font-semibold tracking-[-0.025em] text-vtk-ink">Categorieën</h2>
          <p className="mt-1 text-sm leading-6 text-vtk-muted">Gebruik categorieën om de catalogus overzichtelijk te houden voor leden.</p>
          <ul className="mt-5 grid gap-2">
            {activeCategories.map((category) => {
              const itemCount = activeItems.filter((item) => item.categoryId === category.id).length;
              return (
                <li key={category.id} className="rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/55">
                  <details>
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="font-semibold text-vtk-ink">{category.name}</span>
                      <span className="text-xs text-vtk-muted">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                    </summary>
                    <div className="border-t border-vtk-navy/10 px-3.5 py-3.5">
                      <SaveForm action={saveCategoryAction} submitLabel="Opslaan" savingLabel="Opslaan..." savedMessage="Categorie opgeslagen." errorMessages={CATEGORY_ERRORS} className="grid gap-3">
                        <input type="hidden" name="id" value={category.id} />
                        <label className="grid gap-1 text-xs font-medium text-vtk-muted">Naam<input type="text" name="name" defaultValue={category.name} className={inputClass} /></label>
                        <label className="grid gap-1 text-xs font-medium text-vtk-muted">Volgorde <input type="number" name="sortIndex" defaultValue={category.sortIndex} className={inputClass} /></label>
                      </SaveForm>
                      <div className="mt-3">
                        <ConfirmActionButton
                          label="Uit catalogus halen"
                          successMessage="Categorie uit de catalogus gehaald."
                          action={deactivateCategoryAction.bind(null, category.id)}
                          destructive
                          dialogTitle="Categorie uit de catalogus halen?"
                          dialogDescription="De categorie verdwijnt uit de catalogus; haar items blijven bestaan en verhuizen naar ‘Overig’. Bestaande reservaties veranderen niet."
                          icon={<LogisticsIcon name="hide" className="h-4 w-4" />}
                        />
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>

          <details className="mt-3 rounded-[14px] border border-dashed border-vtk-navy/25 p-3.5">
            <summary className="cursor-pointer text-sm font-semibold text-vtk-ink">+ Categorie toevoegen</summary>
            <SaveForm action={saveCategoryAction} submitLabel="Categorie toevoegen" savingLabel="Toevoegen..." savedMessage="Categorie toegevoegd." errorMessages={CATEGORY_ERRORS} className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">Naam<input type="text" name="name" placeholder="Bv. Gereedschap" className={inputClass} /></label>
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">Volgorde <input type="number" name="sortIndex" defaultValue={0} className={inputClass} /></label>
            </SaveForm>
          </details>

          {inactiveCategories.length > 0 ? <p className="mt-4 text-xs leading-5 text-vtk-muted">{inactiveCategories.length} {inactiveCategories.length === 1 ? 'categorie staat' : 'categorieën staan'} niet meer in de catalogus.</p> : null}
        </aside>
      </div>
    </div>
  );
}
