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
import { SetContents } from '@/components/set-contents';
import { AlternativesEditor } from '@/components/alternatives-editor';
import { DownloadsEditor, PhotosEditor, PropertiesEditor } from '@/components/catalogue-editors';
import { SaveForm } from '@/components/ui/save-form';
import { useToast } from '@/components/ui/toast';
import { SortHeader, compareText, useSort } from '@/app/beheer/sortable-header';
import { UnitsEditor } from './units-editor';
import { ITEM_CONDITION_LABELS } from '@/lib/uitleen';
import type { AdminInventoryItem } from '@/lib/uitleen-server';

type InventorySortKey = 'name' | 'category' | 'condition';
type InventoryPanel = 'item' | 'categories' | null;

const STALE_MESSAGE = 'Iemand anders paste dit net aan. Herlaad de pagina en probeer opnieuw.';
const CATEGORY_ERRORS = { NAME_REQUIRED: 'Geef de categorie een naam.', STALE: STALE_MESSAGE };
const ITEM_ERRORS = {
  NAME_REQUIRED: 'Geef het item een naam.',
  QUANTITY_INVALID: 'Het aantal moet minstens 1 zijn.',
  VOLUME_INVALID: 'Het volume moet een heel getal in liter zijn.',
  AMOUNT_INVALID: 'Prijs en waarborg moeten bedragen zijn, bv. 2,50.',
  UNIT_LABEL_REQUIRED: 'Geef elk exemplaar een naam, bv. "Box 3".',
  UNIT_LABEL_TOO_LONG: 'De naam van een exemplaar is te lang.',
  STALE: STALE_MESSAGE,
};

const CONDITIONS = Object.entries(ITEM_CONDITION_LABELS).map(([value, label]) => ({ value, label }));

const CONDITION_LABEL = ITEM_CONDITION_LABELS;

const inputClass = 'h-10 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

/**
 * Een veld dat de app zelf invult. Onderbroken rand, doffe vulling en een
 * niet-toegestane cursor: een gewoon ogend invoervak waar je niets in kan typen
 * leest als een kapot vak.
 */
const readOnlyInputClass =
  'h-10 min-w-0 cursor-not-allowed rounded-lg border border-dashed border-vtk-navy/20 bg-vtk-paper px-3 text-sm text-vtk-muted';

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

