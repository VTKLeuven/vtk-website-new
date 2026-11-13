'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ConfirmDialog } from '@vtk/ui';
import { IconButton } from '@/components/ui/IconButton';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';
import {
  costAmount,
  distributionOf,
  incomeAmount,
  incomeCount,
  incomePrice,
  locationOf,
  priceOf,
  restShare,
  rowPct,
  sectionAmount,
  sectionResult,
  unitsOf,
} from '@/lib/bo/budget/calc';
import { setFx } from '@/lib/bo/budget/formula';
import type { CostRow, CostSection, IncomeRow, IncomeSection, Section } from '@/lib/bo/budget/types';
import type { EditorApi } from './editorApi';
import { money, percent, plain } from './format';
import { NumberField } from './NumberField';

/*
 * Eén sectie van het budget als tabel om in te typen, zoals een blad: naam,
 * aantal en prijs staan meteen in de cel, het bedrag rekent de site. Enter
 * springt naar dezelfde kolom op de volgende regel. Bron, BTW, Flesserke en
 * opmerking staan in het paneel achter het potlood: die hoeven niet bij elke
 * regel in beeld.
 */

const TYPE_LABEL = {
  nl: { fixed: 'Vaste kosten', variable: 'Variabele kosten', income: 'Inkomsten' },
  en: { fixed: 'Fixed costs', variable: 'Variable costs', income: 'Income' },
};

function StatusDot({ api, rowId, name }: { api: EditorApi; rowId: string; name: string }) {
  const checks = api.checksByRow.get(rowId) ?? [];
  const block = checks.find((c) => c.level === 'block');
  const review = checks.find((c) => c.level === 'review');
  const check = block ?? review;
  if (!check) return <span className="vtk-bud-dot" aria-hidden="true" />;
  return (
    <button
      type="button"
      className="vtk-bud-dot"
      data-level={check.level}
      title={check.text}
      aria-label={`${api.nl ? (block ? 'Nog te doen' : 'Voor de GM') : block ? 'To do' : 'For review'}: ${name}. ${check.text}`}
      onClick={(event) => api.openRow(rowId, event.currentTarget)}
    />
  );
}

/** Enter springt naar dezelfde kolom op de volgende regel, zoals in een rekenblad. */
function onEnterMovesDown(event: KeyboardEvent<HTMLTableElement>) {
  if (event.key !== 'Enter' || event.shiftKey) return;
  const target = event.target as HTMLElement;
  const col = target.dataset.col;
  if (!col) return;
  const cells = [...event.currentTarget.querySelectorAll<HTMLInputElement>(`[data-col="${col}"]`)].filter(
    (el) => !el.disabled
  );
  const next = cells[cells.indexOf(target as HTMLInputElement) + 1];
  event.preventDefault();
  if (next) {
    next.focus();
    next.select();
  } else (target as HTMLInputElement).blur();
}

/** Een net toegevoegde regel krijgt de focus op haar naam. */
function useFocusNewRow(api: EditorApi, ids: string[], table: RefObject<HTMLTableElement | null>) {
  const { focusRowId, clearFocusRow } = api;
  const has = focusRowId !== null && ids.includes(focusRowId);
  useEffect(() => {
    if (!has || !focusRowId) return;
    const el = table.current?.querySelector<HTMLInputElement>(`[data-row="${focusRowId}"][data-col="name"]`);
    if (el) {
      el.focus();
      el.select();
    }
    clearFocusRow();
  }, [has, focusRowId, clearFocusRow, table]);
}

/* ------------------------------------------------------------------ Kosten */

