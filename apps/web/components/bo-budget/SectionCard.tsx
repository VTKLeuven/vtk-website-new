'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ConfirmDialog } from '@vtk/ui';
import { IconButton } from '@/components/ui/IconButton';
import { ArrowDownIcon, ArrowUpIcon, LinkIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';
import {
  basisOf,
  costAmount,
  distributionOf,
  incomeAmount,
  incomeCount,
  incomePrice,
  locationOf,
  priceOf,
  rateOf,
  restShare,
  rowPct,
  sectionAmount,
  sectionResult,
  unitsOf,
} from '@/lib/bo/budget/calc';
import { controlOf, shopLabel } from '@/lib/bo/budget/control';
import { fixedPriceOf } from '@/lib/bo/budget/fixed';
import { normalizeName, setFx } from '@/lib/bo/budget/formula';
import { clearConfirmation } from '@/lib/bo/budget/prices';
import { shopOfUrl } from '@/lib/priceCheck/shops';
import type { CostRow, CostSection, IncomeRow, IncomeSection, Section } from '@/lib/bo/budget/types';
import { ControlCell } from './ControlCell';
import type { EditorApi } from './editorApi';
import { money, percent, plain } from './format';
import { Money } from './Money';
import { NumberField } from './NumberField';

/*
 * Eén sectie van het budget als tabel om in te typen, zoals een blad: naam,
 * aantal en prijs staan meteen in de cel, het bedrag rekent de site. Enter
 * springt naar dezelfde kolom op de volgende regel.
 *
 * Dezelfde tabel is ook wat wie nakijkt ziet (er is geen aparte weergave
 * meer): per regel waar de prijs vandaan komt (Bron) en hoe het met die prijs
 * staat (Controle), met zelf nagekeken en de prijs van de winkel overnemen
 * als rij-acties. Kiezen van een andere soort bron, de BTW, Flesserke en de
 * opmerking staan in het paneel achter het potlood.
 */

const TYPE_LABEL = {
  nl: { fixed: 'Kosten', variable: 'Kosten per persoon', income: 'Inkomsten' },
  en: { fixed: 'Costs', variable: 'Costs per person', income: 'Income' },
};

const SOURCE_WORD: Record<string, [string, string]> = {
  flesserke: ['Flesserke', 'Flesserke'],
  afspraak: ['Afspraak', 'Agreed'],
  locatie: ['Prijs van de locatie', "Venue's price"],
};

/** "incl. 21 %", "excl." of "incl. of excl.?" onder de prijs, zodra de post een tarief heeft. */
function vatNote(api: EditorApi, row: CostRow): string {
  const { content, ctx, nl } = api;
  if (row.forfait || row.rest || row.service || rateOf(content, ctx) === null) return '';
  const { basis, productVat } = basisOf(content, ctx, row);
  if (!basis) return nl ? 'incl. of excl.?' : 'incl. or excl.?';
  return basis === 'incl' ? `incl. ${percent(productVat, nl)}` : 'excl.';
}

/**
 * De link van een regel in de tabel. Leeg is het een cel om in te plakken (de
 * site herkent zelf of het Collect&Go of een andere webshop is); met een link
 * staat de naam van de winkel er, als link naar het product, met ernaast een
 * knop om de link te wijzigen.
 */
function LinkField({
  api,
  row,
  onUrl,
  placeholder,
  danger = false,
}: {
  api: EditorApi;
  row: CostRow;
  onUrl: (value: string) => void;
  placeholder: string;
  danger?: boolean;
}) {
  const { nl, readOnly } = api;
  const [editing, setEditing] = useState(false);
  const url = row.source?.url ?? '';
  const isLink = /^https?:\/\//i.test(url.trim());
  const offerte = row.source?.type === 'offerte';
  const who =
    row.checkedAt && row.checkedBy ? (
      <span className="vtk-bud-who">{nl ? `door ${row.checkedBy}` : `by ${row.checkedBy}`}</span>
    ) : null;
  if (isLink && !editing) {
    const label = offerte ? (nl ? 'Offerte' : 'Quote') : shopLabel(row);
    return (
      <span className="vtk-bud-linkcell">
        <a
          className="vtk-bud-srclink"
          href={url}
          target="_blank"
          rel="noreferrer"
          title={nl ? `Openen bij ${label}` : `Open at ${label}`}
        >
          {label}
          {offerte && row.source?.note ? `: ${row.source.note}` : ''}
        </a>
        {who}
        {!readOnly && (
          <IconButton
            className="vtk-bud-relink"
            label={nl ? 'Link wijzigen' : 'Change link'}
            srLabel={nl ? `Link wijzigen: ${row.name || 'deze regel'}` : `Change link: ${row.name || 'this row'}`}
            onClick={() => setEditing(true)}
          >
            <LinkIcon />
          </IconButton>
        )}
      </span>
    );
  }
  if (readOnly) {
    return offerte ? (
      <span>
        <b>{nl ? 'Offerte' : 'Quote'}</b>
        {row.source?.note ? `: ${row.source.note}` : ''}
        {who}
      </span>
    ) : (
      <span className={danger ? 'vtk-bud-flag' : 'vtk-bud-muted'}>{placeholder}</span>
    );
  }
  return (
    <span className="vtk-bud-linkcell">
      <input
        className="vtk-bud-bare vtk-bud-cell"
        data-danger={danger ? '1' : undefined}
        value={url}
        data-col="link"
        inputMode="url"
        autoFocus={editing}
        placeholder={placeholder}
        aria-label={nl ? `Link van ${row.name || 'deze regel'}` : `Link of ${row.name || 'this row'}`}
        onChange={(e) => onUrl(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
      />
      {offerte && row.source?.note && <span className="vtk-bud-sub">{row.source.note}</span>}
    </span>
  );
}

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
  /** Bron: waar de prijs vandaan komt. Een link plak je hier; een andere soort bron kies je achter het potlood. */
  const linkCell = (row: CostRow) => {
    const type = row.source?.type;
    const word = type ? SOURCE_WORD[type] : undefined;
    const label = nl ? 'Bron' : 'Source';
    if (row.service)
      return (
        <td className="vtk-bud-col-link vtk-bud-muted" data-label={label}>
          {nl ? 'Collect&Go-servicekost' : 'Collect&Go service cost'}
        </td>
      );
    if (row.forfait)
      return (
        <td className="vtk-bud-col-link" data-label={label}>
          <button type="button" className="vtk-bud-srcword" onClick={(e) => api.openRow(row.id, e.currentTarget)}>
            <b>{nl ? 'Forfait' : 'Lump sum'}</b>
            {row.forfait.reason ? `: ${row.forfait.reason}` : ''}
          </button>
        </td>
      );
    if (word) {
      const location = type === 'locatie' ? locationOf(content, ctx) : null;
      return (
        <td className="vtk-bud-col-link" data-label={label}>
          <button type="button" className="vtk-bud-srcword" onClick={(e) => api.openRow(row.id, e.currentTarget)}>
            <b>
              {type === 'locatie' && location ? `${nl ? 'Prijs van' : 'Price of'} ${location.name}` : word[nl ? 0 : 1]}
            </b>
            {row.source?.note ? `: ${row.source.note}` : ''}
            {row.checkedAt && row.checkedBy ? (
              <span className="vtk-bud-who">{nl ? `door ${row.checkedBy}` : `by ${row.checkedBy}`}</span>
            ) : null}
          </button>
        </td>
      );
    }
    // Een offerte zonder link: het woord, en de link plak je achter het potlood.
    if (type === 'offerte' && !row.source?.url?.trim())
      return (
        <td className="vtk-bud-col-link" data-label={label}>
          <button type="button" className="vtk-bud-srcword" onClick={(e) => api.openRow(row.id, e.currentTarget)}>
            <b>{nl ? 'Offerte' : 'Quote'}</b>
            {row.source?.note ? `: ${row.source.note}` : ''}
          </button>
        </td>
      );
    if (!row.source) {
      const fixed = fixedPriceOf(content, ctx, row);
      if (fixed)
        return (
          <td className="vtk-bud-col-link" data-label={label}>
            <button type="button" className="vtk-bud-srcword" onClick={(e) => api.openRow(row.id, e.currentTarget)}>
              <b>{nl ? 'Vaste prijs' : 'Fixed price'}</b>
              {normalizeName(fixed.name) !== normalizeName(row.name) ? `: ${fixed.name}` : ''}
            </button>
          </td>
        );
    }
    const noSource = !row.source && !row.checkedAt;
    return (
      <td className="vtk-bud-col-link" data-label={label}>
        <LinkField
          api={api}
          row={row}
          danger={noSource}
          placeholder={
            type === 'offerte'
              ? nl
                ? 'Link naar de offerte'
                : 'Link to the quote'
              : noSource
                ? nl
                  ? 'geen bron: plak een link'
                  : 'no source: paste a link'
                : row.checkedAt
                  ? nl
                    ? 'zonder link'
                    : 'no link'
                  : 'https://'
          }
          onUrl={(input) =>
            update(row.id, (r) => {
              const value = input.trim();
              if (r.source?.type === 'offerte') r.source.url = value;
              else if (!value) r.source = null;
              else
                r.source = {
                  ...(r.source ?? {}),
                  type: shopOfUrl(value) === 'collectgo' ? 'collectgo' : 'webshop',
                  url: value,
                };
              // Een andere link is een ander product: het vorige antwoord van de winkel geldt niet meer.
              delete r.lastCheck;
              clearConfirmation(r);
            })
          }
        />
      </td>
    );
  };
  const controlCell = (row: CostRow) => {
    const control = controlOf(content, ctx, row, nl);
    return (
      <td className="num vtk-bud-col-ctl" data-label={nl ? 'Controle' : 'Check'}>
        {control && <ControlCell control={control} row={row} nl={nl} actions={api.controlActions ?? undefined} />}
      </td>
    );
  };
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
            <th className="vtk-bud-col-link">{nl ? 'Bron' : 'Source'}</th>
            <th className="num vtk-bud-col-ctl">{nl ? 'Controle' : 'Check'}</th>
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
            const sub = [
              row.flesserke
                ? nl
                  ? `${plain(row.flesserke, nl)} uit Flesserke`
                  : `${plain(row.flesserke, nl)} from Flesserke`
                : '',
              row.note?.trim() ?? '',
            ].filter(Boolean);
            const name = (
              <td className="vtk-bud-col-name">
                <span className="vtk-bud-namecell">
                  <StatusDot api={api} rowId={row.id} name={row.name} />
                  <input
                    className="vtk-bud-bare vtk-bud-cell"
                    value={row.name}
                    data-col="name"
                    data-row={row.id}
                    aria-label={nl ? 'Omschrijving' : 'Description'}
                    placeholder={nl ? 'Wat koop je?' : 'What are you buying?'}
                    onChange={(e) => update(row.id, (r) => (r.name = e.target.value))}
                  />
                </span>
                {sub.length > 0 && <span className="vtk-bud-sub">{sub.join(' · ')}</span>}
              </td>
            );
            const actions = (
              <td className="vtk-bud-col-act">
                <span className="vtk-bud-act">
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
                  <td className="vtk-bud-col-link" />
                  <td className="vtk-bud-col-ctl" />
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
                  {linkCell(row)}
                  {controlCell(row)}
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
                          const before = r.override ?? r.price ?? 0;
                          if (r.override != null) r.override = v ?? 0;
                          else r.price = v ?? 0;
                          // Een bevestiging gold voor de vorige prijs.
                          if ((v ?? 0) !== before) clearConfirmation(r);
                        })
                      }
                    />
                  )}
                  {vatNote(api, row) && <span className="vtk-bud-sub">{vatNote(api, row)}</span>}
                </td>
                <td className="num vtk-bud-amount" data-label={nl ? 'Bedrag' : 'Amount'}>
                  <Money cost value={amount} nl={nl} />
                </td>
                {resultCell(row)}
                {linkCell(row)}
                {controlCell(row)}
                {actions}
              </tr>
            );
          })}
        </tbody>
        {/* Het totaal onder de regels, in de kolom van de bedragen: je ziet dat ze ertoe optellen. */}
        <tfoot>
          <tr>
            <td colSpan={variable ? (distribute ? 6 : 5) : 3}>
              {nl ? `Totaal ${section.name}` : `Total ${section.name}`}
            </td>
            <td className="num vtk-bud-amount" data-label={nl ? 'Totaal' : 'Total'}>
              <Money cost value={sectionAmount(content, ctx, section)} nl={nl} />
            </td>
            {api.resultOn && (
              <td className="num vtk-bud-col-res vtk-bud-amount" data-label={nl ? 'Resultaat' : 'Result'}>
                <Money cost value={sectionResult(section)} nl={nl} />
              </td>
            )}
            <td colSpan={3} />
          </tr>
        </tfoot>
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
                  <Money value={incomeAmount(content, row)} nl={nl} />
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
        <tfoot>
          <tr>
            <td colSpan={3}>{nl ? `Totaal ${section.name}` : `Total ${section.name}`}</td>
            <td className="num vtk-bud-amount" data-label={nl ? 'Totaal' : 'Total'}>
              <Money value={section.rows.reduce((sum, row) => sum + incomeAmount(content, row), 0)} nl={nl} />
            </td>
            {api.resultOn && (
              <td className="num vtk-bud-col-res vtk-bud-amount" data-label={nl ? 'Resultaat' : 'Result'}>
                <Money value={sectionResult(section)} nl={nl} />
              </td>
            )}
            <td />
          </tr>
        </tfoot>
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

