'use client';

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
import { openCheck, shopName } from '@/lib/bo/budget/prices';
import type { Pot } from '@/lib/bo/budget/pot';
import type { BudgetContent, CostRow, CostSection, IncomeRow, Section } from '@/lib/bo/budget/types';
import { shopOfUrl, SHOPS } from '@/lib/priceCheck/shops';
import { money, percent, plain, shortDate, signedMoney } from './format';

/*
 * Een budget om na te kijken: alles wat de GM of het BO moet zien op één
 * scherm, zonder één invoerveld. De editor is een werkblad met knoppen,
 * panelen en lege cellen; wie nakijkt, wil per regel in één oogopslag zien
 * hoeveel, tegen welke prijs, waar die prijs vandaan komt en of ze nagekeken
 * is. Wat in de editor achter het potlood zit (bron, BTW, opmerking), staat
 * hier dus gewoon in de rij.
 *
 * Gebruikt door de editor (de schakelaar Maken / Nakijken), door de deellink
 * om te bekijken, en door de mappen per BO.
 */

function sourceCell(content: BudgetContent, ctx: CalcContext, row: CostRow, nl: boolean) {
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
  if (!s) return <span className="vtk-rev-flag">{nl ? 'geen bron' : 'no source'}</span>;
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
    const last = row.lastCheck;
    const status = open
      ? open.status
      : last?.status === 'ok'
        ? 'ok'
        : row.checkedAt
          ? 'confirmed'
          : isLink
            ? 'unchecked'
            : 'nolink';
    const statusText: Record<string, string> = nl
      ? {
          ok: `prijs klopt (${shortStamp(last?.at, nl)})`,
          confirmed: `nagekeken op ${shortDate(row.checkedAt, nl)}`,
          changed: `${shopName(open?.shop)} vraagt nu ${money(open?.price ?? 0)}`,
          notfound: 'product niet meer te vinden',
          failed: 'geen antwoord van de winkel',
          unchecked: 'niet nagekeken',
          nolink: 'geen link',
        }
      : {
          ok: `price correct (${shortStamp(last?.at, nl)})`,
          confirmed: `checked on ${shortDate(row.checkedAt, nl)}`,
          changed: `now ${money(open?.price ?? 0, false)}`,
          notfound: 'product not found',
          failed: 'no answer from the shop',
          unchecked: 'not checked',
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
        <span className="vtk-rev-status" data-status={status}>
          {statusText[status]}
        </span>
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
    </span>
  );
}

function hostLabel(url: string | undefined): string {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '');
  } catch {
    return 'Webshop';
  }
}

function shortStamp(iso: string | undefined, nl: boolean): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(nl ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Brussels',
  });
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
  return <span className={value < -0.004 ? 'neg' : value > 0.004 ? 'pos' : ''}>{signedMoney(value, nl)}</span>;
}

