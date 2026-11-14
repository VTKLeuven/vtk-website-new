'use client';

import { useState, type ReactNode, type RefObject } from 'react';
import { Button } from '@vtk/ui';
import Link from '@/components/ui/Link';
import { IconButton } from '@/components/ui/IconButton';
import { InfoTip } from '@/components/ui/InfoTip';
import { PlusIcon, TrashIcon } from '@/components/ui/icons';
import { audienceCount, type Overview, type ResultOverview } from '@/lib/bo/budget/calc';
import type { Check } from '@/lib/bo/budget/checks';
import { CONTROL_TONE, PRICE_STATES, checkedWhen, type PriceState, type PriceSummary } from '@/lib/bo/budget/control';
import { scopeNames } from '@/lib/bo/budget/formula';
import type { BegrotingSheet } from '@/lib/bo/budget/begroting';
import type { Pot } from '@/lib/bo/budget/pot';
import { PRICE_TTL_MS } from '@/lib/bo/budget/prices';
import { newId } from '@/lib/bo/budget/templates';
import { POST_VAT_RATES, type BudgetSettings } from '@/lib/bo/budget/types';
import { CONTROL_ICON } from './ControlCell';
import type { EditorApi } from './editorApi';
import { money, percent, shortDate } from './format';
import { Money } from './Money';
import { NumberField } from './NumberField';

/*
 * De bovenkant van een budget, zoals het blad die had: links het Overzicht
 * (elke sectie met haar bedrag, de inkomsten, de uitgaven, het totaal en de
 * begroting), rechts de Parameters (de activiteit en waarmee gerekend wordt).
 * Daaronder de stand van de prijzen bij de webshops, met de knop om ze
 * opnieuw op te halen. Er is één weergave: wie maakt en wie nakijkt, zien
 * hetzelfde blad; wat niet mag wijzigen, staat er als tekst.
 */