function ItemFields({
  item,
  categories,
  items,
}: {
  item?: AdminInventoryItem;
  categories: UitleenCategory[];
  /** Alle items, om alternatieven uit te kiezen. */
  items: AdminInventoryItem[];
}) {
  const [isSet, setIsSet] = useState(item?.isSet ?? false);
  const hasUnits = (item?.units.length ?? 0) > 0;
  return (
    <>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {item ? <input type="hidden" name="expectedUpdatedAt" value={item.updatedAt.toISOString()} /> : null}
      <div className="@container">
        <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-6">
          <div className="col-span-full grid gap-1 text-xs font-medium text-vtk-muted">
            Foto’s
            <PhotosEditor
              initial={[
                ...(item?.photoKey ? [{ key: item.photoKey }] : []),
                ...(item?.photos ?? []).map((photo) => ({ key: photo.key })),
              ]}
            />
          </div>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted @3xl:col-span-2">
            Naam
            <input type="text" name="name" defaultValue={item?.name ?? ''} className={inputClass} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted @3xl:col-span-2">
            Categorie
            <select name="categoryId" defaultValue={item?.categoryId ?? ''} className={inputClass}>
              <option value="">Overig</option>
              {categories
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Aantal
            {/* Houdt dit item exemplaren bij, dan is dit hun telling en niet iets
              om in te typen; de actie zet het toch terug. De uitleg staat in de
              tooltip en niet eronder: een regel tekst onder één veld van een
              rasterrij duwt dat veld uit de lijn met zijn buren. */}
            <input
              type="number"
              name="quantity"
              min={1}
              defaultValue={item?.quantity ?? 1}
              readOnly={hasUnits}
              title={hasUnits ? 'Volgt uit de exemplaren onderaan; pas die aan.' : undefined}
              className={hasUnits ? readOnlyInputClass : inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Huurprijs (€)
            <input
              type="text"
              name="price"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={item ? centsToEuroInput(item.priceCents) : ''}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Waarborg (€)
            <input
              type="text"
              name="deposit"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={item ? centsToEuroInput(item.depositCents) : ''}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Volume (liter)
            {/* Optioneel: enkel om per evenement de lading in te schatten (A8). Geen
              inventarisplicht; wat niet ingevuld is, telt daar als onbekend. */}
            <input
              type="number"
              name="volumeLiters"
              min={0}
              defaultValue={item?.volumeLiters ?? ''}
              placeholder="Optioneel"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Schap
            <input
              type="text"
              name="locationShelf"
              defaultValue={item?.locationShelf ?? ''}
              placeholder="Bv. 2R"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Rek
            <input
              type="text"
              name="locationRack"
              defaultValue={item?.locationRack ?? ''}
              placeholder="Bv. A1"
              className={inputClass}
            />
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
            <textarea
              name="description"
              defaultValue={item?.description ?? ''}
              placeholder="Bv. inclusief statief en kabel"
              rows={3}
              className="min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-sm text-vtk-ink"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted col-span-full">
            Notitie bij de staat <span className="font-normal">(optioneel)</span>
            <input type="text" name="conditionNote" defaultValue={item?.conditionNote ?? ''} className={inputClass} />
          </label>
        </div>
      </div>

      <div className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
        <div>
          <p className="text-sm font-medium text-vtk-ink">Alternatieven</p>
          <p className="mt-1 text-xs text-vtk-muted">
            Items die evengoed kunnen. Staat dit item op nul beschikbaar in de gevraagde periode, dan krijgt het lid ze
            te zien als suggestie; het blijft zijn keuze. De koppeling geldt in twee richtingen.
          </p>
        </div>
        <AlternativesEditor
          initial={(item?.alternatives ?? []).map((a) => a.alternativeId)}
          options={items.filter((other) => other.id !== item?.id).map((other) => ({ id: other.id, name: other.name }))}
        />
      </div>

      <div className="grid gap-4 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
        <div>
          <p className="text-sm font-medium text-vtk-ink">Eigenschappen</p>
          <p className="mt-1 text-xs text-vtk-muted">Technische kenmerken die leden op de detailpagina zien.</p>
        </div>
        <PropertiesEditor initial={item?.properties ?? []} />
        <div>
          <p className="text-sm font-medium text-vtk-ink">Downloads</p>
          <p className="mt-1 text-xs text-vtk-muted">Handleidingen of fiches in pdf-formaat.</p>
        </div>
        <DownloadsEditor initial={item?.downloads ?? []} />
      </div>

      <div className="rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-vtk-ink">
          <input
            type="checkbox"
            name="isSet"
            checked={isSet}
            onChange={(e) => setIsSet(e.target.checked)}
            className="h-4 w-4"
          />
          Dit is een set (fysiek samengesteld pakket)
        </label>
        {isSet ? (
          <div className="mt-3">
            <p className="mb-2 text-xs text-vtk-muted">
              Wat zit er in de set? De inhoud is beschrijvend en telt niet apart mee voor de voorraad.
            </p>
            <SetContentsEditor
              initial={(item?.setContents ?? []).map((c) => ({ label: c.label, quantity: c.quantity }))}
            />
          </div>
        ) : null}
      </div>

      {/* Als laatste blok, zodat de opslaan-knop van SaveForm er meteen onder
          staat: dat is de enige knop die de exemplaren bewaart. Enkel bij een
          bestaand item; iets opsplitsen dat nog niet bestaat, heeft geen zin. */}
      {item ? <UnitsEditor item={item} /> : null}
    </>
  );
}

function QuantityQuickEdit({
  itemId,
  quantity,
  locked = false,
}: {
  itemId: string;
  quantity: number;
  /** Item met exemplaren: de voorraad is hun telling, niet iets om in te typen. */
  locked?: boolean;
}) {
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

  if (locked) {
    return (
      <span
        className="inline-flex h-9 w-20 cursor-not-allowed items-center rounded-lg border border-dashed border-vtk-navy/20 bg-vtk-paper px-3 tabular-nums text-vtk-muted"
        title="Volgt uit de exemplaren; pas ze aan onder Bewerken."
      >
        {quantity}
      </span>
    );
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

/**
 * De itemtabel, voor zowel de catalogus als het archief. Eén component omdat een
 * gearchiveerd item dezelfde velden heeft en even goed fout kan staan: je wil het
 * kunnen corrigeren vóór je het terugzet, niet erna.
 */
function ItemTable({
  items,
  allItems,
  categories,
  categoryName,
  sort,
  editingId,
  onToggleEdit,
  archived = false,
}: {
  items: AdminInventoryItem[];
  /** De volledige inventaris, om alternatieven uit te kiezen. */
  allItems: AdminInventoryItem[];
  categories: UitleenCategory[];
  categoryName: (id: string | null) => string;
  sort: ReturnType<typeof useSort<InventorySortKey>>;
  editingId: string | null;
  onToggleEdit: (id: string | null) => void;
  archived?: boolean;
}) {
  return (
    <>
      {/* Kaartjesweergave: zichtbaar op mobile, verborgen op md+ */}
      <ul className="grid gap-3 md:hidden">
        {items.map((item) => {
          const editing = editingId === item.id;
          const location = [item.locationShelf, item.locationRack].filter(Boolean).join(' · ') || 'Niet ingesteld';
          const broken = item.units.filter((unit) => unit.condition === 'KAPOT').length;
          const conditionLabel =
            item.units.length > 0
              ? broken > 0
                ? `${broken} kapot van ${item.units.length}`
                : 'Per exemplaar'
              : (CONDITION_LABEL[item.condition] ?? item.condition);
          const conditionClass =
            item.units.length > 0
              ? broken > 0
                ? 'font-semibold text-red-700'
                : 'text-vtk-muted'
              : (CONDITION_TONE[item.condition] ?? 'text-vtk-muted');
          return (
            <Fragment key={item.id}>
              <li
                className={`rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-4 ${archived ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-vtk-ink">
                      {item.name}
                      {item.isSet ? (
                        <span className="ml-2 rounded-full bg-vtk-yellow/25 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                          Set
                        </span>
                      ) : null}
                      {archived ? (
                        <span className="ml-2 rounded-full bg-vtk-navy/10 px-2 py-0.5 text-[11px] font-semibold text-vtk-muted">
                          uit de catalogus
                        </span>
                      ) : null}
                    </p>
                    {item.description ? <p className="mt-0.5 text-xs text-vtk-muted">{item.description}</p> : null}
                    <SetContents contents={item.setContents} locale="nl" />
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <dt className="text-vtk-muted">Categorie</dt>
                        <dd className="text-vtk-body">{categoryName(item.categoryId)}</dd>
                      </div>
                      <div>
                        <dt className="text-vtk-muted">Staat</dt>
                        <dd className={conditionClass}>{conditionLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-vtk-muted">Locatie</dt>
                        <dd className="text-vtk-body">{location}</dd>
                      </div>
                      <div>
                        <dt className="text-vtk-muted">Voorraad</dt>
                        <dd className="mt-0.5">
                          <QuantityQuickEdit itemId={item.id} quantity={item.quantity} locked={item.units.length > 0} />
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleEdit(editing ? null : item.id)}
                    className="rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
                    aria-expanded={editing}
                  >
                    {editing ? 'Sluiten' : 'Bewerken'}
                  </button>
                  {archived ? (
                    <ConfirmActionButton
                      label="Terugzetten"
                      successMessage="Item terug in de catalogus gezet."
                      action={activateItemAction.bind(null, item.id)}
                      confirm={false}
                    />
                  ) : (
                    <ConfirmActionButton
                      label="Uit catalogus"
                      successMessage="Item uit de catalogus gehaald."
                      action={deactivateItemAction.bind(null, item.id)}
                      destructive
                      dialogTitle="Item uit de catalogus halen?"
                      dialogDescription="Leden kunnen dit item niet meer aanvragen. Bestaande reservaties en de historiek blijven bewaard; je kan het item later terugzetten."
                    />
                  )}
                </div>
                {editing ? (
                  <div className="mt-4 border-t border-vtk-navy/10 pt-4">
                    <p className="mb-4 text-sm font-semibold text-vtk-ink">Item aanpassen</p>
                    <SaveForm
                      action={saveItemAction}
                      submitLabel="Wijzigingen opslaan"
                      savingLabel="Opslaan..."
                      savedMessage="Item opgeslagen."
                      errorMessages={ITEM_ERRORS}
                      onSuccess={() => onToggleEdit(null)}
                      className="grid gap-4"
                    >
                      <ItemFields item={item} categories={categories} items={allItems} />
                    </SaveForm>
                  </div>
                ) : null}
              </li>
            </Fragment>
          );
        })}
      </ul>

      {/* Tabelweergave: verborgen op mobile, zichtbaar op md+ */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-vtk-navy/10 text-left text-xs text-vtk-muted">
              <SortHeader label="Item" sortKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
              <SortHeader
                label="Categorie"
                sortKey="category"
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
              />
              <SortHeader label="Staat" sortKey="condition" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
              <th className="py-2 pr-3 font-medium">Locatie</th>
              <th className="py-2 pr-3 font-medium">Voorraad</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const editing = editingId === item.id;
              const location = [item.locationShelf, item.locationRack].filter(Boolean).join(' · ') || 'Niet ingesteld';
              const broken = item.units.filter((unit) => unit.condition === 'KAPOT').length;
              return (
                <Fragment key={item.id}>
                  <tr className={`border-b border-vtk-navy/5 align-top ${archived ? 'opacity-70' : ''}`}>
                    <td className="py-2 pr-3 text-vtk-ink">
                      <span className="font-medium">{item.name}</span>
                      {item.isSet ? (
                        <span className="ml-2 rounded-full bg-vtk-yellow/25 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                          Set
                        </span>
                      ) : null}
                      {archived ? (
                        <span className="ml-2 rounded-full bg-vtk-navy/10 px-2 py-0.5 text-[11px] font-semibold text-vtk-muted">
                          uit de catalogus
                        </span>
                      ) : null}
                      {item.description ? <p className="text-xs text-vtk-muted">{item.description}</p> : null}
                      <SetContents contents={item.setContents} locale="nl" />
                    </td>
                    <td className="py-2 pr-3 text-vtk-muted">{categoryName(item.categoryId)}</td>
                    {item.units.length > 0 ? (
                      <td className={`py-2 pr-3 ${broken > 0 ? 'font-semibold text-red-700' : 'text-vtk-muted'}`}>
                        {broken > 0 ? `${broken} kapot van ${item.units.length}` : 'Per exemplaar'}
                      </td>
                    ) : (
                      <td className={`py-2 pr-3 ${CONDITION_TONE[item.condition] ?? 'text-vtk-muted'}`}>
                        {CONDITION_LABEL[item.condition] ?? item.condition}
                      </td>
                    )}
                    <td className="py-2 pr-3 text-vtk-muted">{location}</td>
                    <td className="py-2 pr-3">
                      <QuantityQuickEdit itemId={item.id} quantity={item.quantity} locked={item.units.length > 0} />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleEdit(editing ? null : item.id)}
                          className="rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
                          aria-expanded={editing}
                        >
                          {editing ? 'Sluiten' : 'Bewerken'}
                        </button>
                        {archived ? (
                          <ConfirmActionButton
                            label="Terugzetten"
                            successMessage="Item terug in de catalogus gezet."
                            action={activateItemAction.bind(null, item.id)}
                            confirm={false}
                          />
                        ) : (
                          <ConfirmActionButton
                            label="Uit catalogus"
                            successMessage="Item uit de catalogus gehaald."
                            action={deactivateItemAction.bind(null, item.id)}
                            destructive
                            dialogTitle="Item uit de catalogus halen?"
                            dialogDescription="Leden kunnen dit item niet meer aanvragen. Bestaande reservaties en de historiek blijven bewaard; je kan het item later terugzetten."
                          />
                        )}
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
                          onSuccess={() => onToggleEdit(null)}
                          className="grid gap-4"
                        >
                          <ItemFields item={item} categories={categories} items={allItems} />
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
    </>
  );
}

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
  const [openPanel, setOpenPanel] = useState<InventoryPanel>(null);
  const sort = useSort<InventorySortKey>('name');

  const activeCategories = categories.filter((c) => c.active);
  const inactiveCategories = categories.filter((c) => !c.active);
  const activeItems = items.filter((item) => item.active);
  const inactiveItems = items.filter((item) => !item.active);
  const stockCount = activeItems.reduce((total, item) => total + item.quantity, 0);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Overig';

  // Dezelfde filter en sortering voor de catalogus en het archief: een item dat
  // je zoekt, is soms net het item dat iemand uit de catalogus haalde, en dan
  // moet de zoekbalk daar ook iets doen.
  const { shown, shownInactive } = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const nameOf = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Overig';
    const apply = (list: AdminInventoryItem[]) =>
      list
        .filter((item) => activeCategory === 'all' || (item.categoryId ?? 'overig') === activeCategory)
        .filter(
          (item) =>
            !needle ||
            item.name.toLowerCase().includes(needle) ||
            (item.description ?? '').toLowerCase().includes(needle)
        )
        .sort((a, b) => {
          if (sort.key === 'category') return compareText(nameOf(a.categoryId), nameOf(b.categoryId), sort.dir);
          if (sort.key === 'condition') {
            return compareText(
              CONDITION_LABEL[a.condition] ?? a.condition,
              CONDITION_LABEL[b.condition] ?? b.condition,
              sort.dir
            );
          }
          return compareText(a.name, b.name, sort.dir);
        });
    return {
      shown: apply(items.filter((item) => item.active)),
      shownInactive: apply(items.filter((item) => !item.active)),
    };
  }, [items, categories, search, activeCategory, sort.key, sort.dir]);

  const filtersActive = search.trim() !== '' || activeCategory !== 'all';

  return (
    <div className="grid gap-8">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">Inventaris</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-vtk-body">
              Beheer hier wat leden kunnen aanvragen. Pas het aantal aan voor de voorraad; open "Bewerken" voor de
              volledige details.
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-vtk-navy/10 overflow-hidden rounded-[14px] border border-vtk-navy/10 text-center">
            <div className="px-3 py-2.5">
              <p className="text-lg font-semibold text-vtk-ink">{activeItems.length}</p>
              <p className="text-[11px] text-vtk-muted">items</p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-lg font-semibold text-vtk-ink">{stockCount}</p>
              <p className="text-[11px] text-vtk-muted">stuks</p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-lg font-semibold text-vtk-ink">{activeCategories.length}</p>
              <p className="text-[11px] text-vtk-muted">categorieën</p>
            </div>
          </div>
        </div>
      </section>

      {/* Eén expliciete bewerktaak tegelijk. Zo krijgt een lang itemformulier de
          volledige werkbreedte en blijft de catalogus erbuiten scanbaar. */}
      <section
        id="inventory-actions"
        className="overflow-hidden rounded-[18px] border border-vtk-navy/10 bg-vtk-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-semibold text-vtk-ink">Inventaris bijwerken</h3>
            <p className="mt-1 text-xs text-vtk-muted">Voeg een item toe of beheer de indeling van de catalogus.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-expanded={openPanel === 'item'}
              aria-controls="inventory-new-item-panel"
              onClick={() => setOpenPanel((current) => (current === 'item' ? null : 'item'))}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${openPanel === 'item' ? 'bg-vtk-navy text-white' : 'border border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40 hover:bg-vtk-paper'}`}
            >
              {openPanel === 'item' ? 'Formulier sluiten' : '+ Nieuw item'}
            </button>
            <button
              type="button"
              aria-expanded={openPanel === 'categories'}
              aria-controls="inventory-categories-panel"
              onClick={() => setOpenPanel((current) => (current === 'categories' ? null : 'categories'))}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${openPanel === 'categories' ? 'bg-vtk-navy text-white' : 'border border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40 hover:bg-vtk-paper'}`}
            >
              Categorieën
            </button>
          </div>
        </div>

        {openPanel === 'item' ? (
          <div id="inventory-new-item-panel" className="border-t border-vtk-navy/10 bg-vtk-paper/35 px-5 py-5 sm:px-6">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-vtk-ink">Nieuw item</h3>
              <p className="mt-1 text-sm text-vtk-muted">
                Vul de basisgegevens in. Extra details kunnen ook later nog.
              </p>
            </div>
            <SaveForm
              action={saveItemAction}
              submitLabel="Item toevoegen"
              savingLabel="Toevoegen..."
              savedMessage="Item toegevoegd."
              errorMessages={ITEM_ERRORS}
              onSuccess={() => setOpenPanel(null)}
              className="grid gap-4"
            >
              <ItemFields categories={categories} items={items} />
            </SaveForm>
          </div>
        ) : null}

        {openPanel === 'categories' ? (
          <div
            id="inventory-categories-panel"
            className="border-t border-vtk-navy/10 bg-vtk-paper/35 px-5 py-5 sm:px-6"
          >
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-vtk-ink">Categorieën</h3>
              <p className="mt-1 text-sm text-vtk-muted">Maak de catalogus herkenbaar en bepaal de volgorde.</p>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)] lg:items-start">
              <SaveForm
                action={saveCategoryAction}
                submitLabel="Categorie toevoegen"
                savingLabel="Toevoegen..."
                savedMessage="Categorie toegevoegd."
                errorMessages={CATEGORY_ERRORS}
                className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-4"
              >
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                  Nieuwe categorie
                  <input type="text" name="name" placeholder="Bv. Gereedschap" className={`${inputClass} w-full`} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                  Volgorde
                  <input type="number" name="sortIndex" defaultValue={0} className={`${inputClass} w-full`} />
                </label>
              </SaveForm>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-vtk-muted">
                  Bestaande categorieën
                </p>
                {activeCategories.length === 0 ? (
                  <p className="rounded-[12px] border border-dashed border-vtk-navy/20 bg-vtk-surface px-4 py-4 text-sm text-vtk-muted">
                    Er zijn nog geen categorieën.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {activeCategories.map((category) => (
                      <li key={category.id} className="rounded-[12px] border border-vtk-navy/10 bg-vtk-surface">
                        <details>
                          <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                            <span className="font-medium text-vtk-ink">{category.name}</span>
                            <span className="text-xs text-vtk-muted">
                              {activeItems.filter((item) => item.categoryId === category.id).length} items
                            </span>
                          </summary>
                          <div className="border-t border-vtk-navy/10 px-3 py-3">
                            <SaveForm
                              action={saveCategoryAction}
                              submitLabel="Opslaan"
                              savingLabel="Opslaan..."
                              savedMessage="Categorie opgeslagen."
                              errorMessages={CATEGORY_ERRORS}
                              className="grid gap-3"
                            >
                              <input type="hidden" name="id" value={category.id} />
                              <input type="hidden" name="expectedUpdatedAt" value={category.updatedAt.toISOString()} />
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-end">
                                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                                  Naam
                                  <input
                                    type="text"
                                    name="name"
                                    defaultValue={category.name}
                                    className={`${inputClass} w-full`}
                                  />
                                </label>
                                <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                                  Volgorde
                                  <input
                                    type="number"
                                    name="sortIndex"
                                    defaultValue={category.sortIndex}
                                    className={`${inputClass} w-full`}
                                  />
                                </label>
                              </div>
                            </SaveForm>
                            <div className="mt-2">
                              <ConfirmActionButton
                                label="Uit catalogus halen"
                                successMessage="Categorie uit de catalogus gehaald."
                                action={deactivateCategoryAction.bind(null, category.id)}
                                destructive
                                dialogTitle="Categorie uit de catalogus halen?"
                                dialogDescription="De categorie verdwijnt; haar items blijven bestaan en verhuizen naar ‘Overig’."
                              />
                            </div>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
                {inactiveCategories.length > 0 ? (
                  <p className="mt-3 text-xs text-vtk-muted">
                    {inactiveCategories.length} categorie(ën) niet meer in de catalogus.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Zoeken + filteren op categorie. */}
      {items.length > 0 ? (
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
          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setActiveCategory('all');
              }}
              className="h-10 rounded-lg border border-vtk-navy/15 px-3 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
            >
              Filters wissen
            </button>
          ) : null}
        </div>
      ) : null}

      <section>
        <h3 className="text-lg font-semibold tracking-tight text-vtk-ink">Items ({shown.length})</h3>
        {shown.length === 0 ? (
          activeItems.length === 0 && !filtersActive ? (
            <div className="mt-3 rounded-[16px] border border-dashed border-vtk-navy/20 bg-vtk-surface px-5 py-7 text-center">
              <p className="font-semibold text-vtk-ink">De catalogus is nog leeg</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-vtk-muted">
                Voeg eerst een item toe. Een categorie is optioneel en kan ook later ingesteld worden.
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpenPanel('item');
                  window.requestAnimationFrame(() => {
                    document
                      .getElementById('inventory-actions')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
                className="mt-4 rounded-full bg-vtk-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-vtk-ink"
              >
                Eerste item toevoegen
              </button>
            </div>
          ) : (
            <p className="mt-3 rounded-[14px] border border-dashed border-vtk-navy/20 bg-vtk-surface px-4 py-4 text-sm text-vtk-muted">
              Niets gevonden.
            </p>
          )
        ) : (
          <div className="mt-4">
            <ItemTable
              items={shown}
              allItems={items}
              categories={categories}
              categoryName={categoryName}
              sort={sort}
              editingId={editingId}
              onToggleEdit={setEditingId}
            />
          </div>
        )}
      </section>

      {inactiveItems.length > 0 ? (
        <details className="rounded-[16px] border border-vtk-navy/10 bg-vtk-paper/60">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-vtk-ink">
            {/* Het aantal treffers erbij, anders lijkt een zoekterm die enkel in
                het archief iets raakt op "niets gevonden". */}
            Uit de catalogus (
            {filtersActive ? `${shownInactive.length} van ${inactiveItems.length}` : inactiveItems.length})
          </summary>
          <div className="border-t border-vtk-navy/10 px-4 py-4">
            {shownInactive.length === 0 ? (
              <p className="text-sm text-vtk-muted">Geen gearchiveerd item voldoet aan je filters.</p>
            ) : (
              <ItemTable
                items={shownInactive}
                allItems={items}
                categories={categories}
                categoryName={categoryName}
                sort={sort}
                editingId={editingId}
                onToggleEdit={setEditingId}
                archived
              />
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}
