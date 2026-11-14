'use client';

import { useState, type ReactElement } from 'react';
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
import { IconButton } from '@/components/ui/IconButton';
import {
  AlertIcon,
  CheckIcon,
  CheckSquareIcon,
  ClockIcon,
  InfoIcon,
  LinkOffIcon,
  TakeOverIcon,
  UndoIcon,
  UserCheckIcon,
} from '@/components/ui/icons';

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

type ControlState =
  | 'ok'
  | 'fixed'
  | 'confirmed'
  | 'waiting'
  | 'changed'
  | 'notfound'
  | 'failed'
  | 'byhand'
  | 'nolink'
  | 'nosource'
  | 'offfixed';

/** De stand van de prijs van een regel, voor de kolom Controle. */
type Control = {
  state: ControlState;
  /** De uitleg in de tooltip: wat, wanneer en door wie. */
  tip: string;
  /** Een kort woord naast het icoon, enkel voor wat aandacht vraagt. */
  word?: string;
  /** Mag iemand zeggen dat hij de prijs zelf nakeek? De site kon ze niet bevestigen. */
  offer: boolean;
  /** De prijs die de winkel nu vraagt, om over te nemen. */
  shopPrice?: number;
};

const TONE: Record<ControlState, 'ok' | 'muted' | 'bad' | 'low'> = {
  ok: 'ok',
  fixed: 'ok',
  confirmed: 'ok',
  waiting: 'muted',
  byhand: 'muted',
  changed: 'bad',
  notfound: 'bad',
  nolink: 'bad',
  nosource: 'bad',
  offfixed: 'bad',
  failed: 'low',
};

const ICON: Record<ControlState, () => ReactElement> = {
  ok: CheckIcon,
  fixed: CheckIcon,
  confirmed: UserCheckIcon,
  waiting: ClockIcon,
  byhand: InfoIcon,
  changed: AlertIcon,
  notfound: AlertIcon,
  failed: AlertIcon,
  offfixed: AlertIcon,
  nolink: LinkOffIcon,
  nosource: LinkOffIcon,
};

function confirmedTip(row: CostRow, nl: boolean): string {
  const who = row.checkedBy || (nl ? 'iemand' : 'someone');
  return nl
    ? `Zelf nagekeken door ${who} op ${checkedWhen(row.checkedAt ?? '', nl)}`
    : `Checked by ${who} on ${checkedWhen(row.checkedAt ?? '', nl)}`;
}

/**
 * Hoe het staat met de prijs van een regel. Null voor een regel zonder prijs om
 * na te kijken (een forfait, de rest, de prijs van de zaal).
 */
function controlOf(content: BudgetContent, ctx: CalcContext, row: CostRow, nl: boolean): Control | null {
  if (row.rest || row.service || row.forfait) return null;
  const confirmed: Control | null = row.checkedAt
    ? { state: 'confirmed', tip: confirmedTip(row, nl), offer: false }
    : null;
  const s = row.source;
  if (!s) {
    if (confirmed) return confirmed;
    const fixed = fixedPriceOf(content, ctx, row);
    if (fixed?.exact)
      return {
        state: 'fixed',
        tip: nl ? 'Vaste prijs uit de instellingen' : 'Fixed price from the settings',
        offer: false,
      };
    if (fixed)
      return {
        state: 'offfixed',
        word: nl ? `vast is ${money(fixed.price)}` : `fixed is ${money(fixed.price, false)}`,
        tip: nl ? 'Deze prijs wijkt af van de vaste prijs' : 'This price differs from the fixed price',
        offer: true,
      };
    return {
      state: 'nosource',
      tip: nl ? 'Geen bron: geen link, offerte of vaste prijs' : 'No source: no link, quote or fixed price',
      offer: true,
    };
  }
  if (s.type === 'locatie') return null;
  if (s.type !== 'webshop' && s.type !== 'collectgo') return confirmed;

  const url = s.url?.trim();
  const isLink = !!url && /^https?:\/\//i.test(url);
  const shopId = shopOfUrl(url);
  const label = shopId ? SHOPS[shopId].name : s.type === 'collectgo' ? 'Collect&Go' : hostLabel(url);
  const open = openCheck(row);
  const live = liveCheck(row);
  if (open?.status === 'changed') {
    const excl = open.basis === 'excl' ? ' excl.' : '';
    const price = open.price ?? 0;
    return {
      state: 'changed',
      word: nl ? `winkel: ${money(price)}${excl}` : `shop: ${money(price, false)}${excl}`,
      tip: nl ? `${shopName(open.shop)} vraagt nu ${money(price)}${excl}` : `The shop now asks ${money(price, false)}`,
      offer: true,
      shopPrice: open.price ?? undefined,
    };
  }
  if (open?.status === 'notfound')
    return {
      state: 'notfound',
      word: nl ? 'niet meer te vinden' : 'not found',
      tip: nl ? `Het product staat niet meer bij ${label}` : `The product is no longer at ${label}`,
      offer: true,
    };
  if (open?.status === 'failed')
    return {
      state: 'failed',
      word: nl ? 'geen antwoord' : 'no answer',
      tip: nl
        ? `Geen antwoord van ${label}${open.reason ? ` (${open.reason})` : ''}. De site probeert het over vier uur opnieuw.`
        : `No answer from ${label}. The site tries again in four hours.`,
      offer: true,
    };
  if (live?.status === 'ok')
    return {
      state: 'ok',
      tip: nl
        ? `Prijs klopt bij ${label}, nagekeken ${checkedWhen(live.at, nl)}`
        : `Price correct at ${label}, checked ${checkedWhen(live.at, nl)}`,
      offer: false,
    };
  if (confirmed) return confirmed;
  if (!isLink)
    return {
      state: 'nolink',
      word: nl ? 'geen link' : 'no link',
      tip: nl ? 'Geen link naar het product' : 'No link to the product',
      offer: true,
    };
  if (shopId && SHOPS[shopId].live)
    return {
      state: 'waiting',
      tip: nl
        ? 'Wordt vanzelf nagekeken, om de vier uur tot het BO'
        : 'Checked automatically every four hours until the meeting',
      offer: true,
    };
  return {
    state: 'byhand',
    tip: nl
      ? 'De site kan deze winkel niet zelf nakijken: kijk de prijs zelf na'
      : 'The site cannot check this shop: check the price yourself',
    offer: true,
  };
}

