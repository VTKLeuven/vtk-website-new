'use client';

import { useState } from 'react';
import {
  audienceCount,
  baseOf,
  basisOf,
  costAmount,
  hasResult,
  incomeAmount,
  incomeCount,
  incomePrice,
  locationOf,
  overviewOf,
  perPersonOf,
  priceOf,
  rateOf,
  resultOverviewOf,
  rowPct,
  sectionAmount,
  sectionResult,
  unitsOf,
  type CalcContext,
} from '@/lib/bo/budget/calc';
import type { Check } from '@/lib/bo/budget/checks';
import { fixedPriceOf } from '@/lib/bo/budget/fixed';
import { normalizeName } from '@/lib/bo/budget/formula';
import { liveCheck, openCheck, shopName } from '@/lib/bo/budget/prices';
import type { Pot } from '@/lib/bo/budget/pot';
import type { BudgetContent, CostRow, CostSection, IncomeRow, Section } from '@/lib/bo/budget/types';
import { shopOfUrl, SHOPS } from '@/lib/priceCheck/shops';
import { money, percent, plain, shortDate } from './format';
import { Money } from './Money';
import { NumberField } from './NumberField';

/*
 * Een budget om na te kijken: alles wat de GM of het BO moet zien op één
 * scherm. De editor is een werkblad met knoppen, panelen en lege cellen; wie
 * nakijkt, wil per regel in één oogopslag zien hoeveel, tegen welke prijs,
 * waar die prijs vandaan komt en of ze nagekeken is. Wat in de editor achter
 * het potlood zit (bron, BTW, opmerking), staat hier dus gewoon in de rij.
 *
 * Er is geen lijst met aandachtspunten: wat aan een regel scheelt, staat bij
 * die regel (het bolletje voor de naam en de stand bij de bron). Wie mag
 * wijzigen (`actions`), kan hier twee dingen: een prijs verbeteren door erop
 * te klikken, en zeggen dat hij een prijs zelf nakeek. Al de rest is Maken.
 *
 * Gebruikt door de editor (de schakelaar Maken / Nakijken), door de deellink
 * om te bekijken, en door de mappen per BO.
 */

export type ReviewActions = {
  /** Iemand keek de prijs zelf na, of trekt dat in. */
  confirm: (rowId: string, on: boolean) => void;
  /** De prijs die de winkel gaf, overnemen. */
  accept: (rowId: string) => void;
  /** De prijs rechtstreeks verbeteren. */
  setPrice: (rowId: string, value: number) => void;
};

/** "13 nov, 14:02", of enkel de dag bij een bevestiging van voor de site het uur bijhield. */
function checkedWhen(iso: string, nl: boolean): string {
  if (iso.length <= 10) return shortDate(iso, nl);
  return new Date(iso).toLocaleString(nl ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
  });
}

/**
 * Wie de prijs zelf nakeek en wanneer, of de knop om dat te zeggen. Voor een
 * link naar een winkel die de site niet kent (een frituur, een verhuurder) en
 * voor een regel zonder bron is dit de controle.
 */
function Confirmation({
  row,
  nl,
  actions,
  offer,
}: {
  row: CostRow;
  nl: boolean;
  actions?: ReviewActions;
  /** Toon de knop: de site kon deze prijs niet zelf bevestigen. */
  offer: boolean;
}) {
  if (row.checkedAt)
    return (
      <span className="vtk-rev-confirmed">
        <span>
          {nl ? 'Nagekeken door ' : 'Checked by '}
          <b>{row.checkedBy || (nl ? 'iemand' : 'someone')}</b>
          {nl ? ' op ' : ' on '}
          {checkedWhen(row.checkedAt, nl)}
        </span>
        {actions && (
          <button type="button" className="vtk-rev-btn" onClick={() => actions.confirm(row.id, false)}>
            {nl ? 'Intrekken' : 'Undo'}
          </button>
        )}
      </span>
    );
  if (!actions || !offer) return null;
  return (
    <button
      type="button"
      className="vtk-rev-btn"
      data-primary
      aria-label={nl ? `Prijs zelf nagekeken: ${row.name}` : `Price checked by hand: ${row.name}`}
      onClick={() => actions.confirm(row.id, true)}
    >
      {nl ? 'Zelf nagekeken' : 'Checked by hand'}
    </button>
  );
}

