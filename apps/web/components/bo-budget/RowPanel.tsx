'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ConfirmDialog } from '@vtk/ui';
import { CloseIcon, ExternalLinkIcon } from '@/components/ui/icons';
import {
  costAmount,
  findCostRow,
  incomeAmount,
  incomeCount,
  locationOf,
  locationValue,
  orderUnits,
  restShare,
  unitAmount,
  unitsOf,
} from '@/lib/bo/budget/calc';
import {
  AUDIENCES,
  type Audience,
  type CostRow,
  type CostSection,
  type IncomeRow,
  type IncomeSection,
  type SourceType,
} from '@/lib/bo/budget/types';
import { parseCollectGoUrl } from '@/lib/collectgo/product';
import { shopPriceOf } from '@/lib/bo/budget/prices';
import type { EditorApi } from './editorApi';
import { money, percent, plain, todayIso, shortDate } from './format';
import { NumberField } from './NumberField';

/*
 * Alles over één regel, in een paneel rechts: wat in de tabel geen plaats
 * heeft (bron, BTW, Flesserke, opmerking) en hoe de site het bedrag rekent.
 * Het paneel bewaart niets zelf: elke wijziging gaat naar het budget, dat de
 * editor even later bewaart.
 */

const SOURCE_LABELS: Record<SourceType, [string, string]> = {
  webshop: ['Webshop', 'Web shop'],
  collectgo: ['Collect&Go', 'Collect&Go'],
  offerte: ['Offerte', 'Quote'],
  flesserke: ['Flesserke', 'Flesserke'],
  afspraak: ['Vaste afspraak', 'Fixed agreement'],
  locatie: ['Locatie', 'Venue'],
};

const AUDIENCE_LABELS: Record<(typeof AUDIENCES)[number], [string, string]> = {
  leden: ['Leden', 'Members'],
  nietleden: ['Niet-leden', 'Non-members'],
  ereleden: ['Ereleden', 'Honorary members'],
  genodigden: ['Genodigden', 'Guests'],
};

function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`vtk-bud-field${wide ? ' wide' : ''}`}>
      <span className="vtk-bud-label">{label}</span>
      {children}
      {hint ? <span className="vtk-bud-hint">{hint}</span> : null}
    </div>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | null;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="vtk-bud-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- Prijs bij Collect&Go */

function when(iso: string, nl: boolean) {
  return new Date(iso).toLocaleString(nl ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
  });
}