/**
 * De kolom Controle: een icoon met de uitleg in de tooltip, en enkel voor wat
 * aandacht vraagt een kort woord. "Zelf nagekeken" en "Intrekken" zijn
 * rij-acties en verschijnen bij hover of focus (op een aanraakscherm altijd);
 * de prijs van de winkel overnemen staat er meteen, want die vraagt iets.
 */
function ControlCell({
  control,
  row,
  nl,
  actions,
}: {
  control: Control;
  row: CostRow;
  nl: boolean;
  actions?: ReviewActions;
}) {
  const Icon = ICON[control.state];
  const tone = TONE[control.state];
  const name = row.name || '…';
  return (
    <span className="vtk-rev-check">
      {control.word && (
        <span className="vtk-rev-word" data-tone={tone}>
          {control.word}
        </span>
      )}
      {actions && control.shopPrice != null && (
        <IconButton
          className="vtk-rev-ico"
          label={nl ? `${money(control.shopPrice)} overnemen` : `Use ${money(control.shopPrice, false)}`}
          srLabel={
            nl ? `Prijs van de winkel overnemen: ${name}, ${money(control.shopPrice)}` : `Use the shop price: ${name}`
          }
          onClick={() => actions.accept(row.id)}
        >
          <TakeOverIcon />
        </IconButton>
      )}
      {actions && control.offer && (
        <IconButton
          className="vtk-rev-ico vtk-rev-hover"
          label={nl ? 'Zelf nagekeken' : 'Checked by hand'}
          srLabel={nl ? `Prijs zelf nagekeken: ${name}` : `Price checked by hand: ${name}`}
          onClick={() => actions.confirm(row.id, true)}
        >
          <CheckSquareIcon />
        </IconButton>
      )}
      {actions && control.state === 'confirmed' && (
        <IconButton
          className="vtk-rev-ico vtk-rev-hover"
          label={nl ? 'Zelf nagekeken intrekken' : 'Undo checked by hand'}
          srLabel={nl ? `Zelf nagekeken intrekken: ${name}` : `Undo checked by hand: ${name}`}
          onClick={() => actions.confirm(row.id, false)}
        >
          <UndoIcon />
        </IconButton>
      )}
      <span className="vtk-rev-state" data-tone={tone} role="img" title={control.tip} aria-label={control.tip}>
        <Icon />
      </span>
    </span>
  );
}

/** De kolom Bron: waar de prijs vandaan komt, zonder de stand (die staat in Controle). */
function SourceCell({
  content,
  ctx,
  row,
  nl,
}: {
  content: BudgetContent;
  ctx: CalcContext;
  row: CostRow;
  nl: boolean;
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
    if (fixed)
      return (
        <span>
          <b>{nl ? 'Vaste prijs' : 'Fixed price'}</b>
          {normalizeName(fixed.name) !== normalizeName(row.name) ? `: ${fixed.name}` : ''}
          {fixed.note ? ` (${fixed.note})` : ''}
        </span>
      );
    if (row.checkedAt) return <span className="vtk-rev-muted">{nl ? 'Zonder link' : 'No link'}</span>;
    return <span className="vtk-rev-flag">{nl ? 'geen bron' : 'no source'}</span>;
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
  const who = row.checkedAt && row.checkedBy ? <span className="vtk-rev-who"> · {row.checkedBy}</span> : null;
  if (s.type === 'webshop' || s.type === 'collectgo') {
    const shopId = shopOfUrl(url);
    const label = shopId ? SHOPS[shopId].name : s.type === 'collectgo' ? 'Collect&Go' : hostLabel(url);
    return (
      <span className="vtk-rev-src">
        {isLink ? (
          <a href={url} target="_blank" rel="noreferrer" title={nl ? `Openen bij ${label}` : `Open at ${label}`}>
            {label}
          </a>
        ) : (
          <span>{label}</span>
        )}
        {who}
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
        {who}
      </span>
      {isLink && (
        <a href={url} target="_blank" rel="noreferrer">
          {nl ? 'openen' : 'open'}
        </a>
      )}
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
                <th>{income ? (nl ? 'Opmerking' : 'Note') : nl ? 'Bron' : 'Source'}</th>
                {!income && <th className="num">{nl ? 'Controle' : 'Check'}</th>}
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
                const control = controlOf(content, ctx, row, nl);
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
                      <SourceCell content={content} ctx={ctx} row={row} nl={nl} />
                    </td>
                    <td className="num vtk-rev-control" data-label={nl ? 'Controle' : 'Check'}>
                      {control && <ControlCell control={control} row={row} nl={nl} actions={actions} />}
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
                {!income && <td />}
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