/** Een controle onder het veld waar ze over gaat. */
function FieldNotes({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return null;
  return (
    <>
      {checks.map((c, i) => (
        <p key={i} className="vtk-bud-fieldnote" data-level={c.level}>
          {c.text}
        </p>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------- Overzicht */

export function OverviewCard({
  api,
  overview,
  result,
  pot,
  issuesBySection,
  missingBySection,
  notes,
  cardRef,
}: {
  api: EditorApi;
  overview: Overview;
  result: ResultOverview | null;
  pot: Pot | null;
  /** Hoeveel punten er per sectie openstaan (de bolletjes en de sectie zelf). */
  issuesBySection: Map<string, number>;
  /** Hoeveel regels per sectie nog geen resultaat hebben. */
  missingBySection: Map<string, number>;
  /** Wat over de begroting of het resultaat gaat. */
  notes: Check[];
  cardRef: RefObject<HTMLElement | null>;
}) {
  const { nl, content, readOnly, mutate } = api;
  const res = !!result;
  const resultLine = (id: string) => result?.lines.find((l) => l.id === id)?.amount ?? 0;
  const line = (l: Overview['lines'][number]) => {
    const issues = issuesBySection.get(l.id) ?? 0;
    const missing = missingBySection.get(l.id) ?? 0;
    const cost = l.side === 'out';
    return (
      <tr key={l.id}>
        <td>
          <a
            href={`#bud-sec-${l.id}`}
            onClick={(e) => {
              const el = document.getElementById(`bud-sec-${l.id}`);
              if (!el) return;
              e.preventDefault();
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {l.name || (nl ? 'Sectie zonder naam' : 'Unnamed section')}
          </a>
          {issues > 0 && <span className="vtk-bud-ov-issue">{nl ? `${issues} open` : `${issues} open`}</span>}
        </td>
        <td className="num">
          <Money cost={cost} value={l.amount} nl={nl} />
        </td>
        {res && (
          <td className="num">
            <Money cost={cost} value={resultLine(l.id)} nl={nl} />
            {missing > 0 && (
              <span className="vtk-bud-ov-miss">{nl ? `${missing} nog leeg` : `${missing} still empty`}</span>
            )}
          </td>
        )}
      </tr>
    );
  };
  const incomeLines = overview.lines.filter((l) => l.side === 'in');
  const costLines = overview.lines.filter((l) => l.side === 'out');
  const others = pot?.others.length ?? 0;

  return (
    <section className="vtk-bud-card vtk-bud-ovcard" aria-labelledby="bud-ov" ref={cardRef}>
      <header className="vtk-bud-cardhead">
        <h2 id="bud-ov">{nl ? 'Overzicht' : 'Overview'}</h2>
        {!readOnly && (
          <label className="vtk-bud-check">
            <input
              type="checkbox"
              checked={res}
              onChange={(e) => mutate((d) => (d.result = { ...(d.result ?? {}), on: e.target.checked }))}
            />
            <span>{nl ? 'Resultaat invullen' : 'Fill in the result'}</span>
          </label>
        )}
      </header>
      <table className="vtk-bud-ov">
        <thead>
          <tr>
            <th>
              <span className="sr-only">{nl ? 'Sectie' : 'Section'}</span>
            </th>
            <th className="num">Budget</th>
            {res && <th className="num">{nl ? 'Resultaat' : 'Result'}</th>}
          </tr>
        </thead>
        <tbody>
          {incomeLines.map(line)}
          <tr className="sum">
            <td>{nl ? 'Inkomsten' : 'Income'}</td>
            <td className="num">
              <Money value={overview.income} nl={nl} />
            </td>
            {res && (
              <td className="num">
                <Money value={result.income} nl={nl} />
              </td>
            )}
          </tr>
          {costLines.map(line)}
          <tr className="sum">
            <td>{nl ? 'Uitgaven' : 'Expenses'}</td>
            <td className="num">
              <Money cost value={overview.expense} nl={nl} />
            </td>
            {res && (
              <td className="num">
                <Money cost value={result.expense} nl={nl} />
              </td>
            )}
          </tr>
          <tr className="tot">
            <td>{nl ? 'Totaal' : 'Total'}</td>
            <td className="num">
              <Money value={overview.total} nl={nl} />
            </td>
            {res && (
              <td className="num">
                <Money value={result.total} nl={nl} />
              </td>
            )}
          </tr>
          <tr className="soft" id="bud-field-begroting">
            <td>
              <label htmlFor="bud-begroting">{nl ? 'Begroting' : 'Yearly budget'}</label>
            </td>
            <td className="num">
              {readOnly ? (
                <Money value={content.begroting} nl={nl} />
              ) : (
                <NumberField
                  id="bud-begroting"
                  className="vtk-bud-bare vtk-bud-cell num vtk-bud-begroting"
                  value={content.begroting}
                  decimals={2}
                  allowEmpty
                  placeholder={nl ? 'uit de begroting' : 'from the plan'}
                  onValue={(v) => mutate((d) => (d.begroting = v))}
                />
              )}
            </td>
            {res && (
              <td className="num">
                <Money value={content.begroting} nl={nl} />
              </td>
            )}
          </tr>
          <tr className="soft">
            <td>
              {others > 0
                ? nl
                  ? 'Potje tegenover begroting'
                  : 'Pot against the yearly budget'
                : nl
                  ? 'Verschil met begroting'
                  : 'Difference with plan'}
            </td>
            <td className="num">
              <Money signed value={overview.diff} nl={nl} />
            </td>
            {res && (
              <td className="num">
                <Money signed value={result.diffBegroting} nl={nl} />
              </td>
            )}
          </tr>
          {res && (
            <tr className="soft">
              <td>{nl ? 'Verschil met budget' : 'Difference with budget'}</td>
              <td />
              <td className="num">
                <Money signed value={result.diffBudget} nl={nl} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="vtk-bud-cardfoot">
        <FieldNotes checks={notes} />
        {res && (
          <label className="vtk-bud-field wide">
            <span className="vtk-bud-label">{nl ? 'Toelichting bij het resultaat' : 'About the result'}</span>
            {readOnly ? (
              <span className="vtk-bud-static">{content.result?.note?.trim() || '–'}</span>
            ) : (
              <textarea
                className="vtk-bud-input"
                rows={2}
                value={content.result?.note ?? ''}
                placeholder={
                  nl
                    ? 'Wat liep anders dan gebudgetteerd? Een tussentijds resultaat mag, je vult later aan.'
                    : 'What went differently? An interim result is fine.'
                }
                onChange={(e) => mutate((d) => (d.result = { on: true, note: e.target.value }))}
              />
            )}
          </label>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Parameters */

/** Eén rij label en waarde in de parameters. */
function Row({ label, htmlFor, children }: { label: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="vtk-bud-prow">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      <div>{children}</div>
    </div>
  );
}

const TEMPLATE_NAME: Record<string, [string, string]> = {
  cantus: ['Cantus', 'Cantus'],
  fakfeestje: ['Fakfeestje', 'Fak party'],
  sectornight: ['Sector Night', 'Sector Night'],
  import: ['Uit een rekenblad', 'From a spreadsheet'],
};

export function ParamsCard({
  api,
  settings,
  template,
  targetDate,
  onTargetDate,
  postName,
  settingsHref,
  begroting,
  pot,
  fieldChecks,
}: {
  api: EditorApi;
  settings: BudgetSettings;
  template: string;
  targetDate: string;
  onTargetDate: (value: string) => void;
  postName: string;
  settingsHref: string | null;
  begroting: { sheets: BegrotingSheet[]; suggested: string | null } | null;
  pot: Pot | null;
  /** De controles per veld (locatie, deelnemers, BTW, verdeling, BO). */
  fieldChecks: (field: NonNullable<Check['field']>) => Check[];
}) {
  const { nl, content, readOnly, mutate } = api;
  const p = content.params;
  const isCantus = p.memberShare != null;
  const location = content.info.location;
  const known = settings.locations.find((l) => l.name.toLowerCase() === location.trim().toLowerCase());
  const postRate = settings.vatByPost[api.ctx.postKey];
  const rate = content.vat?.rate ?? postRate;
  const tpl = TEMPLATE_NAME[template];

  return (
    <section className="vtk-bud-card vtk-bud-pmcard" aria-labelledby="bud-pm">
      <header className="vtk-bud-cardhead">
        <h2 id="bud-pm">{nl ? 'Parameters' : 'Parameters'}</h2>
        <span className="vtk-bud-muted">
          {nl ? 'Sjabloon' : 'Template'}: {tpl ? tpl[nl ? 0 : 1] : nl ? 'Standaard' : 'Standard'}
        </span>
      </header>
      <div className="vtk-bud-pm">
        <h3 className="vtk-bud-colhead">{nl ? 'Activiteit' : 'Activity'}</h3>
        <Row label={nl ? 'Voor het BO van' : 'For the meeting of'} htmlFor="bud-target">
          {readOnly ? (
            <b>{targetDate ? shortDate(targetDate, nl) : '–'}</b>
          ) : (
            <input
              id="bud-target"
              type="date"
              className="vtk-bud-bare vtk-bud-cell"
              value={targetDate}
              onChange={(e) => onTargetDate(e.target.value)}
            />
          )}
        </Row>
        <Row label={nl ? 'Datum' : 'Date'} htmlFor="bud-date">
          {readOnly ? (
            <b>{content.info.date ? shortDate(content.info.date, nl) : '–'}</b>
          ) : (
            <input
              id="bud-date"
              type="date"
              className="vtk-bud-bare vtk-bud-cell"
              value={content.info.date}
              onChange={(e) => mutate((d) => (d.info.date = e.target.value))}
            />
          )}
        </Row>
        <div id="bud-field-location">
          <Row label={nl ? 'Locatie' : 'Venue'} htmlFor="bud-location">
            {readOnly ? (
              <b>{location.trim() || '–'}</b>
            ) : (
              <>
                {settings.locations.length > 0 && (
                  <select
                    id="bud-location"
                    className="vtk-bud-bare vtk-bud-cell"
                    value={known ? known.name : location ? '__other' : ''}
                    onChange={(e) =>
                      mutate((d) => (d.info.location = e.target.value === '__other' ? ' ' : e.target.value))
                    }
                  >
                    <option value="">{nl ? 'Kies een locatie' : 'Choose a venue'}</option>
                    {settings.locations.map((l) => (
                      <option key={l.name} value={l.name}>
                        {l.name}
                        {l.capacity ? ` (${l.capacity} ${nl ? 'plaatsen' : 'places'})` : ''}
                      </option>
                    ))}
                    <option value="__other">{nl ? 'Een andere locatie' : 'Another venue'}</option>
                  </select>
                )}
                {(settings.locations.length === 0 || (!known && location !== '')) && (
                  <input
                    id={settings.locations.length === 0 ? 'bud-location' : undefined}
                    className="vtk-bud-bare vtk-bud-cell"
                    value={location.trim()}
                    aria-label={settings.locations.length > 0 ? (nl ? 'Andere locatie' : 'Other venue') : undefined}
                    placeholder={nl ? 'Waar gaat het door?' : 'Where is it?'}
                    onChange={(e) => mutate((d) => (d.info.location = e.target.value || ' '))}
                  />
                )}
              </>
            )}
          </Row>
        </div>
        {begroting && begroting.sheets.length > 0 && !readOnly ? (
          <BegrotingPicker
            sheets={begroting.sheets}
            suggested={begroting.suggested}
            value={content.begrotingRef ?? null}
            nl={nl}
            onPick={(ref, amount) =>
              mutate((d) => {
                d.begrotingRef = ref;
                if (amount != null) d.begroting = amount;
              })
            }
          />
        ) : content.begrotingRef ? (
          <Row label={nl ? 'Lijn in de begroting' : 'Budget line'}>
            <b>{content.begrotingRef.label}</b>
          </Row>
        ) : null}
        {content.begrotingRef && !readOnly && (
          <label className="vtk-bud-check">
            <input
              type="checkbox"
              checked={!!content.potPart || (pot?.others.length ?? 0) > 0}
              disabled={(pot?.others.length ?? 0) > 0}
              onChange={(e) => mutate((d) => (d.potPart = e.target.checked))}
            />
            <span>
              {nl ? 'Een potje: er komen meer budgetten op deze lijn' : 'A pot: more budgets will draw on this line'}
            </span>
          </label>
        )}
        <FieldNotes checks={[...fieldChecks('target'), ...fieldChecks('location')]} />

        <h3 className="vtk-bud-colhead" id="bud-field-persons">
          {nl ? 'Rekenen met' : 'Calculated with'}
          {!readOnly && (
            <InfoTip label={nl ? 'Berekeningen in een veld' : 'Calculations in a field'}>
              <p>
                {nl
                  ? 'Elk getalveld neemt ook een berekening aan, zoals een cel in het blad: typ "=" en reken met getallen en parameters.'
                  : 'Every number field also takes a calculation, like a cell in the sheet: type "=" and use numbers and parameters.'}
              </p>
              <p>
                {scopeNames(content, nl).map((n) => (
                  <code key={n.label} className="vtk-bud-code">
                    [{n.label}]
                  </code>
                ))}
              </p>
              <p>
                {nl
                  ? 'Bv. "=2,79/4", "=[Deelnemers]*30%" of "=omhoog(45/6)". Een veld met een berekening herken je aan de gele hoek.'
                  : 'E.g. "=2.79/4" or "=roundup(45/6)". A field with a calculation has a yellow corner.'}
              </p>
            </InfoTip>
          )}
        </h3>
        <Row label={nl ? 'Deelnemers' : 'Participants'} htmlFor="bud-persons">
          {readOnly ? (
            <b>{p.persons}</b>
          ) : (
            <NumberField
              id="bud-persons"
              className="vtk-bud-bare vtk-bud-cell num"
              value={p.persons}
              onValue={(v) => mutate((d) => (d.params.persons = v ?? 0))}
            />
          )}
        </Row>
        {isCantus && (
          <>
            <Row label={nl ? 'Genodigden' : 'Guests'} htmlFor="bud-guests">
              {readOnly ? (
                <b>{p.guests ?? 0}</b>
              ) : (
                <NumberField
                  id="bud-guests"
                  className="vtk-bud-bare vtk-bud-cell num"
                  value={p.guests ?? 0}
                  onValue={(v) => mutate((d) => (d.params.guests = v ?? 0))}
                />
              )}
            </Row>
            <Row label={nl ? 'Leden' : 'Members'} htmlFor="bud-members">
              {readOnly ? (
                <b>{percent(p.memberShare ?? 0, nl)}</b>
              ) : (
                <NumberField
                  id="bud-members"
                  className="vtk-bud-bare vtk-bud-cell num"
                  value={p.memberShare ?? 0}
                  percent
                  onValue={(v) => mutate((d) => (d.params.memberShare = v ?? 0))}
                />
              )}
            </Row>
            <Row label={nl ? 'Waarvan ereleden' : 'Of which honorary'} htmlFor="bud-honorary">
              {readOnly ? (
                <b>{percent(p.honoraryShare ?? 0, nl)}</b>
              ) : (
                <NumberField
                  id="bud-honorary"
                  className="vtk-bud-bare vtk-bud-cell num"
                  value={p.honoraryShare ?? 0}
                  percent
                  onValue={(v) => mutate((d) => (d.params.honoraryShare = v ?? 0))}
                />
              )}
            </Row>
            <p className="vtk-bud-fine">
              {nl
                ? `${audienceCount(content, 'leden')} betalende leden, ${audienceCount(content, 'nietleden')} niet-leden, ${audienceCount(content, 'ereleden')} ereleden en ${audienceCount(content, 'genodigden')} genodigden.`
                : `${audienceCount(content, 'leden')} paying members, ${audienceCount(content, 'nietleden')} non-members, ${audienceCount(content, 'ereleden')} honorary members and ${audienceCount(content, 'genodigden')} guests.`}
            </p>
          </>
        )}
        {(p.extra ?? []).map((x, i) =>
          readOnly ? (
            <Row key={x.id} label={x.name || '…'}>
              <b>
                {x.kind === 'percent'
                  ? percent(x.value, nl)
                  : x.kind === 'money'
                    ? `€ ${money(x.value, nl)}`
                    : x.value.toLocaleString(nl ? 'nl-BE' : 'en-GB')}
              </b>
            </Row>
          ) : (
            <div key={x.id} className="vtk-bud-prow vtk-bud-prow-param">
              <input
                className="vtk-bud-bare vtk-bud-cell"
                value={x.name}
                aria-label={nl ? 'Naam van de parameter' : 'Parameter name'}
                placeholder={nl ? 'Bv. Aantal bedrijven' : 'E.g. Companies'}
                onChange={(e) => mutate((d) => (d.params.extra![i].name = e.target.value))}
              />
              <div>
                <select
                  className="vtk-bud-bare vtk-bud-cell vtk-bud-kind"
                  value={x.kind ?? 'number'}
                  aria-label={nl ? `Soort van ${x.name || 'de parameter'}` : `Kind of ${x.name || 'the parameter'}`}
                  onChange={(e) =>
                    mutate((d) => (d.params.extra![i].kind = e.target.value as 'number' | 'percent' | 'money'))
                  }
                >
                  <option value="number">{nl ? 'aantal' : 'number'}</option>
                  <option value="percent">%</option>
                  <option value="money">€</option>
                </select>
                <NumberField
                  className="vtk-bud-bare vtk-bud-cell num"
                  value={x.value}
                  percent={x.kind === 'percent'}
                  decimals={x.kind === 'money' ? 2 : undefined}
                  aria-label={nl ? `Waarde van ${x.name || 'de parameter'}` : `Value of ${x.name || 'the parameter'}`}
                  formula={x.fx}
                  onFormula={(f) =>
                    mutate((d) => {
                      if (f) d.params.extra![i].fx = f;
                      else delete d.params.extra![i].fx;
                    })
                  }
                  onValue={(v) => mutate((d) => (d.params.extra![i].value = v ?? 0))}
                />
                <IconButton
                  label={nl ? 'Parameter weghalen' : 'Remove parameter'}
                  srLabel={nl ? `Parameter weghalen: ${x.name || 'zonder naam'}` : `Remove parameter: ${x.name}`}
                  onClick={() => mutate((d) => void d.params.extra!.splice(i, 1))}
                >
                  <TrashIcon />
                </IconButton>
              </div>
            </div>
          )
        )}
        {!readOnly && (p.extra?.length ?? 0) < 40 && (
          <button
            type="button"
            className="vtk-bud-add"
            onClick={() =>
              mutate((d) => {
                d.params.extra = [...(d.params.extra ?? []), { id: newId(), name: '', value: 0, kind: 'number' }];
              })
            }
          >
            <PlusIcon /> {nl ? 'Eigen parameter' : 'Own parameter'}
          </button>
        )}
        <FieldNotes checks={fieldChecks('persons')} />

        <h3 className="vtk-bud-colhead" id="bud-field-vat">
          {nl ? 'BTW en verdeling' : 'VAT and split'}
        </h3>
        <Row label={nl ? 'BTW' : 'VAT'}>
          {rate == null ? (
            <span className="vtk-bud-flag">{nl ? 'tarief nog niet ingevuld' : 'rate not set'}</span>
          ) : (
            <b>
              {percent(rate, nl)}
              {content.vat ? (nl ? ' (eigen tarief)' : ' (own rate)') : ` (${postName})`}
            </b>
          )}
        </Row>
        {!readOnly && (
          <label className="vtk-bud-check">
            <input
              type="checkbox"
              checked={!!content.vat}
              onChange={(e) =>
                mutate((d) => (d.vat = e.target.checked ? { rate: postRate ?? 0.21, reason: '' } : null))
              }
            />
            <span>{nl ? 'Dit budget rekent met een ander tarief' : 'This budget uses a different rate'}</span>
          </label>
        )}
        {content.vat && !readOnly && (
          <>
            <Row label={nl ? 'Tarief' : 'Rate'} htmlFor="bud-vat-rate">
              <select
                id="bud-vat-rate"
                className="vtk-bud-bare vtk-bud-cell"
                value={String(content.vat.rate)}
                onChange={(e) => mutate((d) => d.vat && (d.vat.rate = Number(e.target.value)))}
              >
                {POST_VAT_RATES.map((r) => (
                  <option key={r} value={String(r)}>
                    {percent(r, nl)}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={nl ? 'Waarom?' : 'Why?'} htmlFor="bud-vat-reason">
              <input
                id="bud-vat-reason"
                className="vtk-bud-bare vtk-bud-cell"
                value={content.vat.reason}
                placeholder={nl ? 'Verplicht' : 'Required'}
                onChange={(e) => mutate((d) => d.vat && (d.vat.reason = e.target.value))}
              />
            </Row>
          </>
        )}
        {content.vat && readOnly && content.vat.reason && (
          <Row label={nl ? 'Waarom?' : 'Why?'}>
            <b>{content.vat.reason}</b>
          </Row>
        )}
        {postRate == null && settingsHref && (
          <p className="vtk-bud-fine">
            <Link href={settingsHref} className="vtk-bud-link">
              {nl ? 'Tarieven per post' : 'Rates per post'}
            </Link>
          </p>
        )}
        <div id="bud-field-allocation">
          {content.allocation.map((a, i) =>
            readOnly || content.allocation.length === 1 ? (
              <Row key={i} label={content.allocation.length === 1 ? (nl ? 'Verdeling' : 'Split') : a.org}>
                <b>
                  {content.allocation.length === 1 ? `${a.org} ` : ''}
                  {percent(a.share, nl)}
                </b>
              </Row>
            ) : (
              <div key={i} className="vtk-bud-prow vtk-bud-prow-param">
                <input
                  className="vtk-bud-bare vtk-bud-cell"
                  value={a.org}
                  aria-label={nl ? 'Organisatie' : 'Organisation'}
                  onChange={(e) => mutate((d) => (d.allocation[i].org = e.target.value))}
                />
                <div>
                  <NumberField
                    className="vtk-bud-bare vtk-bud-cell num"
                    value={a.share}
                    percent
                    aria-label={nl ? `Aandeel van ${a.org}, in procent` : `Share of ${a.org}, in percent`}
                    onValue={(v) => mutate((d) => (d.allocation[i].share = v ?? 0))}
                  />
                  <IconButton
                    label={nl ? 'Organisatie weghalen' : 'Remove organisation'}
                    srLabel={nl ? `Organisatie weghalen: ${a.org}` : `Remove organisation: ${a.org}`}
                    onClick={() => mutate((d) => void d.allocation.splice(i, 1))}
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              </div>
            )
          )}
          {!readOnly && content.allocation.length < 4 && (
            <button
              type="button"
              className="vtk-bud-link"
              onClick={() => mutate((d) => void d.allocation.push({ org: '', share: 0 }))}
            >
              {nl ? 'Samen met een andere organisatie' : 'Together with another organisation'}
            </button>
          )}
        </div>
        <FieldNotes checks={[...fieldChecks('vat'), ...fieldChecks('allocation')]} />
      </div>
    </section>
  );
}

/** De lijn uit de begroting kiezen: het tabblad van de post staat voor, een ander kan ook. */
function BegrotingPicker({
  sheets,
  suggested,
  value,
  nl,
  onPick,
}: {
  sheets: BegrotingSheet[];
  suggested: string | null;
  value: { sheet: string; key: string; label: string } | null;
  nl: boolean;
  onPick: (ref: { sheet: string; key: string; label: string } | null, amount: number | null) => void;
}) {
  const [sheetName, setSheetName] = useState(value?.sheet ?? suggested ?? sheets[0].name);
  const sheet = sheets.find((s) => s.name === sheetName) ?? sheets[0];
  const groups = [...new Set(sheet.lines.map((l) => l.group))];
  const known = value ? sheets.find((s) => s.name === value.sheet)?.lines.some((l) => l.key === value.key) : true;
  return (
    <div id="bud-field-begrotingref">
      <Row label={nl ? 'Begroting: tabblad' : 'Budget: sheet'} htmlFor="bud-begr-sheet">
        <select
          id="bud-begr-sheet"
          className="vtk-bud-bare vtk-bud-cell"
          value={sheet.name}
          onChange={(e) => setSheetName(e.target.value)}
        >
          {sheets.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label={nl ? 'Lijn in de begroting' : 'Budget line'} htmlFor="bud-begr-line">
        <select
          id="bud-begr-line"
          className="vtk-bud-bare vtk-bud-cell"
          value={value && value.sheet === sheet.name ? value.key : ''}
          onChange={(e) => {
            const line = sheet.lines.find((l) => l.key === e.target.value);
            if (!line) return onPick(null, null);
            onPick(
              {
                sheet: sheet.name,
                key: line.key,
                label: `${sheet.name} › ${line.group ? `${line.group} › ` : ''}${line.name}`,
              },
              line.amount
            );
          }}
        >
          <option value="">{nl ? 'Kies de lijn' : 'Choose the line'}</option>
          {groups.map((group) => (
            <optgroup key={group || '-'} label={group || (nl ? 'Zonder kopje' : 'No heading')}>
              {sheet.lines
                .filter((l) => l.group === group)
                .map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.name} ({money(l.amount, nl)})
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </Row>
      {value && !known && (
        <p className="vtk-bud-fieldnote" data-level="block">
          {nl
            ? `"${value.label}" staat niet meer in de begroting die nu opgeladen is. Kies de lijn opnieuw.`
            : `"${value.label}" is no longer in the uploaded yearly budget. Choose the line again.`}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Potje */

export function PotCard({
  pot,
  title,
  total,
  resultTotal,
  diff,
  nl,
  potHref,
}: {
  pot: Pot;
  title: string;
  total: number;
  resultTotal: number | null;
  diff: number | null;
  nl: boolean;
  potHref: ((id: string) => string) | null;
}) {
  return (
    <section className="vtk-bud-card vtk-bud-potcard" aria-labelledby="bud-pot">
      <header className="vtk-bud-cardhead">
        <h2 id="bud-pot">
          {nl
            ? `Potje: ${pot.others.length + 1} budgetten op deze lijn`
            : `Pot: ${pot.others.length + 1} budgets on this line`}
        </h2>
      </header>
      <table className="vtk-bud-ov">
        <thead>
          <tr>
            <th>{nl ? 'Budget' : 'Budget'}</th>
            <th>BO</th>
            <th className="num">Budget</th>
            <th className="num">{nl ? 'Resultaat' : 'Result'}</th>
          </tr>
        </thead>
        <tbody>
          {pot.others.map((m) => (
            <tr key={m.id}>
              <td>{potHref ? <Link href={potHref(m.id)}>{m.title}</Link> : m.title}</td>
              <td>{m.targetDate ? shortDate(m.targetDate, nl) : '–'}</td>
              <td className="num">
                <Money value={m.total} nl={nl} />
              </td>
              <td className="num">
                <Money value={m.result} nl={nl} />
              </td>
            </tr>
          ))}
          <tr>
            <td>
              {title} <span className="vtk-bud-muted">({nl ? 'dit budget' : 'this budget'})</span>
            </td>
            <td />
            <td className="num">
              <Money value={total} nl={nl} />
            </td>
            <td className="num">
              <Money value={resultTotal} nl={nl} />
            </td>
          </tr>
          <tr className="sum">
            <td colSpan={2}>{nl ? 'Samen' : 'Together'}</td>
            <td className="num">
              <Money value={total + pot.othersTotal} nl={nl} />
            </td>
            <td className="num">
              <Money value={(resultTotal ?? total) + pot.othersResult} nl={nl} />
            </td>
          </tr>
          <tr className="soft">
            <td colSpan={2}>{nl ? 'Nog over van de begroting' : 'Left of the yearly budget'}</td>
            <td className="num">
              <Money signed value={diff} nl={nl} />
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/* ----------------------------------------------------------------- Prijzen */

const STATE_WORD: Record<PriceState, [string, string, string]> = {
  ok: ['klopt', 'kloppen', 'correct'],
  confirmed: ['zelf nagekeken', 'zelf nagekeken', 'checked by hand'],
  changed: ['gewijzigd', 'gewijzigd', 'changed'],
  notfound: ['niet meer te vinden', 'niet meer te vinden', 'not found'],
  failed: ['geen antwoord', 'geen antwoord', 'no answer'],
  waiting: ['wacht op een ronde', 'wachten op een ronde', 'waiting'],
  byhand: ['zelf na te kijken', 'zelf na te kijken', 'to check by hand'],
  nolink: ['zonder link', 'zonder link', 'no link'],
};

/**
 * De prijzen bij de webshops: hoe het ermee staat (geteld per stand, met
 * dezelfde iconen als de kolom Controle), wanneer de laatste ronde liep en
 * wanneer de volgende komt, en "Prijzen opnieuw ophalen".
 */
export function PricesBar({
  summary,
  nl,
  live,
  fixed,
  running,
  canForce,
  onForce,
  logHref,
}: {
  summary: PriceSummary;
  nl: boolean;
  /** Staat nakijken aan bij de instellingen? */
  live: boolean;
  /** Waarom de prijzen vastliggen, of null. */
  fixed: string | null;
  /** Hoeveel prijzen nu opgevraagd worden, of null. */
  running: number | null;
  canForce: boolean;
  onForce: () => void;
  /** Het logboek van de prijscontroles, voor wie het mag zien. */
  logHref: string | null;
}) {
  const last = summary.lastRound;
  const next = last ? new Date(Date.parse(last) + PRICE_TTL_MS).toISOString() : null;
  const status = !live
    ? nl
      ? 'Nakijken staat uit bij de instellingen.'
      : 'Checks are switched off in the settings.'
    : running != null
      ? nl
        ? `Bezig: ${running} ${running === 1 ? 'prijs' : 'prijzen'} bij de winkels opvragen…`
        : `Asking the shops for ${running} ${running === 1 ? 'price' : 'prices'}…`
      : fixed
        ? fixed
        : last
          ? nl
            ? `Laatst nagekeken op ${checkedWhen(last, nl)}. De site kijkt ze om de vier uur opnieuw na tot het BO, de volgende keer vanaf ${checkedWhen(next!, nl)}.`
            : `Last checked on ${checkedWhen(last, nl)}. The site checks them every four hours until the meeting, next from ${checkedWhen(next!, nl)}.`
          : nl
            ? 'Nog niet nagekeken. De site kijkt ze vanzelf na, om de vier uur tot het BO.'
            : 'Not checked yet. The site checks them every four hours until the meeting.';
  const counts = PRICE_STATES.filter((s) => summary.counts[s] > 0);
  return (
    <section className="vtk-bud-prices" aria-labelledby="bud-prices" data-running={running != null ? '1' : undefined}>
      <div className="vtk-bud-prices-text">
        <h2 id="bud-prices">{nl ? 'Prijzen bij de webshops' : 'Prices at the web shops'}</h2>
        <p role="status" aria-live="polite">
          {status}
        </p>
        {counts.length > 0 && (
          <ul className="vtk-bud-prices-counts">
            {counts.map((s) => {
              const Icon = CONTROL_ICON[s];
              const n = summary.counts[s];
              return (
                <li key={s} data-tone={CONTROL_TONE[s]}>
                  <Icon />
                  <span>
                    {n} {STATE_WORD[s][nl ? (n === 1 ? 0 : 1) : 2]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="vtk-bud-prices-actions">
        {canForce && live && !fixed && (
          <Button variant="ghost" size="sm" disabled={running != null} onClick={onForce}>
            {running != null
              ? nl
                ? 'Bezig met ophalen…'
                : 'Fetching…'
              : nl
                ? 'Prijzen opnieuw ophalen'
                : 'Fetch prices again'}
          </Button>
        )}
        {logHref && (
          <Link href={logHref} className="vtk-bud-link">
            {nl ? 'Logboek' : 'Log'}
          </Link>
        )}
      </div>
    </section>
  );
}