function SourceCell({
  content,
  ctx,
  row,
  nl,
  actions,
}: {
  content: BudgetContent;
  ctx: CalcContext;
  row: CostRow;
  nl: boolean;
  actions?: ReviewActions;
}) {
  if (row.rest) return <span className="vtk-rev-muted">{nl ? 'geen aankoop' : 'nothing bought'}</span>;
  if (row.service) return <span>{nl ? 'Collect&Go-servicekost' : 'Collect&Go service cost'}</span>;
  if (row.forfait)
    return (
      <span>
        <b>{nl ? 'Forfait' : 'Lump sum'}</b>
        {row.forfait.reason ? `: ${row.forfait.reason}` : ''}
      </span>
    );
  const s = row.source;
  if (!s) {
    const fixed = fixedPriceOf(content, ctx, row);
    return (
      <span className="vtk-rev-src">
        {fixed ? (
          <span>
            <b>{nl ? 'Vaste prijs' : 'Fixed price'}</b>
            {normalizeName(fixed.name) !== normalizeName(row.name) ? `: ${fixed.name}` : ''}
            {fixed.note ? ` (${fixed.note})` : ''}
            {!fixed.exact && (
              <span className="vtk-rev-status" data-status="changed">
                {nl ? ` vast is ${money(fixed.price)}` : ` fixed is ${money(fixed.price, false)}`}
              </span>
            )}
          </span>
        ) : row.checkedAt ? (
          <span className="vtk-rev-muted">{nl ? 'Zonder link' : 'No link'}</span>
        ) : (
          <span className="vtk-rev-flag">{nl ? 'geen bron' : 'no source'}</span>
        )}
        <Confirmation row={row} nl={nl} actions={actions} offer={!fixed?.exact} />
      </span>
    );
  }
  if (s.type === 'locatie') {
    const location = locationOf(content, ctx);
    return (
      <span>
        {nl ? 'Prijs van' : 'Price of'} {location?.name ?? (nl ? 'de zaal' : 'the venue')}
        {row.override != null && row.overrideReason
          ? ` (${nl ? 'afwijkend' : 'different'}: ${row.overrideReason})`
          : ''}
      </span>
    );
  }
  const url = s.url?.trim();
  const isLink = !!url && /^https?:\/\//i.test(url);
  if (s.type === 'webshop' || s.type === 'collectgo') {
    const shopId = shopOfUrl(url);
    const label = shopId ? SHOPS[shopId].name : s.type === 'collectgo' ? 'Collect&Go' : hostLabel(url);
    const open = openCheck(row);
    const live = liveCheck(row);
    const status = open
      ? open.status
      : live?.status === 'ok'
        ? 'ok'
        : row.checkedAt
          ? 'confirmed'
          : !isLink
            ? 'nolink'
            : shopId && SHOPS[shopId].live
              ? 'unchecked'
              : 'byhand';
    const excl = open?.basis === 'excl' ? (nl ? ' excl.' : ' excl.') : '';
    const statusText: Record<string, string> = nl
      ? {
          ok: `prijs klopt, nagekeken ${checkedWhen(live?.at ?? '', nl)}`,
          confirmed: '',
          changed: `${shopName(open?.shop)} vraagt nu ${money(open?.price ?? 0)}${excl}`,
          notfound: 'product niet meer te vinden',
          failed: 'geen antwoord van de winkel',
          unchecked: 'wordt vanzelf nagekeken',
          byhand: 'kan de site niet zelf nakijken',
          nolink: 'geen link',
        }
      : {
          ok: `price correct, checked ${checkedWhen(live?.at ?? '', nl)}`,
          confirmed: '',
          changed: `now ${money(open?.price ?? 0, false)}${excl}`,
          notfound: 'product not found',
          failed: 'no answer from the shop',
          unchecked: 'is checked automatically',
          byhand: 'cannot be checked by the site',
          nolink: 'no link',
        };
    return (
      <span className="vtk-rev-src">
        {isLink ? (
          <a href={url} target="_blank" rel="noreferrer">
            {label} ↗
          </a>
        ) : (
          <span>{label}</span>
        )}
        {statusText[status] && (
          <span className="vtk-rev-status" data-status={status}>
            {statusText[status]}
          </span>
        )}
        {actions && open?.status === 'changed' && open.price != null && (
          <button type="button" className="vtk-rev-btn" onClick={() => actions.accept(row.id)}>
            {nl ? `${money(open.price)} overnemen` : `Use ${money(open.price, false)}`}
          </button>
        )}
        <Confirmation row={row} nl={nl} actions={actions} offer={status !== 'ok'} />
      </span>
    );
  }
  const kind =
    s.type === 'offerte'
      ? nl
        ? 'Offerte'
        : 'Quote'
      : s.type === 'flesserke'
        ? 'Flesserke'
        : nl
          ? 'Afspraak'
          : 'Agreed';
  return (
    <span className="vtk-rev-src">
      <span>
        <b>{kind}</b>
        {s.note ? `: ${s.note}` : ''}
      </span>
      {isLink && (
        <a href={url} target="_blank" rel="noreferrer">
          {nl ? 'openen' : 'open'} ↗
        </a>
      )}
      <Confirmation row={row} nl={nl} actions={actions} offer={false} />
    </span>
  );
}

