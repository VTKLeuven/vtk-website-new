'use client';

import { useState } from 'react';
import {
  deleteItemUnitAction,
  saveItemUnitAction,
  splitItemIntoUnitsAction,
} from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { SaveForm } from '@/components/ui/save-form';
import { ITEM_CONDITION_LABELS } from '@/lib/uitleen';
import type { AdminInventoryItem } from '@/lib/uitleen-server';

/**
 * De exemplaren van één item.
 *
 * Van vier frigo's kon er geen enkele als kapot gemarkeerd worden zonder ze alle
 * vier te markeren: `UitleenItem.condition` geldt voor de hele rij. Wie dat
 * onderscheid nodig heeft, splitst het item hier in exemplaren; wie het niet
 * nodig heeft, laat het staan en er verandert niets.
 *
 * Staat los van het item-formulier en niet erin: elk exemplaar bewaart apart, en
 * een formulier in een formulier bestaat niet in HTML.
 */
const CONDITIONS = Object.entries(ITEM_CONDITION_LABELS).map(([value, label]) => ({ value, label }));

const UNIT_ERRORS = {
  LABEL_REQUIRED: 'Geef het exemplaar een naam, bv. "Box 3".',
  LABEL_TOO_LONG: 'Die naam is te lang.',
};

const inputClass =
  'h-9 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

type Unit = AdminInventoryItem['units'][number];

function UnitRow({ unit, itemId }: { unit?: Unit; itemId: string }) {
  const broken = unit?.condition === 'KAPOT';
  return (
    <SaveForm
      action={saveItemUnitAction}
      submitLabel={unit ? 'Bewaren' : 'Toevoegen'}
      savingLabel="Opslaan..."
      savedMessage={unit ? 'Exemplaar opgeslagen.' : 'Exemplaar toegevoegd.'}
      errorMessages={UNIT_ERRORS}
      submitVariant={unit ? 'ghost' : 'secondary'}
      className={`grid items-end gap-2 rounded-[12px] px-2 py-2 sm:grid-cols-[7rem_9rem_minmax(0,1fr)_auto_auto_auto] ${
        broken ? 'bg-red-50' : ''
      }`}
    >
      {unit ? <input type="hidden" name="unitId" value={unit.id} /> : null}
      <input type="hidden" name="itemId" value={itemId} />

      <label className="grid gap-1 text-[11px] font-medium text-vtk-muted">
        Exemplaar
        <input
          type="text"
          name="label"
          defaultValue={unit?.label ?? ''}
          placeholder="Bv. Box 3"
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-[11px] font-medium text-vtk-muted">
        Staat
        <select name="condition" defaultValue={unit?.condition ?? 'WERKT'} className={inputClass}>
          {CONDITIONS.map((condition) => (
            <option key={condition.value} value={condition.value}>
              {condition.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[11px] font-medium text-vtk-muted">
        Notitie <span className="font-normal">(optioneel)</span>
        <input
          type="text"
          name="conditionNote"
          defaultValue={unit?.conditionNote ?? ''}
          placeholder="Bv. deur sluit niet"
          className={inputClass}
        />
      </label>
      <label className="flex h-9 items-center gap-2 text-xs font-medium text-vtk-ink">
        <input
          type="checkbox"
          name="active"
          defaultChecked={unit?.active ?? true}
          className="h-4 w-4"
        />
        In roulatie
      </label>
    </SaveForm>
  );
}

export function UnitsEditor({ item }: { item: AdminInventoryItem }) {
  const [adding, setAdding] = useState(false);
  const units = item.units;
  const usable = units.filter((unit) => unit.active && unit.condition !== 'KAPOT').length;

  return (
    <div className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-vtk-ink">Exemplaren</p>
          <p className="mt-1 text-xs text-vtk-muted">
            {units.length === 0
              ? 'De staat geldt nu voor alle stuks samen. Splits het item op wanneer één stuk kapot kan zijn terwijl de rest werkt.'
              : 'De voorraad volgt hieruit: alles wat in roulatie is en niet kapot. Reserveren gebeurt op het item, niet op een exemplaar.'}
          </p>
        </div>
        {units.length > 0 ? (
          <p className="text-sm tabular-nums text-vtk-ink">
            <span className="font-semibold">{usable}</span> bruikbaar van {units.length}
          </p>
        ) : null}
      </div>

      {units.length === 0 ? (
        <div>
          <ConfirmActionButton
            label={`Opsplitsen in ${item.quantity} exemplaren`}
            variant="secondary"
            successMessage="Exemplaren aangemaakt."
            action={splitItemIntoUnitsAction.bind(null, item.id)}
            confirm={false}
          />
          <p className="mt-2 text-xs text-vtk-muted">
            Maakt {item.quantity} exemplaren met de huidige staat, genummerd 1 tot {item.quantity}.
            Hernoem ze daarna naar wat er op de kast staat.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-1">
            {units.map((unit) => (
              <div
                key={unit.id}
                className="flex flex-wrap items-end gap-2 border-b border-vtk-navy/5 pb-1 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <UnitRow unit={unit} itemId={item.id} />
                </div>
                <div className="pb-2">
                  <ConfirmActionButton
                    label={`Verwijderen: ${unit.label}`}
                    confirmLabel="Verwijderen"
                    icon={<LogisticsIcon name="close" className="h-4 w-4" />}
                    action={deleteItemUnitAction.bind(null, unit.id)}
                    successMessage="Exemplaar verwijderd."
                    destructive
                    dialogTitle="Exemplaar verwijderen?"
                    dialogDescription={`"${unit.label}" verdwijnt uit de lijst en de voorraad zakt met één als het exemplaar meetelde. Bestaat het nog maar staat het uit de loods, zet het dan liever op "niet in roulatie": dan blijft het zichtbaar.`}
                  />
                </div>
              </div>
            ))}
          </div>

          {adding ? (
            <UnitRow itemId={item.id} />
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
              >
                Exemplaar toevoegen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