function CostTable({ api, section }: { api: EditorApi; section: CostSection }) {
  const { nl, content, ctx } = api;
  const variable = section.type === 'variable';
  const distribute = variable && !!section.distribute;
  const tableRef = useRef<HTMLTableElement>(null);
  useFocusNewRow(
    api,
    section.rows.map((r) => r.id),
    tableRef
  );
  const location = locationOf(content, ctx);
  const update = (rowId: string, change: (row: CostRow) => void) =>
    api.mutate((draft) => {
      const s = draft.sections.find((x) => x.id === section.id);
      if (!s || s.type === 'income') return;
      const row = s.rows.find((r) => r.id === rowId);
      if (row) change(row);
    });
  /** Een cel die ook een berekening aanneemt ("=2,79/4"). */
  const fx = (row: CostRow, key: 'qty' | 'pct' | 'perPerson' | 'perUnit' | 'price') => ({
    formula: row.fx?.[key],
    onFormula: (formula: string | null) => update(row.id, (r) => setFx(r, key, formula)),
  });
  const resultCell = (row: CostRow) =>
    api.resultOn ? (
      <td className="num vtk-bud-col-res" data-label={nl ? 'Resultaat' : 'Result'}>
        <NumberField
          className="vtk-bud-bare vtk-bud-cell num"
          value={row.result ?? null}
          decimals={2}
          allowEmpty
          placeholder="–"
          data-col="result"
          aria-label={nl ? `Resultaat van ${row.name || 'deze regel'}` : `Result of ${row.name || 'this row'}`}
          onValue={(v) => update(row.id, (r) => (r.result = v))}
        />
      </td>
    ) : null;

  return (
    <div className="vtk-bud-tablewrap">
      <table
        className="vtk-bud-table"
        ref={tableRef}
        onKeyDown={onEnterMovesDown}
        data-result={api.resultOn ? '1' : undefined}
      >
        <thead>
          <tr>
            <th className="vtk-bud-col-name">{nl ? 'Omschrijving' : 'Description'}</th>
            {variable ? (
              <>
                {distribute && <th className="num">{nl ? 'Deel' : 'Share'}</th>}
                <th className="num">{nl ? 'Per pers.' : 'Per pers.'}</th>
                <th className="num">{nl ? 'Per eenh.' : 'Per unit'}</th>
                <th className="num">{nl ? 'Eenh.' : 'Units'}</th>
              </>
            ) : (
              <th className="num">{nl ? 'Aantal' : 'Qty'}</th>
            )}
            <th className="num">{nl ? 'Prijs' : 'Price'}</th>
            <th className="num">{nl ? 'Bedrag' : 'Amount'}</th>
            {api.resultOn && <th className="num vtk-bud-col-res">{nl ? 'Resultaat' : 'Result'}</th>}
            <th className="vtk-bud-col-act">
              <span className="sr-only">{nl ? 'Status en details' : 'Status and details'}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => {
            const amount = costAmount(content, ctx, section, row);
            const fromLocation = row.source?.type === 'locatie' && row.override == null;
            const partner = row.mixOf ? section.rows.find((r) => r.id === row.mixOf) : null;
            const name = (
              <td className="vtk-bud-col-name">
                <input
                  className="vtk-bud-bare vtk-bud-cell"
                  value={row.name}
                  data-col="name"
                  data-row={row.id}
                  aria-label={nl ? 'Omschrijving' : 'Description'}
                  placeholder={nl ? 'Wat koop je?' : 'What are you buying?'}
                  onChange={(e) => update(row.id, (r) => (r.name = e.target.value))}
                />
              </td>
            );
            const actions = (
              <td className="vtk-bud-col-act">
                <span className="vtk-bud-act">
                  <StatusDot api={api} rowId={row.id} name={row.name} />
                  <IconButton
                    label={nl ? 'Bron, BTW en meer' : 'Source, VAT and more'}
                    srLabel={`${nl ? 'Details' : 'Details'}: ${row.name || (nl ? 'regel' : 'row')}`}
                    className="vtk-bud-more"
                    onClick={(e) => api.openRow(row.id, e.currentTarget)}
                  >
                    <PencilIcon />
                  </IconButton>
                </span>
              </td>
            );
            if (row.rest) {
              return (
                <tr key={row.id} data-kind="rest">
                  {name}
                  <td className="num vtk-bud-muted vtk-bud-span" colSpan={distribute ? 6 : 5}>
                    {nl
                      ? `de rest: ${percent(rowPct(section, row))}, geen aankoop`
                      : `the rest: ${percent(rowPct(section, row), false)}, nothing bought`}
                  </td>
                  {api.resultOn && <td />}
                  {actions}
                </tr>
              );
            }
            if (row.forfait) {
              return (
                <tr key={row.id} data-kind="forfait">
                  {name}
                  <td className="vtk-bud-muted vtk-bud-span" colSpan={variable ? (distribute ? 5 : 4) : 2}>
                    {nl ? 'Bedrag zonder berekening' : 'Amount without a calculation'}
                  </td>
                  <td className="num" data-label={nl ? 'Bedrag' : 'Amount'}>
                    <NumberField
                      className="vtk-bud-bare vtk-bud-cell num"
                      value={row.forfait.amount}
                      decimals={2}
                      data-col="amount"
                      aria-label={nl ? 'Bedrag' : 'Amount'}
                      onValue={(v) => update(row.id, (r) => r.forfait && (r.forfait.amount = v ?? 0))}
                    />
                  </td>
                  {resultCell(row)}
                  {actions}
                </tr>
              );
            }
            return (
              <tr key={row.id}>
                {name}
                {variable ? (
                  <>
                    {distribute && (
                      <td className="num" data-label={nl ? 'Deel' : 'Share'}>
                        {partner ? (
                          <span
                            className="vtk-bud-muted"
                            title={
                              nl ? `Deelt het percentage van ${partner.name}` : `Shares the share of ${partner.name}`
                            }
                          >
                            = {partner.name || '…'}
                          </span>
                        ) : (
                          <NumberField
                            className="vtk-bud-bare vtk-bud-cell num"
                            value={row.pct ?? 0}
                            percent
                            data-col="pct"
                            {...fx(row, 'pct')}
                            aria-label={nl ? 'Deel van de verdeling, in procent' : 'Share of the split, in percent'}
                            onValue={(v) => update(row.id, (r) => (r.pct = v ?? 0))}
                          />
                        )}
                      </td>
                    )}
                    <td className="num" data-label={nl ? 'Per pers.' : 'Per pers.'}>
                      <NumberField
                        className="vtk-bud-bare vtk-bud-cell num"
                        value={row.perPerson}
                        allowEmpty
                        placeholder={plain(section.perPerson ?? 1, nl)}
                        data-col="perPerson"
                        {...fx(row, 'perPerson')}
                        aria-label={nl ? 'Hoeveel per persoon' : 'How much per person'}
                        onValue={(v) => update(row.id, (r) => (v == null ? delete r.perPerson : (r.perPerson = v)))}
                      />
                    </td>
                    <td className="num" data-label={nl ? 'Per eenh.' : 'Per unit'}>
                      <NumberField
                        className="vtk-bud-bare vtk-bud-cell num"
                        value={row.perUnit}
                        data-col="perUnit"
                        {...fx(row, 'perUnit')}
                        aria-label={nl ? 'Hoeveel in één eenheid' : 'How much in one unit'}
                        onValue={(v) => update(row.id, (r) => (r.perUnit = v ?? 0))}
                      />
                    </td>
                    <td className="num" data-label={nl ? 'Eenheden' : 'Units'}>
                      <span className="vtk-bud-calc" title={nl ? 'Naar boven afgerond' : 'Rounded up'}>
                        {unitsOf(content, section, row)}
                        {row.unit ? <span className="vtk-bud-unit"> {row.unit}</span> : null}
                      </span>
                    </td>
                  </>
                ) : (
                  <td
                    className="num"
                    data-label={row.service ? (nl ? 'Bestellingen' : 'Orders') : nl ? 'Aantal' : 'Qty'}
                  >
                    <NumberField
                      className="vtk-bud-bare vtk-bud-cell num"
                      value={row.qty ?? 0}
                      data-col="qty"
                      {...fx(row, 'qty')}
                      aria-label={
                        row.service ? (nl ? 'Aantal bestellingen' : 'Number of orders') : nl ? 'Aantal' : 'Quantity'
                      }
                      onValue={(v) => update(row.id, (r) => (r.qty = v ?? 0))}
                    />
                  </td>
                )}
                <td className="num" data-label={nl ? 'Prijs' : 'Price'}>
                  {row.service || fromLocation ? (
                    <span
                      className="vtk-bud-calc vtk-bud-from"
                      title={
                        row.service
                          ? nl
                            ? 'Collect&Go-servicekost uit de instellingen'
                            : 'Collect&Go service cost from the settings'
                          : nl
                            ? `Uit de locatie ${location?.name ?? '(nog niet gekozen)'}`
                            : `From the venue ${location?.name ?? '(not chosen yet)'}`
                      }
                    >
                      {money(priceOf(content, ctx, row), nl)}
                    </span>
                  ) : (
                    <NumberField
                      className="vtk-bud-bare vtk-bud-cell num"
                      value={row.override ?? row.price ?? 0}
                      decimals={2}
                      data-col="price"
                      {...fx(row, 'price')}
                      aria-label={nl ? 'Prijs' : 'Price'}
                      onValue={(v) =>
                        update(row.id, (r) => {
                          if (r.override != null) r.override = v ?? 0;
                          else r.price = v ?? 0;
                        })
                      }
                    />
                  )}
                </td>
                <td className="num vtk-bud-amount" data-label={nl ? 'Bedrag' : 'Amount'}>
                  {money(amount, nl)}
                </td>
                {resultCell(row)}
                {actions}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- Inkomsten */

function IncomeTable({ api, section }: { api: EditorApi; section: IncomeSection }) {
  const { nl, content } = api;
  const tableRef = useRef<HTMLTableElement>(null);
  useFocusNewRow(
    api,
    section.rows.map((r) => r.id),
    tableRef
  );
  const update = (rowId: string, change: (row: IncomeRow) => void) =>
    api.mutate((draft) => {
      const s = draft.sections.find((x) => x.id === section.id);
      if (!s || s.type !== 'income') return;
      const row = s.rows.find((r) => r.id === rowId);
      if (row) change(row);
    });
  return (
    <div className="vtk-bud-tablewrap">
      <table className="vtk-bud-table" ref={tableRef} onKeyDown={onEnterMovesDown}>
        <thead>
          <tr>
            <th className="vtk-bud-col-name">{nl ? 'Omschrijving' : 'Description'}</th>
            <th className="num">{nl ? 'Aantal' : 'Qty'}</th>
            <th className="num">{nl ? 'Prijs' : 'Price'}</th>
            <th className="num">{nl ? 'Bedrag' : 'Amount'}</th>
            {api.resultOn && <th className="num vtk-bud-col-res">{nl ? 'Resultaat' : 'Result'}</th>}
            <th className="vtk-bud-col-act">
              <span className="sr-only">{nl ? 'Details' : 'Details'}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => {
            const count = incomeCount(content, row);
            const price = incomePrice(content, row);
            return (
              <tr key={row.id}>
                <td className="vtk-bud-col-name">
                  <input
                    className="vtk-bud-bare vtk-bud-cell"
                    value={row.name}
                    data-col="name"
                    data-row={row.id}
                    aria-label={nl ? 'Omschrijving' : 'Description'}
                    placeholder={nl ? 'Van wie of waarvoor?' : 'From whom or for what?'}
                    onChange={(e) => update(row.id, (r) => (r.name = e.target.value))}
                  />
                </td>
                <td className="num" data-label={nl ? 'Aantal' : 'Qty'}>
                  {row.count.type === 'manual' ? (
                    <NumberField
                      className="vtk-bud-bare vtk-bud-cell num"
                      value={row.count.qty}
                      data-col="qty"
                      formula={row.fx?.qty}
                      onFormula={(f) => update(row.id, (r) => setFx(r, 'qty', f))}
                      aria-label={nl ? 'Aantal' : 'Quantity'}
                      onValue={(v) => update(row.id, (r) => r.count.type === 'manual' && (r.count.qty = v ?? 0))}
                    />
                  ) : (
                    <span
                      className="vtk-bud-calc"
                      title={
                        nl ? 'Berekend uit de deelnemers of de drank' : 'Calculated from the participants or the drinks'
                      }
                    >
                      {count}
                    </span>
                  )}
                </td>
                <td className="num" data-label={nl ? 'Prijs' : 'Price'}>
                  {row.price.type === 'manual' ? (
                    <NumberField
                      className="vtk-bud-bare vtk-bud-cell num"
                      value={row.price.value}
                      decimals={2}
                      data-col="price"
                      formula={row.fx?.price}
                      onFormula={(f) => update(row.id, (r) => setFx(r, 'price', f))}
                      aria-label={nl ? 'Prijs' : 'Price'}
                      onValue={(v) => update(row.id, (r) => r.price.type === 'manual' && (r.price.value = v ?? 0))}
                    />
                  ) : (
                    <span
                      className="vtk-bud-calc"
                      title={
                        nl
                          ? `${money(row.price.main)} voor wie bier of sangria drinkt, ${money(row.price.rest)} voor de rest (${percent(restShare(content, row.price.sectionId))})`
                          : `${money(row.price.main, false)} for beer or sangria, ${money(row.price.rest, false)} for the rest`
                      }
                    >
                      {money(price, nl)}
                    </span>
                  )}
                </td>
                <td className="num vtk-bud-amount" data-label={nl ? 'Bedrag' : 'Amount'}>
                  {money(incomeAmount(content, row), nl)}
                </td>
                {api.resultOn && (
                  <td className="num vtk-bud-col-res" data-label={nl ? 'Resultaat' : 'Result'}>
                    <NumberField
                      className="vtk-bud-bare vtk-bud-cell num"
                      value={row.result ?? null}
                      decimals={2}
                      allowEmpty
                      placeholder="–"
                      data-col="result"
                      aria-label={
                        nl ? `Resultaat van ${row.name || 'deze regel'}` : `Result of ${row.name || 'this row'}`
                      }
                      onValue={(v) => update(row.id, (r) => (r.result = v))}
                    />
                  </td>
                )}
                <td className="vtk-bud-col-act">
                  <span className="vtk-bud-act">
                    <span className="vtk-bud-dot" aria-hidden="true" />
                    <IconButton
                      label={nl ? 'Aantal, prijs en meer' : 'Quantity, price and more'}
                      srLabel={`${nl ? 'Details' : 'Details'}: ${row.name || (nl ? 'regel' : 'row')}`}
                      className="vtk-bud-more"
                      onClick={(e) => api.openRow(row.id, e.currentTarget)}
                    >
                      <PencilIcon />
                    </IconButton>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- Verdeling */

function DistributionBar({ api, section }: { api: EditorApi; section: CostSection }) {
  const { nl } = api;
  const d = distributionOf(section);
  if (section.rows.length === 0) return null;
  const segments = [
    ...d.parts.map((p) => ({
      key: p.rowId,
      label: p.mixWith.length ? `${p.name} + ${p.mixWith.join(' + ')}` : p.name,
      pct: Math.max(0, p.pct),
      rest: false,
    })),
    ...(d.restRow && d.rest > 0 ? [{ key: d.restRow.id, label: d.restRow.name, pct: d.rest, rest: true }] : []),
  ];
  const total = Math.max(1, d.sum + (d.restRow ? d.rest : 0));
  return (
    <div className="vtk-bud-split" data-ok={d.ok ? '1' : '0'}>
      <div className="vtk-bud-split-bar" aria-hidden="true">
        {segments.map((s, i) => (
          <span
            key={s.key}
            data-rest={s.rest ? '1' : undefined}
            data-alt={i % 2 ? '1' : undefined}
            style={{ flexGrow: s.pct / total }}
            title={`${s.label} ${percent(s.pct, nl)}`}
          >
            {s.pct / total > 0.12 ? s.label : ''}
          </span>
        ))}
        {!d.restRow && d.sum < 1 - 1e-9 && <span data-gap="1" style={{ flexGrow: (1 - d.sum) / total }} />}
      </div>
      <p className={`vtk-bud-split-text ${d.ok ? '' : 'text-vtk-danger'}`}>
        {d.restRow
          ? d.ok
            ? nl
              ? `Samen ${percent(d.sum)}; ${d.restRow.name.replace(/\s*\(de rest\)\s*/i, '')} krijgt de rest (${percent(d.rest)}).`
              : `Together ${percent(d.sum, false)}; ${d.restRow.name} gets the rest (${percent(d.rest, false)}).`
            : nl
              ? `Samen ${percent(d.sum)}: dat is meer dan 100 %, dus er blijft niets over voor ${d.restRow.name}.`
              : `Together ${percent(d.sum, false)}: more than 100 %, nothing left for ${d.restRow.name}.`
          : d.ok
            ? nl
              ? 'Samen 100 %.'
              : 'Together 100 %.'
            : nl
              ? `Samen ${percent(d.sum)}. Dat moet 100 % zijn, of geef één regel de rest.`
              : `Together ${percent(d.sum, false)}. That must be 100 %, or give one row the rest.`}
        {d.parts.some((p) => p.mixWith.length > 0) && (nl ? ' Een mix telt één keer.' : ' A mix counts once.')}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- Kaart */

export function SectionCard({ api, section, onDelete }: { api: EditorApi; section: Section; onDelete: () => void }) {
  const { nl, content, ctx, readOnly } = api;
  const [confirming, setConfirming] = useState(false);
  const amount = sectionAmount(content, ctx, section);
  const variable = section.type === 'variable';
  const rename = (name: string) =>
    api.mutate((draft) => {
      const s = draft.sections.find((x) => x.id === section.id);
      if (s) s.name = name;
    });
  const setCost = (change: (s: CostSection) => void) =>
    api.mutate((draft) => {
      const s = draft.sections.find((x) => x.id === section.id);
      if (s && s.type !== 'income') change(s);
    });
  const persons = content.params.persons || 0;

  return (
    <section className="vtk-bud-card vtk-bud-sec" id={`bud-sec-${section.id}`} aria-label={section.name}>
      <header className="vtk-bud-sec-head">
        <div className="vtk-bud-sec-title">
          <input
            className="vtk-bud-bare vtk-bud-sec-name"
            value={section.name}
            aria-label={nl ? 'Naam van de sectie' : 'Section name'}
            placeholder={nl ? 'Naam van de sectie' : 'Section name'}
            onChange={(e) => rename(e.target.value)}
          />
          <span className="vtk-bud-sec-type">{TYPE_LABEL[nl ? 'nl' : 'en'][section.type]}</span>
        </div>
        <div className="vtk-bud-sec-right">
          <span className="vtk-bud-sec-amount">
            {money(amount, nl)}
            {api.resultOn && (
              <span className="vtk-bud-sec-res" title={nl ? 'Resultaat' : 'Result'}>
                {nl ? 'resultaat' : 'result'} {money(sectionResult(section), nl)}
              </span>
            )}
          </span>
          {!readOnly && (
            <IconButton
              label={nl ? 'Sectie verwijderen' : 'Delete section'}
              srLabel={`${nl ? 'Sectie verwijderen' : 'Delete section'}: ${section.name}`}
              onClick={() => setConfirming(true)}
            >
              <TrashIcon />
            </IconButton>
          )}
        </div>
      </header>

      {variable && (
        <div className="vtk-bud-sec-opts">
          <label>
            <span>{nl ? 'Geldt voor' : 'Applies to'}</span>
            <NumberField
              className="vtk-bud-mini num"
              value={section.share ?? 1}
              percent
              aria-label={nl ? 'Deel van de deelnemers, in procent' : 'Share of the participants, in percent'}
              onValue={(v) => setCost((s) => (s.share = v ?? 1))}
            />
            <span>{nl ? '% van' : '% of'}</span>
            <NumberField
              className="vtk-bud-mini num"
              value={section.base ?? null}
              allowEmpty
              placeholder={String(persons)}
              formula={section.fx?.base}
              onFormula={(f) => setCost((s) => setFx(s, 'base', f))}
              aria-label={
                nl
                  ? 'Voor hoeveel personen deze sectie rekent; leeg is alle deelnemers'
                  : 'How many people this section counts; empty means all participants'
              }
              onValue={(v) => setCost((s) => (v == null ? delete s.base : (s.base = v)))}
            />
            <span>
              {section.base == null
                ? nl
                  ? 'personen (alle deelnemers)'
                  : 'people (all participants)'
                : nl
                  ? `personen, in plaats van de ${persons} deelnemers`
                  : `people, instead of the ${persons} participants`}
            </span>
          </label>
          <label>
            <NumberField
              className="vtk-bud-mini num"
              value={section.perPerson ?? 1}
              aria-label={nl ? 'Hoeveel per persoon' : 'How much per person'}
              onValue={(v) => setCost((s) => (s.perPerson = v ?? 1))}
            />
            <span>
              {nl ? 'per persoon, tenzij een regel iets anders zegt' : 'per person, unless a row says otherwise'}
            </span>
          </label>
          <label className="vtk-bud-check">
            <input
              type="checkbox"
              checked={!!section.distribute}
              onChange={(e) => setCost((s) => (s.distribute = e.target.checked))}
            />
            <span>{nl ? 'De regels verdelen samen 100 %' : 'The rows split 100 % between them'}</span>
          </label>
        </div>
      )}
      {variable && section.distribute && <DistributionBar api={api} section={section} />}

      {section.rows.length === 0 ? (
        <p className="vtk-bud-empty">
          {section.type === 'income'
            ? nl
              ? 'Nog geen inkomsten. Verkoop je tickets, drank of eten, of komt er sponsoring?'
              : 'No income yet. Are you selling tickets, drinks or food, or is there sponsoring?'
            : nl
              ? 'Nog geen regels in deze sectie.'
              : 'No rows in this section yet.'}
        </p>
      ) : section.type === 'income' ? (
        <IncomeTable api={api} section={section} />
      ) : (
        <CostTable api={api} section={section} />
      )}

      {!readOnly && (
        <footer className="vtk-bud-sec-foot">
          <button
            type="button"
            className="vtk-bud-add"
            aria-label={nl ? `Regel toevoegen aan ${section.name}` : `Add a row to ${section.name}`}
            onClick={() => api.addRow(section.id)}
          >
            <PlusIcon /> {nl ? 'Regel' : 'Row'}
          </button>
          {section.type !== 'income' && (
            <button
              type="button"
              className="vtk-bud-add"
              aria-label={
                nl
                  ? `Bedrag zonder berekening toevoegen aan ${section.name}`
                  : `Add an amount without a calculation to ${section.name}`
              }
              onClick={() => api.addRow(section.id, 'forfait')}
            >
              <PlusIcon /> {nl ? 'Bedrag zonder berekening' : 'Amount without a calculation'}
            </button>
          )}
          {variable && section.distribute && !section.rows.some((r) => r.rest) && (
            <button
              type="button"
              className="vtk-bud-add"
              aria-label={
                nl ? `Regel voor de rest toevoegen aan ${section.name}` : `Add a row for the rest to ${section.name}`
              }
              onClick={() => api.addRow(section.id, 'rest')}
            >
              <PlusIcon /> {nl ? 'Regel voor de rest' : 'Row for the rest'}
            </button>
          )}
        </footer>
      )}

      <ConfirmDialog
        open={confirming}
        title={
          nl
            ? `Sectie "${section.name || 'zonder naam'}" verwijderen?`
            : `Delete section "${section.name || 'without a name'}"?`
        }
        description={
          nl
            ? `${section.rows.length === 1 ? 'De ene regel' : `De ${section.rows.length} regels`} (samen ${money(amount)}) verdwijnen uit dit budget. De andere secties blijven staan.`
            : `${section.rows.length === 1 ? 'Its one row' : `Its ${section.rows.length} rows`} (${money(amount, false)} together) disappear from this budget. The other sections stay.`
        }
        confirmLabel={nl ? 'Sectie verwijderen' : 'Delete section'}
        cancelLabel={nl ? 'Annuleren' : 'Cancel'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
      />
    </section>
  );
}