/** Wat collectandgo.be zei over deze regel, met wat je ermee kan. */
function CollectGoCheck({ api, row }: { api: EditorApi; row: CostRow }) {
  const { nl } = api;
  const url = row.source?.url?.trim() ?? '';
  const checkable = !!url && !!parseCollectGoUrl(url);
  const busy = api.checkingRows?.includes(row.id) ?? false;
  const check = row.lastCheck;
  let text: string;
  if (!url)
    text = nl
      ? 'Plak de link van het product; dan kan de site de prijs bij Collect&Go nakijken.'
      : 'Paste the product link so the site can check the price.';
  else if (!checkable)
    text = nl
      ? 'Deze link wijst niet naar één product, dus de site kan de prijs niet nakijken. Open het product op collectandgo.be en kopieer die link; een zoeklink met #pdp_ erin werkt ook.'
      : 'This link does not point to one product, so the price cannot be checked. Open the product and copy that link.';
  else if (busy) text = nl ? 'Bezig met nakijken bij Collect&Go…' : 'Checking at Collect&Go…';
  else if (!check) text = nl ? 'Nog niet nagekeken bij Collect&Go.' : 'Not checked at Collect&Go yet.';
  else if (check.status === 'ok')
    text = nl
      ? `Klopt: ${money(check.price ?? 0)} voor "${check.name}" op collectandgo.be (${when(check.at, nl)}).`
      : `Correct: ${money(check.price ?? 0, false)} for "${check.name}" (${when(check.at, nl)}).`;
  else if (check.status === 'changed')
    text = nl
      ? `Collect&Go vraagt nu ${money(check.price ?? 0)} voor "${check.name}", de regel rekent met ${money(shopPriceOf(row))} (${when(check.at, nl)}).`
      : `Collect&Go now asks ${money(check.price ?? 0, false)} for "${check.name}"; the row uses ${money(shopPriceOf(row), false)}.`;
  else if (check.status === 'notfound')
    text = nl
      ? `Dit product staat niet (meer) op Collect&Go (${when(check.at, nl)}). Zoek het opnieuw en plak de link van het product.`
      : 'This product is no longer on Collect&Go. Find it again and paste the product link.';
  else
    text = nl
      ? `Collect&Go gaf geen prijs (${check.reason ?? 'geen antwoord'}, ${when(check.at, nl)}). Kijk de prijs na op de site en bevestig ze hieronder.`
      : `Collect&Go gave no price (${check.reason ?? 'no answer'}). Check it on the site and confirm below.`;

  return (
    <div
      className="vtk-bud-explain vtk-bud-cgcheck"
      data-status={check && checkable && !busy ? check.status : undefined}
    >
      <span>{text}</span>
      {checkable && !busy && (
        <span className="vtk-bud-inline">
          {check?.status === 'changed' && !api.readOnly && (
            <button type="button" className="vtk-bud-link" onClick={() => api.acceptPrice(row.id)}>
              {nl ? `${money(check.price ?? 0)} overnemen` : `Use ${money(check.price ?? 0, false)}`}
            </button>
          )}
          {api.liveCollectGo && (
            <button type="button" className="vtk-bud-link" onClick={() => api.checkPrices([row.id])}>
              {nl ? 'Nu nakijken' : 'Check now'}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Kostregel */

function CostRowFields({ api, section, row }: { api: EditorApi; section: CostSection; row: CostRow }) {
  const { nl, content, ctx } = api;
  const update = (change: (r: CostRow) => void) =>
    api.mutate((draft) => {
      const found = findCostRow(draft, row.id);
      if (found) change(found.row);
    });
  const variable = section.type === 'variable';
  const unit = unitAmount(content, ctx, row);
  const location = locationOf(content, ctx);
  const fromLocation = row.source?.type === 'locatie';
  const locValue = fromLocation && row.source?.field ? locationValue(content, ctx, row.source.field) : null;
  const units = unitsOf(content, section, row);
  const partners = section.rows.filter((r) => r.id !== row.id && !r.rest && !r.mixOf);

  if (row.rest) {
    return (
      <>
        <Field label={nl ? 'Naam' : 'Name'} wide>
          <input
            className="vtk-bud-input"
            value={row.name}
            onChange={(e) => update((r) => (r.name = e.target.value))}
          />
        </Field>
        <div className="vtk-bud-explain">
          {nl
            ? `Deze regel krijgt wat de andere regels van de verdeling overlaten (nu ${percent(restShare(content, section.id))}). Er wordt niets voor gekocht; een inkomregel kan er wel een eigen prijs voor vragen, zoals de waterprijs op een cantus.`
            : `This row gets what the other rows leave of the split (now ${percent(restShare(content, section.id), false)}). Nothing is bought for it; an income row can still charge its own price, like the water price at a cantus.`}
        </div>
      </>
    );
  }

  if (row.forfait) {
    return (
      <>
        <Field label={nl ? 'Naam' : 'Name'} wide>
          <input
            className="vtk-bud-input"
            value={row.name}
            onChange={(e) => update((r) => (r.name = e.target.value))}
          />
        </Field>
        <Field label={nl ? 'Bedrag' : 'Amount'}>
          <NumberField
            className="vtk-bud-input num"
            value={row.forfait.amount}
            decimals={2}
            onValue={(v) => update((r) => r.forfait && (r.forfait.amount = v ?? 0))}
          />
        </Field>
        <Field
          label={nl ? 'Waarom zonder berekening?' : 'Why without a calculation?'}
          hint={nl ? 'Verplicht. De GM en het BO lezen dit.' : 'Required. The review meeting and the board read this.'}
          wide
        >
          <textarea
            className="vtk-bud-input"
            rows={2}
            value={row.forfait.reason}
            placeholder={nl ? 'Bv. schatting gebaseerd op vorig jaar' : 'E.g. estimate based on last year'}
            onChange={(e) => update((r) => r.forfait && (r.forfait.reason = e.target.value))}
          />
        </Field>
        <button
          type="button"
          className="vtk-bud-link"
          onClick={() =>
            update((r) => {
              r.qty = 1;
              r.price = r.forfait?.amount ?? 0;
              r.forfait = null;
            })
          }
        >
          {nl ? 'Toch berekenen met aantal en prijs' : 'Calculate it with quantity and price after all'}
        </button>
      </>
    );
  }

  return (
    <>
      <Field label={nl ? 'Naam' : 'Name'} wide>
        <input className="vtk-bud-input" value={row.name} onChange={(e) => update((r) => (r.name = e.target.value))} />
      </Field>

      {row.service ? (
        <Field
          label={nl ? 'Aantal bestellingen' : 'Number of orders'}
          hint={
            nl
              ? `${money(ctx.settings.serviceCost)} per bestelling, uit de instellingen. Haal je het zelf, zet dan 0.`
              : `${money(ctx.settings.serviceCost, false)} per order, from the settings. Picking it up yourself? Use 0.`
          }
        >
          <NumberField
            className="vtk-bud-input num"
            value={row.qty ?? 0}
            onValue={(v) => update((r) => (r.qty = v ?? 0))}
          />
        </Field>
      ) : variable ? (
        <>
          {section.distribute && (
            <Field
              label={nl ? 'Deel van de verdeling' : 'Share of the split'}
              hint={
                row.mixOf
                  ? nl
                    ? 'Gedeeld met de partner in de mix.'
                    : 'Shared with its partner in the mix.'
                  : undefined
              }
            >
              {row.mixOf ? (
                <span className="vtk-bud-static">
                  {percent(section.rows.find((r) => r.id === row.mixOf)?.pct ?? 0, nl)}
                </span>
              ) : (
                <NumberField
                  className="vtk-bud-input num"
                  value={row.pct ?? 0}
                  percent
                  onValue={(v) => update((r) => (r.pct = v ?? 0))}
                />
              )}
            </Field>
          )}
          <Field
            label={nl ? 'Per persoon' : 'Per person'}
            hint={
              row.perPerson == null
                ? nl
                  ? `Die van de sectie: ${plain(section.perPerson ?? 1)}`
                  : `The section's: ${plain(section.perPerson ?? 1, false)}`
                : undefined
            }
          >
            <NumberField
              className="vtk-bud-input num"
              value={row.perPerson}
              allowEmpty
              placeholder={plain(section.perPerson ?? 1, nl)}
              onValue={(v) => update((r) => (v == null ? delete r.perPerson : (r.perPerson = v)))}
            />
          </Field>
          <Field label={nl ? 'Inhoud per eenheid' : 'Contents per unit'}>
            <NumberField
              className="vtk-bud-input num"
              value={row.perUnit}
              onValue={(v) => update((r) => (r.perUnit = v ?? 0))}
            />
          </Field>
          <Field label={nl ? 'Eenheid' : 'Unit'}>
            <input
              className="vtk-bud-input"
              value={row.unit ?? ''}
              placeholder={nl ? 'vat, fles, bak' : 'keg, bottle, crate'}
              onChange={(e) => update((r) => (r.unit = e.target.value))}
            />
          </Field>
          {section.distribute && (
            <Field
              label={nl ? 'Mix' : 'Mix'}
              hint={
                nl
                  ? 'Twee regels die samen één drankje zijn (Cava en Fruitsap voor een Mimosa) delen één percentage en tellen één keer.'
                  : 'Two rows that make one drink together share one percentage and count once.'
              }
              wide
            >
              <select
                className="vtk-bud-input"
                value={row.mixOf ?? ''}
                onChange={(e) => update((r) => (e.target.value ? (r.mixOf = e.target.value) : delete r.mixOf))}
              >
                <option value="">{nl ? 'Geen mix' : 'No mix'}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nl ? `Samen met ${p.name || 'regel zonder naam'}` : `Together with ${p.name || 'unnamed row'}`}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      ) : (
        <Field label={nl ? 'Aantal' : 'Quantity'}>
          <NumberField
            className="vtk-bud-input num"
            value={row.qty ?? 0}
            onValue={(v) => update((r) => (r.qty = v ?? 0))}
          />
        </Field>
      )}

      {!row.service && (
        <>
          <h3 className="vtk-bud-subhead">{nl ? 'Prijs en BTW' : 'Price and VAT'}</h3>
          {fromLocation ? (
            <Field
              label={nl ? `Prijs uit ${location?.name ?? 'de locatie'}` : `Price from ${location?.name ?? 'the venue'}`}
              hint={
                location
                  ? row.override == null
                    ? nl
                      ? 'Wijzigt mee wanneer Beheer de prijs van de zaal aanpast.'
                      : "Follows the venue's price when Finance changes it."
                    : undefined
                  : nl
                    ? 'Kies eerst de locatie bij Activiteit.'
                    : 'Choose the venue under Activity first.'
              }
              wide
            >
              <div className="vtk-bud-inline">
                <span className="vtk-bud-static">{locValue == null ? '–' : money(locValue, nl)}</span>
                {row.override == null ? (
                  <button
                    type="button"
                    className="vtk-bud-link"
                    onClick={() => update((r) => (r.override = locValue ?? 0))}
                  >
                    {nl ? 'Ander bedrag gebruiken' : 'Use a different amount'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="vtk-bud-link"
                    onClick={() =>
                      update((r) => {
                        r.override = null;
                        r.overrideReason = '';
                      })
                    }
                  >
                    {nl
                      ? `Toch ${locValue == null ? 'de prijs van de zaal' : money(locValue)} gebruiken`
                      : "Use the venue's price after all"}
                  </button>
                )}
              </div>
            </Field>
          ) : null}
          {(!fromLocation || row.override != null) && (
            <Field
              label={
                fromLocation
                  ? nl
                    ? 'Ander bedrag'
                    : 'Different amount'
                  : variable
                    ? nl
                      ? 'Prijs per eenheid'
                      : 'Price per unit'
                    : nl
                      ? 'Prijs per stuk'
                      : 'Price per item'
              }
            >
              <NumberField
                className="vtk-bud-input num"
                value={fromLocation ? row.override : (row.price ?? 0)}
                decimals={2}
                onValue={(v) => update((r) => (fromLocation ? (r.override = v ?? 0) : (r.price = v ?? 0)))}
              />
            </Field>
          )}
          {fromLocation && row.override != null && (
            <Field
              label={nl ? 'Waarom een ander bedrag?' : 'Why a different amount?'}
              hint={nl ? 'Verplicht zodra het afwijkt.' : 'Required once it differs.'}
              wide
            >
              <input
                className="vtk-bud-input"
                value={row.overrideReason ?? ''}
                placeholder={nl ? 'Bv. nieuwe offerte van de zaal' : 'E.g. new quote from the venue'}
                onChange={(e) => update((r) => (r.overrideReason = e.target.value))}
              />
            </Field>
          )}
          {!(fromLocation && row.override == null) && (
            <>
              <Field label={nl ? 'De prijs is' : 'The price is'}>
                <Seg
                  label={nl ? 'Incl. of excl. BTW' : 'Incl. or excl. VAT'}
                  value={row.basis ?? null}
                  options={[
                    ['incl', nl ? 'incl. BTW' : 'incl. VAT'],
                    ['excl', nl ? 'excl. BTW' : 'excl. VAT'],
                  ]}
                  onChange={(v) => update((r) => (r.basis = v))}
                />
              </Field>
              {row.basis === 'incl' && (
                <Field
                  label={nl ? 'BTW op dit product' : 'VAT on this product'}
                  hint={
                    nl
                      ? 'Eten en frisdrank 6 %, de rest meestal 21 %.'
                      : 'Food and soft drinks 6 %, most other things 21 %.'
                  }
                >
                  <Seg
                    label={nl ? 'BTW op dit product' : 'VAT on this product'}
                    value={String(row.productVat ?? 0.21)}
                    options={[
                      ['0.06', '6 %'],
                      ['0.21', '21 %'],
                      ['0', '0 %'],
                    ]}
                    onChange={(v) => update((r) => (r.productVat = Number(v)))}
                  />
                </Field>
              )}
            </>
          )}
          <div className="vtk-bud-explain">
            {unit.mode === 'norate'
              ? nl
                ? `Telt als ${money(unit.amount)} per ${variable ? row.unit || 'eenheid' : 'stuk'}: het BTW-tarief van deze post is nog niet ingevuld, dus elke prijs telt zoals ingetypt.`
                : `Counts as ${money(unit.amount, false)} each: this post's VAT rate is not set yet, so every price counts as typed.`
              : unit.mode === 'nobasis'
                ? nl
                  ? `Kies incl. of excl. BTW; tot dan telt ${money(unit.price)} zoals ingetypt.`
                  : `Choose incl. or excl. VAT; until then ${money(unit.price, false)} counts as typed.`
                : nl
                  ? `${unit.basis === 'incl' ? `${money(unit.price)} incl. ${percent(unit.productVat)} is ${money(unit.excl)} excl.` : `${money(unit.price)} excl.`} Met het tarief van de post (${percent(unit.rate)}) telt het als ${money(unit.amount)} per ${variable ? row.unit || 'eenheid' : 'stuk'}.`
                  : `${unit.basis === 'incl' ? `${money(unit.price, false)} incl. ${percent(unit.productVat, false)} is ${money(unit.excl, false)} excl.` : `${money(unit.price, false)} excl.`} With the post's rate (${percent(unit.rate, false)}) it counts as ${money(unit.amount, false)} each.`}
            {variable
              ? nl
                ? ` ${units} ${row.unit || 'eenheden'}, samen ${money(costAmount(content, ctx, section, row))}.`
                : ` ${units} ${row.unit || 'units'}, ${money(costAmount(content, ctx, section, row), false)} together.`
              : ''}
          </div>

          {!fromLocation && (
            <>
              <h3 className="vtk-bud-subhead">
                {nl ? 'Waar komt de prijs vandaan?' : 'Where does the price come from?'}
              </h3>
              <Field label={nl ? 'Bron' : 'Source'} wide>
                <select
                  className="vtk-bud-input"
                  value={row.source?.type ?? ''}
                  onChange={(e) =>
                    update(
                      (r) =>
                        (r.source = e.target.value ? { ...(r.source ?? {}), type: e.target.value as SourceType } : null)
                    )
                  }
                >
                  <option value="">{nl ? 'Kies een bron' : 'Choose a source'}</option>
                  {(['webshop', 'collectgo', 'offerte', 'flesserke', 'afspraak'] as const).map((t) => (
                    <option key={t} value={t}>
                      {SOURCE_LABELS[t][nl ? 0 : 1]}
                    </option>
                  ))}
                </select>
              </Field>
              {(row.source?.type === 'webshop' ||
                row.source?.type === 'collectgo' ||
                row.source?.type === 'offerte') && (
                <Field
                  label={
                    row.source.type === 'offerte'
                      ? nl
                        ? 'Link naar de offerte (optioneel)'
                        : 'Link to the quote (optional)'
                      : nl
                        ? 'Link naar het product'
                        : 'Link to the product'
                  }
                  wide
                >
                  <div className="vtk-bud-inline">
                    <input
                      className="vtk-bud-input"
                      value={row.source.url ?? ''}
                      placeholder="https://"
                      inputMode="url"
                      onChange={(e) => update((r) => r.source && (r.source.url = e.target.value))}
                    />
                    {row.source.url?.startsWith('http') && (
                      <a
                        className="vtk-bud-iconlink"
                        href={row.source.url}
                        target="_blank"
                        rel="noreferrer"
                        title={nl ? 'Link openen' : 'Open link'}
                        aria-label={nl ? `Link openen: ${row.name}` : `Open link: ${row.name}`}
                      >
                        <ExternalLinkIcon />
                      </a>
                    )}
                  </div>
                </Field>
              )}
              {(row.source?.type === 'afspraak' || row.source?.type === 'offerte') && (
                <Field
                  label={
                    row.source.type === 'afspraak'
                      ? nl
                        ? 'Wat is de afspraak?'
                        : 'What was agreed?'
                      : nl
                        ? 'Welke offerte?'
                        : 'Which quote?'
                  }
                  wide
                >
                  <input
                    className="vtk-bud-input"
                    value={row.source.note ?? ''}
                    placeholder={
                      row.source.type === 'afspraak'
                        ? nl
                          ? 'Bv. vaste prijs van de zaal'
                          : 'E.g. fixed price of the venue'
                        : nl
                          ? 'Bv. offerte OHL van 4 november'
                          : 'E.g. quote of 4 November'
                    }
                    onChange={(e) => update((r) => r.source && (r.source.note = e.target.value))}
                  />
                </Field>
              )}
              {row.source?.type === 'collectgo' && <CollectGoCheck api={api} row={row} />}
              {(row.source?.type === 'webshop' || row.source?.type === 'collectgo') && (
                <Field label={nl ? 'Prijs bevestigd' : 'Price confirmed'} wide>
                  <div className="vtk-bud-inline">
                    <span className="vtk-bud-static">
                      {row.checkedAt ? shortDate(row.checkedAt, nl) : nl ? 'Nog niet' : 'Not yet'}
                    </span>
                    <button
                      type="button"
                      className="vtk-bud-link"
                      onClick={() => update((r) => (r.checkedAt = todayIso()))}
                    >
                      {nl ? 'Prijs klopt, vandaag nagekeken' : 'Price is correct, checked today'}
                    </button>
                  </div>
                </Field>
              )}
            </>
          )}

          {(row.source?.type === 'collectgo' || row.source?.type === 'flesserke' || variable) && (
            <Field
              label={nl ? 'Uit Flesserke' : 'From Flesserke'}
              hint={
                nl
                  ? `Bij Collect&Go te bestellen: ${orderUnits(content, section, row)}. ${ctx.settings.flesserkeCounts ? 'Wat uit Flesserke komt, telt mee als kost.' : 'Wat uit Flesserke komt, telt niet mee als kost.'}`
                  : `To order at Collect&Go: ${orderUnits(content, section, row)}. ${ctx.settings.flesserkeCounts ? 'What comes from Flesserke counts as a cost.' : 'What comes from Flesserke does not count as a cost.'}`
              }
            >
              <NumberField
                className="vtk-bud-input num"
                value={row.flesserke ?? 0}
                onValue={(v) => update((r) => (r.flesserke = v || null))}
              />
            </Field>
          )}
        </>
      )}

      <Field label={nl ? 'Opmerking' : 'Note'} wide>
        <textarea
          className="vtk-bud-input"
          rows={2}
          value={row.note ?? ''}
          onChange={(e) => update((r) => (r.note = e.target.value))}
        />
      </Field>

      {!row.service && (
        <button
          type="button"
          className="vtk-bud-link"
          onClick={() => update((r) => (r.forfait = { amount: costAmount(content, ctx, section, r), reason: '' }))}
        >
          {nl ? 'Bedrag zonder berekening invullen' : 'Enter an amount without a calculation'}
        </button>
      )}
    </>
  );
}

/* --------------------------------------------------------------- Inkomregel */

function IncomeRowFields({ api, section, row }: { api: EditorApi; section: IncomeSection; row: IncomeRow }) {
  const { nl, content } = api;
  const update = (change: (r: IncomeRow) => void) =>
    api.mutate((draft) => {
      const s = draft.sections.find((x) => x.id === section.id);
      if (s?.type !== 'income') return;
      const r = s.rows.find((x) => x.id === row.id);
      if (r) change(r);
    });
  const variableRows = content.sections.flatMap((s) =>
    s.type === 'variable' ? s.rows.filter((r) => !r.rest).map((r) => ({ id: r.id, name: `${s.name}: ${r.name}` })) : []
  );
  const distSections = content.sections.filter((s) => s.type === 'variable' && s.distribute);
  const isCantus = content.params.memberShare != null;
  const countType = row.count.type;

  return (
    <>
      <Field label={nl ? 'Naam' : 'Name'} wide>
        <input className="vtk-bud-input" value={row.name} onChange={(e) => update((r) => (r.name = e.target.value))} />
      </Field>
      <h3 className="vtk-bud-subhead">{nl ? 'Aantal' : 'Quantity'}</h3>
      <Field label={nl ? 'Het aantal is' : 'The quantity is'} wide>
        <select
          className="vtk-bud-input"
          value={
            countType === 'audience' ? `audience:${row.count.type === 'audience' ? row.count.audience : ''}` : countType
          }
          onChange={(e) =>
            update((r) => {
              const v = e.target.value;
              if (v === 'manual') r.count = { type: 'manual', qty: incomeCount(content, r) };
              else if (v.startsWith('audience:')) r.count = { type: 'audience', audience: v.slice(9) as Audience };
              else if (v === 'consumption' || v === 'units') r.count = { type: v, rowId: variableRows[0]?.id ?? '' };
            })
          }
        >
          <option value="manual">{nl ? 'Een vast aantal' : 'A fixed number'}</option>
          {isCantus &&
            AUDIENCES.map((a) => (
              <option key={a} value={`audience:${a}`}>
                {nl
                  ? `De ${AUDIENCE_LABELS[a][0].toLowerCase()} uit de deelnemers`
                  : `The ${AUDIENCE_LABELS[a][1].toLowerCase()} among the participants`}
              </option>
            ))}
          {variableRows.length > 0 && (
            <option value="consumption">
              {nl ? 'Zoveel als er gedronken of gegeten wordt van' : 'As much as is consumed of'}
            </option>
          )}
          {variableRows.length > 0 && (
            <option value="units">{nl ? 'Zoveel als er gekocht wordt van' : 'As much as is bought of'}</option>
          )}
        </select>
      </Field>
      {row.count.type === 'manual' && (
        <Field label={nl ? 'Aantal' : 'Quantity'}>
          <NumberField
            className="vtk-bud-input num"
            value={row.count.qty}
            onValue={(v) => update((r) => r.count.type === 'manual' && (r.count.qty = v ?? 0))}
          />
        </Field>
      )}
      {(row.count.type === 'consumption' || row.count.type === 'units') && (
        <Field label={nl ? 'Van welke regel' : 'Of which row'} wide>
          <select
            className="vtk-bud-input"
            value={row.count.rowId}
            onChange={(e) =>
              update(
                (r) => (r.count.type === 'consumption' || r.count.type === 'units') && (r.count.rowId = e.target.value)
              )
            }
          >
            {variableRows.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="vtk-bud-explain">
        {nl ? `Nu ${incomeCount(content, row)}.` : `Now ${incomeCount(content, row)}.`}
      </div>

      <h3 className="vtk-bud-subhead">{nl ? 'Prijs' : 'Price'}</h3>
      {distSections.length > 0 && (
        <Field label={nl ? 'De prijs' : 'The price'} wide>
          <Seg
            label={nl ? 'Soort prijs' : 'Kind of price'}
            value={row.price.type}
            options={[
              ['manual', nl ? 'Eén prijs' : 'One price'],
              ['drinks', nl ? 'Hangt af van de drank' : 'Depends on the drink'],
            ]}
            onChange={(v) =>
              update((r) => {
                if (v === 'manual')
                  r.price = { type: 'manual', value: r.price.type === 'drinks' ? r.price.main : r.price.value };
                else
                  r.price = {
                    type: 'drinks',
                    sectionId: distSections[0].id,
                    main: r.price.type === 'manual' ? r.price.value : 0,
                    rest: 0,
                  };
              })
            }
          />
        </Field>
      )}
      {row.price.type === 'manual' ? (
        <Field label={nl ? 'Prijs' : 'Price'}>
          <NumberField
            className="vtk-bud-input num"
            value={row.price.value}
            decimals={2}
            onValue={(v) => update((r) => r.price.type === 'manual' && (r.price.value = v ?? 0))}
          />
        </Field>
      ) : (
        <>
          <Field label={nl ? 'Wie drinkt wat in' : 'Who drinks what in'} wide>
            <select
              className="vtk-bud-input"
              value={row.price.sectionId}
              onChange={(e) => update((r) => r.price.type === 'drinks' && (r.price.sectionId = e.target.value))}
            >
              {distSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={nl ? 'Prijs voor wie iets uit de verdeling drinkt' : 'Price for who drinks from the split'}>
            <NumberField
              className="vtk-bud-input num"
              value={row.price.main}
              decimals={2}
              onValue={(v) => update((r) => r.price.type === 'drinks' && (r.price.main = v ?? 0))}
            />
          </Field>
          <Field
            label={nl ? 'Prijs voor de rest' : 'Price for the rest'}
            hint={nl ? 'De waterprijs.' : 'The water price.'}
          >
            <NumberField
              className="vtk-bud-input num"
              value={row.price.rest}
              decimals={2}
              onValue={(v) => update((r) => r.price.type === 'drinks' && (r.price.rest = v ?? 0))}
            />
          </Field>
          <div className="vtk-bud-explain">
            {nl
              ? `${money(row.price.main)} × ${percent(1 - restShare(content, row.price.sectionId))} + ${money(row.price.rest)} × ${percent(restShare(content, row.price.sectionId))} = ${money(incomeAmount(content, row) / Math.max(1, incomeCount(content, row)))} per persoon.`
              : `${money(row.price.main, false)} × ${percent(1 - restShare(content, row.price.sectionId), false)} + ${money(row.price.rest, false)} × ${percent(restShare(content, row.price.sectionId), false)} per person.`}
          </div>
        </>
      )}
      <Field label={nl ? 'Opmerking' : 'Note'} wide>
        <textarea
          className="vtk-bud-input"
          rows={2}
          value={row.note ?? ''}
          onChange={(e) => update((r) => (r.note = e.target.value))}
        />
      </Field>
    </>
  );
}

/* ------------------------------------------------------------------- Paneel */

export function RowPanel({
  api,
  rowId,
  onClose,
  onDelete,
}: {
  api: EditorApi;
  rowId: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { nl, content, ctx, readOnly } = api;
  const panelRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  let found: { section: CostSection; row: CostRow } | { section: IncomeSection; row: IncomeRow } | null = null;
  for (const section of content.sections) {
    if (section.type === 'income') {
      const row = section.rows.find((r) => r.id === rowId);
      if (row) found = { section, row };
    } else {
      const row = section.rows.find((r) => r.id === rowId);
      if (row) found = { section, row };
    }
  }

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
  }, [rowId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !confirming) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirming]);

  if (!found) return null;
  const { section, row } = found;
  const isIncome = section.type === 'income';
  const amount = isIncome
    ? incomeAmount(content, row as IncomeRow)
    : costAmount(content, ctx, section as CostSection, row as CostRow);
  const checks = api.checksByRow.get(row.id) ?? [];

  return (
    <div className="vtk-bud-panel-root">
      <div className="vtk-bud-panel-bg" onClick={onClose} aria-hidden="true" />
      <div
        className="vtk-bud-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vtk-bud-panel-title"
        ref={panelRef}
      >
        <header className="vtk-bud-panel-head">
          <div>
            <span className="vtk-bud-panel-kicker">{section.name}</span>
            <h2 id="vtk-bud-panel-title">{row.name || (nl ? 'Regel zonder naam' : 'Row without a name')}</h2>
          </div>
          <div className="vtk-bud-panel-amount">
            <span>{nl ? 'Bedrag' : 'Amount'}</span>
            <b>{money(amount, nl)}</b>
          </div>
          <button
            type="button"
            className="vtk-bud-panel-close"
            onClick={onClose}
            aria-label={nl ? 'Paneel sluiten' : 'Close panel'}
            title={nl ? 'Sluiten' : 'Close'}
          >
            <CloseIcon />
          </button>
        </header>
        {checks.length > 0 && (
          <ul className="vtk-bud-panel-checks">
            {checks.map((c, i) => (
              <li key={i} data-level={c.level}>
                {c.text}
              </li>
            ))}
          </ul>
        )}
        <fieldset className="vtk-bud-panel-body" disabled={readOnly}>
          {isIncome ? (
            <IncomeRowFields api={api} section={section as IncomeSection} row={row as IncomeRow} />
          ) : (
            <CostRowFields api={api} section={section as CostSection} row={row as CostRow} />
          )}
        </fieldset>
        <footer className="vtk-bud-panel-foot">
          {!readOnly && (
            <Button variant="ghost" size="sm" className="vtk-bud-danger" onClick={() => setConfirming(true)}>
              {nl ? 'Regel verwijderen' : 'Delete row'}
            </Button>
          )}
          <Button size="sm" onClick={onClose}>
            {nl ? 'Klaar' : 'Done'}
          </Button>
        </footer>
      </div>
      <ConfirmDialog
        open={confirming}
        title={
          nl ? `"${row.name || 'Regel zonder naam'}" verwijderen?` : `Delete "${row.name || 'row without a name'}"?`
        }
        description={
          nl
            ? `De regel (${money(amount)}) verdwijnt uit ${section.name}. ${isIncome ? '' : 'Een inkomregel die erop rekende, telt daarna 0. '}De andere regels blijven staan.`
            : `The row (${money(amount, false)}) disappears from ${section.name}. The other rows stay.`
        }
        confirmLabel={nl ? 'Regel verwijderen' : 'Delete row'}
        cancelLabel={nl ? 'Annuleren' : 'Cancel'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
      />
    </div>
  );
}