/**
 * De prijs van een regel. Wie mag wijzigen, klikt erop en verbetert ze ter
 * plaatse: een prijs die niet klopt, hoeft geen omweg langs Maken.
 */
function PriceCell({ row, price, nl, actions }: { row: CostRow; price: number; nl: boolean; actions?: ReviewActions }) {
  const [editing, setEditing] = useState(false);
  const fixedByVenue = row.source?.type === 'locatie' && row.override == null;
  if (!actions || fixedByVenue) return <>{money(price, nl)}</>;
  if (editing)
    return (
      <NumberField
        className="vtk-rev-priceinput"
        value={price}
        decimals={2}
        autoFocus
        aria-label={nl ? `Prijs van ${row.name}` : `Price of ${row.name}`}
        onValue={(v) => {
          if (v != null && Math.abs(v - price) > 0.00005) actions.setPrice(row.id, v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
        onBlur={() => setEditing(false)}
      />
    );
  return (
    <button
      type="button"
      className="vtk-rev-price"
      title={nl ? 'Prijs aanpassen' : 'Change the price'}
      aria-label={nl ? `Prijs aanpassen: ${row.name}, nu ${money(price)}` : `Change price: ${row.name}`}
      onClick={() => setEditing(true)}
    >
      {money(price, nl)}
    </button>
  );
}

function hostLabel(url: string | undefined): string {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '');
  } catch {
    return 'Webshop';
  }
}

/** "30 % × 150 × 2 ÷ 24 = 4 bakken", zodat de nakijker de som kan narekenen. */
function calcText(content: BudgetContent, section: CostSection, row: CostRow, nl: boolean): string {
  if (row.forfait || row.rest) return '';
  if (section.type === 'fixed') return `${plain(row.qty ?? 0, nl)} ×`;
  const parts: string[] = [];
  if (section.distribute) parts.push(percent(rowPct(section, row), nl));
  if ((section.share ?? 1) !== 1) parts.push(percent(section.share ?? 1, nl));
  parts.push(`${plain(baseOf(content, section), nl)} p`);
  const pp = perPersonOf(section, row);
  if (pp !== 1) parts.push(plain(pp, nl));
  const units = unitsOf(content, section, row);
  const per = row.perUnit && row.perUnit !== 1 ? ` ÷ ${plain(row.perUnit, nl)}` : '';
  return `${parts.join(' × ')}${per} = ${units}${row.unit ? ` ${row.unit}` : ''} ×`;
}

function vatNote(content: BudgetContent, ctx: CalcContext, row: CostRow, nl: boolean): string {
  if (row.forfait || row.rest || rateOf(content, ctx) === null) return '';
  const { basis, productVat } = basisOf(content, ctx, row);
  if (!basis) return nl ? 'incl. of excl.?' : 'incl. or excl.?';
  return basis === 'incl' ? `incl. ${percent(productVat, nl)}` : 'excl.';
}

function fxTitle(fx: Record<string, string> | undefined): string | undefined {
  if (!fx) return undefined;
  return Object.entries(fx)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
}

function Diff({ value, nl }: { value: number | null; nl: boolean }) {
  if (value == null) return <span className="vtk-rev-muted">–</span>;
  return <Money signed value={value} nl={nl} />;
}

function SectionTable({
  content,
  ctx,
  section,
  nl,
  result,
  checksByRow,
  sectionChecks,
  actions,
}: {
  content: BudgetContent;
  ctx: CalcContext;
  section: Section;
  nl: boolean;
  result: boolean;
  checksByRow: Map<string, Check[]>;
  /** Wat aan de sectie zelf scheelt (een verdeling die niet op 100 % uitkomt). */
  sectionChecks: Check[];
  actions?: ReviewActions;
}) {
  const income = section.type === 'income';
  const amount = sectionAmount(content, ctx, section);
  return (
    <section className="vtk-rev-sec" aria-label={section.name}>
      <header className="vtk-rev-sec-head">
        <h3>
          {section.name || (nl ? 'Sectie zonder naam' : 'Unnamed section')}
          <span>{income ? (nl ? 'inkomsten' : 'income') : nl ? 'kosten' : 'costs'}</span>
        </h3>
      </header>
      {sectionChecks.map((c, i) => (
        <p key={i} className="vtk-rev-secnote" data-level={c.level}>
          {c.text}
        </p>
      ))}
      {section.rows.length === 0 ? (
        <p className="vtk-rev-muted vtk-rev-empty">{nl ? 'Geen regels.' : 'No rows.'}</p>
      ) : (
        <div className="vtk-rev-wrap">
          <table className="vtk-rev-table">
            <thead>
              <tr>
                <th>{nl ? 'Omschrijving' : 'Description'}</th>
                <th className="num">{nl ? 'Aantal' : 'Qty'}</th>
                <th className="num">{nl ? 'Prijs' : 'Price'}</th>
                <th className="num">{nl ? 'Budget' : 'Budget'}</th>
                {result && <th className="num">{nl ? 'Resultaat' : 'Result'}</th>}
                {result && <th className="num">{nl ? 'Verschil' : 'Diff.'}</th>}
                <th>{income ? (nl ? 'Opmerking' : 'Note') : nl ? 'Bron en controle' : 'Source and check'}</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((r) => {
                if (income) {
                  const row = r as IncomeRow;
                  const a = incomeAmount(content, row);
                  return (
                    <tr key={row.id}>
                      <td className="vtk-rev-name">{row.name || '…'}</td>
                      <td className="num" data-label={nl ? 'Aantal' : 'Qty'} title={row.fx?.qty}>
                        {plain(incomeCount(content, row), nl)} ×
                      </td>
                      <td className="num" data-label={nl ? 'Prijs' : 'Price'} title={row.fx?.price}>
                        {money(incomePrice(content, row), nl)}
                      </td>
                      <td className="num vtk-rev-amount" data-label="Budget">
                        <Money value={a} nl={nl} />
                      </td>
                      {result && (
                        <td className="num" data-label={nl ? 'Resultaat' : 'Result'}>
                          {row.result == null ? '–' : <Money value={row.result} nl={nl} />}
                        </td>
                      )}
                      {result && (
                        <td className="num" data-label={nl ? 'Verschil' : 'Diff.'}>
                          <Diff value={row.result == null ? null : row.result - a} nl={nl} />
                        </td>
                      )}
                      <td className="vtk-rev-note" data-label={nl ? 'Opmerking' : 'Note'}>
                        {row.note}
                      </td>
                    </tr>
                  );
                }
                const row = r as CostRow;
                const s = section as CostSection;
                const a = costAmount(content, ctx, s, row);
                const checks = checksByRow.get(row.id) ?? [];
                const level = checks.some((c) => c.level === 'block')
                  ? 'block'
                  : checks.some((c) => c.level === 'review')
                    ? 'review'
                    : undefined;
                const vat = vatNote(content, ctx, row, nl);
                return (
                  <tr key={row.id}>
                    <td className="vtk-rev-name">
                      {level && (
                        <span
                          className="vtk-rev-dot"
                          data-level={level}
                          role="img"
                          title={checks.map((c) => c.text).join('\n')}
                          aria-label={checks.map((c) => c.text).join(' ')}
                        />
                      )}
                      {row.name || '…'}
                      {row.flesserke ? (
                        <span className="vtk-rev-tag">
                          {plain(row.flesserke, nl)} {nl ? 'uit Flesserke' : 'from Flesserke'}
                        </span>
                      ) : null}
                      {row.note && <span className="vtk-rev-sub">{row.note}</span>}
                    </td>
                    <td className="num vtk-rev-calc" data-label={nl ? 'Aantal' : 'Qty'} title={fxTitle(row.fx)}>
                      {row.rest ? percent(rowPct(s, row), nl) : calcText(content, s, row, nl)}
                    </td>
                    <td className="num" data-label={nl ? 'Prijs' : 'Price'}>
                      {row.forfait || row.rest ? (
                        ''
                      ) : row.service ? (
                        money(priceOf(content, ctx, row), nl)
                      ) : (
                        <PriceCell row={row} price={priceOf(content, ctx, row)} nl={nl} actions={actions} />
                      )}
                      {vat && <span className="vtk-rev-sub">{vat}</span>}
                    </td>
                    <td className="num vtk-rev-amount" data-label="Budget">
                      {row.rest ? '' : <Money cost value={a} nl={nl} />}
                    </td>
                    {result && (
                      <td className="num" data-label={nl ? 'Resultaat' : 'Result'}>
                        {row.result == null ? '–' : <Money cost value={row.result} nl={nl} />}
                      </td>
                    )}
                    {result && (
                      <td className="num" data-label={nl ? 'Verschil' : 'Diff.'}>
                        {/* Een kost die lager uitvalt, is goed nieuws: budget min resultaat. */}
                        <Diff value={row.result == null ? null : a - row.result} nl={nl} />
                      </td>
                    )}
                    <td className="vtk-rev-source" data-label={nl ? 'Bron' : 'Source'}>
                      <SourceCell content={content} ctx={ctx} row={row} nl={nl} actions={actions} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Het totaal onder de regels: je ziet dat ze ertoe optellen. */}
            <tfoot>
              <tr>
                <td colSpan={3}>{nl ? 'Totaal' : 'Total'}</td>
                <td className="num" data-label={nl ? 'Totaal' : 'Total'}>
                  <Money cost={!income} value={amount} nl={nl} />
                </td>
                {result && (
                  <td className="num" data-label={nl ? 'Resultaat' : 'Result'}>
                    <Money cost={!income} value={sectionResult(section)} nl={nl} />
                  </td>
                )}
                {result && (
                  <td className="num" data-label={nl ? 'Verschil' : 'Diff.'}>
                    <Diff value={income ? sectionResult(section) - amount : amount - sectionResult(section)} nl={nl} />
                  </td>
                )}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

export function BudgetReview({
  title,
  postName,
  targetDate,
  content,
  ctx,
  checks,
  pot,
  locale,
  potHref,
  actions,
}: {
  title: string;
  postName: string;
  targetDate: string | null;
  content: BudgetContent;
  ctx: CalcContext;
  checks: Check[];
  pot?: Pot | null;
  locale: 'nl' | 'en';
  /** Maakt van de andere budgetten in het potje een link, voor wie ze mag openen. */
  potHref?: (id: string) => string;
  /** Voor wie mag wijzigen: een prijs verbeteren en zeggen dat hij ze zelf nakeek. */
  actions?: ReviewActions;
}) {
  const nl = locale === 'nl';
  const o = overviewOf(content, ctx);
  const result = hasResult(content);
  const r = result ? resultOverviewOf(content, ctx) : null;
  const p = content.params;
  const checksByRow = new Map<string, Check[]>();
  for (const c of checks) if (c.rowId) checksByRow.set(c.rowId, [...(checksByRow.get(c.rowId) ?? []), c]);
  const rate = rateOf(content, ctx);
  const facts: [string, string][] = [
    [nl ? 'Post' : 'Post', postName],
    ...(targetDate ? [[nl ? 'BO van' : 'Meeting of', shortDate(targetDate, nl)] as [string, string]] : []),
    ...(content.info.date
      ? [[nl ? 'Activiteit' : 'Activity', shortDate(content.info.date, nl)] as [string, string]]
      : []),
    ...(content.info.location.trim()
      ? [[nl ? 'Locatie' : 'Venue', content.info.location.trim()] as [string, string]]
      : []),
    [nl ? 'Deelnemers' : 'Participants', plain(p.persons, nl)],
    ...(p.memberShare != null
      ? [
          [
            nl ? 'Publiek' : 'Audience',
            nl
              ? `${audienceCount(content, 'leden')} leden, ${audienceCount(content, 'nietleden')} niet-leden, ${audienceCount(content, 'ereleden')} ereleden, ${audienceCount(content, 'genodigden')} genodigden`
              : `${audienceCount(content, 'leden')} members, ${audienceCount(content, 'nietleden')} non-members`,
          ] as [string, string],
        ]
      : []),
    ...(p.extra ?? [])
      .filter((x) => x.name.trim())
      .map(
        (x) =>
          [
            x.name,
            x.kind === 'percent'
              ? percent(x.value, nl)
              : x.kind === 'money'
                ? `€ ${money(x.value, nl)}`
                : plain(x.value, nl),
          ] as [string, string]
      ),
    [
      'BTW',
      rate === null
        ? nl
          ? 'tarief nog niet ingevuld'
          : 'rate not set'
        : `${percent(rate, nl)}${content.vat ? ` (${content.vat.reason})` : ''}`,
    ],
    ...(content.pricesAt
      ? [[nl ? 'Prijzen nagekeken' : 'Prices checked', checkedWhen(content.pricesAt, nl)] as [string, string]]
      : []),
    ...(content.allocation.length > 1
      ? [
          [
            nl ? 'Verdeling' : 'Split',
            content.allocation.map((a) => `${a.org} ${percent(a.share, nl)}`).join(', '),
          ] as [string, string],
        ]
      : []),
  ];
  const vtkShare = content.allocation.length > 1 ? content.allocation[0] : null;

  return (
    <article className="vtk-rev">
      <header className="vtk-rev-head">
        <div>
          <p className="vtk-rev-kicker">{result ? (nl ? 'Resultaat' : 'Result') : nl ? 'Budget' : 'Budget'}</p>
          <h2>{title}</h2>
        </div>
        <dl className="vtk-rev-figs">
          <div>
            <dt>{nl ? 'Inkomsten' : 'Income'}</dt>
            <dd>
              <Money value={o.income} nl={nl} />
            </dd>
            {r && (
              <dd className="res">
                <Money value={r.income} nl={nl} />
              </dd>
            )}
          </div>
          <div>
            <dt>{nl ? 'Uitgaven' : 'Expenses'}</dt>
            <dd>
              <Money cost value={o.expense} nl={nl} />
            </dd>
            {r && (
              <dd className="res">
                <Money cost value={r.expense} nl={nl} />
              </dd>
            )}
          </div>
          <div className="total">
            <dt>{nl ? 'Totaal' : 'Total'}</dt>
            <dd>
              <Money value={o.total} nl={nl} />
            </dd>
            {r && (
              <dd className="res">
                <Money value={r.total} nl={nl} />
              </dd>
            )}
          </div>
          <div>
            <dt>{nl ? 'Begroting' : 'Yearly budget'}</dt>
            <dd>
              <Money value={o.begroting} nl={nl} />
            </dd>
            {r && <dd className="res vtk-rev-muted">{nl ? 'resultaat' : 'result'}</dd>}
          </div>
          <div>
            <dt>
              {pot?.others.length
                ? nl
                  ? 'Potje t.o.v. begroting'
                  : 'Pot against plan'
                : nl
                  ? 'T.o.v. begroting'
                  : 'Against plan'}
            </dt>
            <dd>
              <Diff value={o.diff} nl={nl} />
            </dd>
            {r && (
              <dd className="res">
                <Diff value={r.diffBegroting} nl={nl} />
              </dd>
            )}
          </div>
        </dl>
      </header>

      <dl className="vtk-rev-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {content.begrotingRef && (
        <p className="vtk-rev-line">
          {nl ? 'Lijn in de begroting:' : 'Line in the yearly budget:'} <b>{content.begrotingRef.label}</b>
        </p>
      )}
      {content.info.concept.trim() && <p className="vtk-rev-concept">{content.info.concept}</p>}
      {content.source && (
        <p className="vtk-rev-line">
          {nl ? 'Overgenomen uit het rekenblad' : 'Taken from the spreadsheet'} <b>{content.source.name}</b>
          {content.source.mode === 'overzicht'
            ? nl
              ? ' (enkel het overzicht; de regels staan in het blad)'
              : ' (overview only)'
            : ''}
        </p>
      )}
      {vtkShare && (
        <p className="vtk-rev-line">
          {nl ? 'Aandeel' : 'Share of'} {vtkShare.org}:{' '}
          <b>
            <Money value={o.total * vtkShare.share} nl={nl} />
          </b>
        </p>
      )}

      {pot && pot.others.length > 0 && (
        <section className="vtk-rev-pot" aria-label={nl ? 'Potje' : 'Pot'}>
          <h3>{nl ? 'Dit potje: alles op dezelfde lijn van de begroting' : 'This pot: everything on the same line'}</h3>
          <table className="vtk-rev-table vtk-rev-pottable">
            <thead>
              <tr>
                <th>{nl ? 'Budget' : 'Budget'}</th>
                <th>BO</th>
                <th className="num">{nl ? 'Budget' : 'Budget'}</th>
                <th className="num">{nl ? 'Resultaat' : 'Result'}</th>
              </tr>
            </thead>
            <tbody>
              {pot.others.map((m) => (
                <tr key={m.id}>
                  <td className="vtk-rev-name">{potHref ? <a href={potHref(m.id)}>{m.title}</a> : m.title}</td>
                  <td>{m.targetDate ? shortDate(m.targetDate, nl) : '–'}</td>
                  <td className="num">
                    <Money value={m.total} nl={nl} />
                  </td>
                  <td className="num">
                    <Money value={m.result} nl={nl} />
                  </td>
                </tr>
              ))}
              <tr className="self">
                <td className="vtk-rev-name">
                  {title} <span className="vtk-rev-tag">{nl ? 'dit budget' : 'this budget'}</span>
                </td>
                <td>{targetDate ? shortDate(targetDate, nl) : '–'}</td>
                <td className="num">
                  <Money value={o.total} nl={nl} />
                </td>
                <td className="num">
                  <Money value={r ? r.total : null} nl={nl} />
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{nl ? 'Samen' : 'Together'}</td>
                <td className="num">
                  <Money value={o.total + pot.othersTotal} nl={nl} />
                </td>
                <td className="num">
                  <Money value={(r ? r.total : o.total) + pot.othersResult} nl={nl} />
                </td>
              </tr>
              {o.begroting != null && (
                <tr>
                  <td colSpan={2}>{nl ? 'Nog over van de begroting' : 'Left of the yearly budget'}</td>
                  <td className="num">
                    <Diff value={o.diff} nl={nl} />
                  </td>
                  <td className="num">
                    <Diff value={(r ? r.total : o.total) + pot.othersResult - o.begroting} nl={nl} />
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </section>
      )}

      {content.result?.note?.trim() && (
        <p className="vtk-rev-concept">
          <b>{nl ? 'Toelichting bij het resultaat: ' : 'About the result: '}</b>
          {content.result.note}
        </p>
      )}

      {content.sections.map((section) => (
        <SectionTable
          key={section.id}
          content={content}
          ctx={ctx}
          section={section}
          nl={nl}
          result={result}
          checksByRow={checksByRow}
          sectionChecks={checks.filter((c) => !c.rowId && c.sectionId === section.id && c.level !== 'info')}
          actions={actions}
        />
      ))}
    </article>
  );
}