export function SectionCard({
  api,
  section,
  onDelete,
  onMove,
  first = false,
  last = false,
}: {
  api: EditorApi;
  section: Section;
  onDelete: () => void;
  /** De sectie een plaats naar boven (-1) of naar beneden (1). */
  onMove?: (by: -1 | 1) => void;
  first?: boolean;
  last?: boolean;
}) {
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
            placeholder={nl ? 'Naam, bv. Drank of Decoratie' : 'Name, e.g. Drinks'}
            onChange={(e) => rename(e.target.value)}
          />
          <span className="vtk-bud-sec-type">{TYPE_LABEL[nl ? 'nl' : 'en'][section.type]}</span>
        </div>
        <div className="vtk-bud-sec-right">
          {/* Zonder regels is er geen tabel, en dus geen totaal eronder. */}
          {section.rows.length === 0 && (
            <span className="vtk-bud-sec-amount">
              <Money cost={section.type !== 'income'} value={amount} nl={nl} />
            </span>
          )}
          {!readOnly && onMove && (
            <>
              <IconButton
                label={nl ? 'Sectie naar boven' : 'Move section up'}
                srLabel={`${nl ? 'Naar boven' : 'Move up'}: ${section.name}`}
                disabled={first}
                onClick={() => onMove(-1)}
              >
                <ArrowUpIcon />
              </IconButton>
              <IconButton
                label={nl ? 'Sectie naar beneden' : 'Move section down'}
                srLabel={`${nl ? 'Naar beneden' : 'Move down'}: ${section.name}`}
                disabled={last}
                onClick={() => onMove(1)}
              >
                <ArrowDownIcon />
              </IconButton>
            </>
          )}
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
      {/* Wat aan de sectie zelf scheelt (een naam die niets zegt). De verdeling zegt het al in haar balk. */}
      {api.checks
        .filter(
          (c) =>
            c.sectionId === section.id &&
            !c.rowId &&
            c.level !== 'info' &&
            !(variable && section.distribute && c.text.startsWith(`${section.name}:`))
        )
        .map((c, i) => (
          <p key={i} className="vtk-bud-secnote" data-level={c.level}>
            {c.text}
          </p>
        ))}

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