function SectionTable({
  content,
  ctx,
  section,
  nl,
  result,
  checksByRow,
}: {
  content: BudgetContent;
  ctx: CalcContext;
  section: Section;
  nl: boolean;
  result: boolean;
  checksByRow: Map<string, Check[]>;
}) {
  const income = section.type === 'income';
  const amount = sectionAmount(content, ctx, section);
  return (
    <section className="vtk-rev-sec" aria-label={section.name}>
      <header className="vtk-rev-sec-head">
        <h3>
          {section.name}
          <span>
            {income
              ? nl
                ? 'inkomsten'
                : 'income'
              : section.type === 'fixed'
                ? nl
                  ? 'vaste kosten'
                  : 'fixed costs'
                : nl
                  ? 'variabele kosten'
                  : 'variable costs'}
          </span>
        </h3>
        <div className="vtk-rev-sec-sum">
          <b>{money(amount, nl)}</b>
          {result && (
            <span>
              {nl ? 'resultaat' : 'result'} <b>{money(sectionResult(section), nl)}</b>
            </span>
          )}
        </div>
      </header>
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
                        {money(a, nl)}
                      </td>
                      {result && (
                        <td className="num" data-label={nl ? 'Resultaat' : 'Result'}>
                          {row.result == null ? '–' : money(row.result, nl)}
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
                  <tr key={row.id} data-level={level} title={level ? checks.map((c) => c.text).join('\n') : undefined}>
                    <td className="vtk-rev-name">
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
                      {row.forfait || row.rest ? '' : money(priceOf(content, ctx, row), nl)}
                      {vat && <span className="vtk-rev-sub">{vat}</span>}
                    </td>
                    <td className="num vtk-rev-amount" data-label="Budget">
                      {row.rest ? '' : money(a, nl)}
                    </td>
                    {result && (
                      <td className="num" data-label={nl ? 'Resultaat' : 'Result'}>
                        {row.result == null ? '–' : money(row.result, nl)}
                      </td>
                    )}
                    {result && (
                      <td className="num" data-label={nl ? 'Verschil' : 'Diff.'}>
                        {/* Een kost die lager uitvalt, is goed nieuws: budget min resultaat. */}
                        <Diff value={row.result == null ? null : a - row.result} nl={nl} />
                      </td>
                    )}
                    <td className="vtk-rev-source" data-label={nl ? 'Bron' : 'Source'}>
                      {sourceCell(content, ctx, row, nl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
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
}) {
  const nl = locale === 'nl';
  const o = overviewOf(content, ctx);
  const result = hasResult(content);
  const r = result ? resultOverviewOf(content, ctx) : null;
  const p = content.params;
  const blocks = checks.filter((c) => c.level === 'block');
  const reviews = checks.filter((c) => c.level === 'review');
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
            <dd>{money(o.income, nl)}</dd>
            {r && <dd className="res">{money(r.income, nl)}</dd>}
          </div>
          <div>
            <dt>{nl ? 'Uitgaven' : 'Expenses'}</dt>
            <dd>{money(o.expense, nl)}</dd>
            {r && <dd className="res">{money(r.expense, nl)}</dd>}
          </div>
          <div className="total">
            <dt>{nl ? 'Totaal' : 'Total'}</dt>
            <dd className={o.total < -0.004 ? 'neg' : ''}>{money(o.total, nl)}</dd>
            {r && <dd className="res">{money(r.total, nl)}</dd>}
          </div>
          <div>
            <dt>{nl ? 'Begroting' : 'Yearly budget'}</dt>
            <dd>{o.begroting == null ? '–' : money(o.begroting, nl)}</dd>
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
          {nl ? 'Aandeel' : 'Share of'} {vtkShare.org}: <b>{money(o.total * vtkShare.share, nl)}</b>
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
                  <td className="num">{money(m.total, nl)}</td>
                  <td className="num">{m.result == null ? '–' : money(m.result, nl)}</td>
                </tr>
              ))}
              <tr className="self">
                <td className="vtk-rev-name">
                  {title} <span className="vtk-rev-tag">{nl ? 'dit budget' : 'this budget'}</span>
                </td>
                <td>{targetDate ? shortDate(targetDate, nl) : '–'}</td>
                <td className="num">{money(o.total, nl)}</td>
                <td className="num">{r ? money(r.total, nl) : '–'}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{nl ? 'Samen' : 'Together'}</td>
                <td className="num">{money(o.total + pot.othersTotal, nl)}</td>
                <td className="num">{money((r ? r.total : o.total) + pot.othersResult, nl)}</td>
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

      {(blocks.length > 0 || reviews.length > 0) && (
        <section className="vtk-rev-checks" aria-label={nl ? 'Aandachtspunten' : 'Points of attention'}>
          <h3>
            {nl ? 'Aandachtspunten' : 'Points of attention'}
            <span>{blocks.length + reviews.length}</span>
          </h3>
          <ul>
            {blocks.map((c, i) => (
              <li key={`b${i}`} data-level="block">
                {c.text}
              </li>
            ))}
            {reviews.map((c, i) => (
              <li key={`r${i}`} data-level="review">
                {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      {blocks.length === 0 && reviews.length === 0 && (
        <p className="vtk-rev-clean">
          {nl
            ? 'Geen aandachtspunten: elke regel heeft een bron, de verdelingen kloppen en het totaal blijft binnen de begroting.'
            : 'Nothing to flag: every row has a source, the splits add up and the total stays within the yearly budget.'}
        </p>
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
        />
      ))}
    </article>
  );
}
