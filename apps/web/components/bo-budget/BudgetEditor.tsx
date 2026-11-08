'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@vtk/ui';
import Link from '@/components/ui/Link';
import { DeleteButton } from '@/components/ui/DeleteIconButton';
import { ArrowRightIcon, PlusIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { UNSENT, unsentGuard } from '@/components/ui/unsentGuard';
import {
  checkCollectGoPricesAction,
  deleteBoBudgetAction,
  reopenBoBudgetAction,
  saveBoBudgetAction,
} from '@/app/actions/boBudgets';
import { allCostRows, audienceCount, overviewOf, type CalcContext } from '@/lib/bo/budget/calc';
import { checksOf, type Check } from '@/lib/bo/budget/checks';
import { acceptCheckedPrice, checkFromLookup, collectGoRows, isUncheckableCollectGo } from '@/lib/bo/budget/prices';
import { newId } from '@/lib/bo/budget/templates';
import {
  POST_VAT_RATES,
  type BudgetContent,
  type BudgetSettings,
  type CostRow,
  type PriceCheck,
  type Section,
} from '@/lib/bo/budget/types';
import type { EditorApi } from './editorApi';
import { money, percent, shortDate, signedMoney, todayIso } from './format';
import { NumberField } from './NumberField';
import { RowPanel } from './RowPanel';
import { SectionCard } from './SectionCard';

/*
 * De editor van een budget op de site (/admin/bestuursorgaan/mijn/<id>).
 *
 * Werkt zoals een rekenblad: typen in de cel, en de site bewaart het zelf een
 * halve seconde later ("Bewaard om 22:41" bovenaan). Wat de site uitrekent
 * (eenheden, bedragen, het overzicht), staat grijs en is niet te typen. De
 * controles staan bovenaan, met een klik naar de regel; de balk onderaan
 * houdt het totaal en het indienen in beeld.
 */

export type EditorBudget = {
  id: string;
  version: string;
  title: string;
  template: string;
  status: 'DRAFT' | 'SUBMITTED';
  targetDate: string | null;
  postKey: string;
  content: BudgetContent;
};

type SaveStatus = { kind: 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'; at?: Date };

const ERRORS: Record<string, [string, string]> = {
  CHANGED_ELSEWHERE: [
    'Iemand anders wijzigde dit budget intussen. Herlaad de pagina om die versie te zien; je laatste wijziging is niet bewaard.',
    'Someone else changed this budget in the meantime. Reload the page to see that version; your last change was not saved.',
  ],
  ALREADY_SUBMITTED: [
    'Dit budget is al ingediend. Zet het terug in opmaak om te wijzigen.',
    'This budget has already been submitted. Reopen it to make changes.',
  ],
  NOT_YOUR_POST: ['Je zit niet (meer) in de post van dit budget.', "You are not (or no longer) in this budget's post."],
  TITLE_REQUIRED: ['Geef de activiteit een naam.', 'Give the activity a name.'],
  TITLE_TOO_LONG: ['De naam is te lang (hoogstens 200 tekens).', 'The name is too long (at most 200 characters).'],
  INVALID_DATE: ['Die datum klopt niet.', 'That date is not valid.'],
  INVALID_CONTENT: [
    'Een getal in het budget is te groot of ongeldig. Kijk de laatste wijziging na.',
    'A number in the budget is too large or invalid. Check your last change.',
  ],
  TARGET_REQUIRED: ['Kies eerst voor welk BO je het indient.', 'First choose which board meeting it is for.'],
  OPEN_CHECKS: ['Er staan nog punten open onder "Nog na te kijken voor het BO".', 'There are still open points.'],
  NOT_FOUND: ['Dit budget bestaat niet meer.', 'This budget no longer exists.'],
};

function errorText(code: string, nl: boolean): string {
  const pair = ERRORS[code];
  return pair ? pair[nl ? 0 : 1] : nl ? 'Bewaren lukte niet. Probeer het opnieuw.' : 'Saving failed. Try again.';
}

function time(d: Date | undefined, nl: boolean) {
  return d ? d.toLocaleTimeString(nl ? 'nl-BE' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
}

export function BudgetEditor({
  budget,
  postName,
  settings,
  locale,
  backHref,
  settingsHref,
}: {
  budget: EditorBudget;
  postName: string;
  settings: BudgetSettings;
  locale: 'nl' | 'en';
  backHref: string;
  settingsHref: string | null;
}) {
  const nl = locale === 'nl';
  const showToast = useToast();
  const [content, setContent] = useState(budget.content);
  const [title, setTitle] = useState(budget.title);
  const [targetDate, setTargetDate] = useState(budget.targetDate ?? '');
  const [status, setStatus] = useState(budget.status);
  const [save, setSave] = useState<SaveStatus>({ kind: 'saved' });
  const [panel, setPanel] = useState<string | null>(null);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [checking, setChecking] = useState<string[] | null>(null);
  const [priceSummary, setPriceSummary] = useState<string | null>(null);
  const readOnly = status !== 'DRAFT';

  const version = useRef(budget.version);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const saving = useRef(false);
  // Wat er bewaard moet worden; bijgewerkt na elke render, gelezen bij het bewaren.
  const latest = useRef({ content, title, targetDate });
  useEffect(() => {
    latest.current = { content, title, targetDate };
  }, [content, title, targetDate]);
  const panelOpener = useRef<HTMLElement | null>(null);
  const [tick, setTick] = useState(0);

  const ctx: CalcContext = useMemo(() => ({ postKey: budget.postKey, settings }), [budget.postKey, settings]);
  const overview = useMemo(() => overviewOf(content, ctx), [content, ctx]);
  const checks = useMemo(() => {
    const list = checksOf(content, ctx, nl);
    if (!title.trim())
      list.unshift({ level: 'block', text: nl ? 'Geef de activiteit een naam.' : 'Give the activity a name.' });
    return list;
  }, [content, ctx, nl, title]);
  const blocks = checks.filter((c) => c.level === 'block');
  const reviews = checks.filter((c) => c.level === 'review');
  const infos = checks.filter((c) => c.level === 'info');
  const checksByRow = useMemo(() => {
    const map = new Map<string, Check[]>();
    for (const c of checks) if (c.rowId) map.set(c.rowId, [...(map.get(c.rowId) ?? []), c]);
    return map;
  }, [checks]);

  const changed = useCallback(() => {
    revision.current += 1;
    setSave((s) => (s.kind === 'conflict' ? s : { kind: 'dirty', at: s.at }));
    setTick((t) => t + 1);
  }, []);

  const mutate = useCallback(
    (change: (draft: BudgetContent) => void) => {
      if (readOnly) return;
      setContent((prev) => {
        const next = structuredClone(prev);
        change(next);
        return next;
      });
      changed();
    },
    [readOnly, changed]
  );

  const persist = useCallback(async (): Promise<boolean> => {
    if (saving.current) return false;
    if (revision.current === savedRevision.current) return true;
    saving.current = true;
    const rev = revision.current;
    const snapshot = latest.current;
    setSave((s) => ({ kind: 'saving', at: s.at }));
    const result = await unsentGuard.run(() =>
      saveBoBudgetAction({
        id: budget.id,
        version: version.current,
        title: snapshot.title,
        targetDate: snapshot.targetDate || null,
        content: snapshot.content,
      })
    );
    saving.current = false;
    if (result === UNSENT) {
      setSave((s) => ({ kind: 'error', at: s.at }));
      return false;
    }
    if (result.status === 'success' && result.version) {
      version.current = result.version;
      savedRevision.current = rev;
      const clean = revision.current === rev;
      setSave({ kind: clean ? 'saved' : 'dirty', at: new Date() });
      if (!clean) setTick((t) => t + 1);
      return clean;
    }
    if (result.status === 'error') {
      setSave((s) => ({ kind: result.code === 'CHANGED_ELSEWHERE' ? 'conflict' : 'error', at: s.at }));
      showToast({ message: errorText(result.code, nl), variant: 'error', duration: 0 });
    }
    return false;
  }, [budget.id, nl, showToast]);

  // Een halve seconde na de laatste wijziging bewaren.
  useEffect(() => {
    if (readOnly || save.kind === 'conflict' || revision.current === savedRevision.current) return;
    const timer = window.setTimeout(() => void persist(), 600);
    return () => window.clearTimeout(timer);
  }, [tick, readOnly, persist, save.kind]);

  useEffect(() => {
    const dirty = save.kind === 'dirty' || save.kind === 'saving';
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save.kind]);

  const addRow = useCallback(
    (sectionId: string, kind: 'row' | 'forfait' | 'rest' = 'row') => {
      const id = newId();
      mutate((draft) => {
        const s = draft.sections.find((x) => x.id === sectionId);
        if (!s) return;
        if (s.type === 'income') {
          s.rows.push({ id, name: '', count: { type: 'manual', qty: 0 }, price: { type: 'manual', value: 0 } });
          return;
        }
        const row: CostRow =
          kind === 'forfait'
            ? { id, name: '', forfait: { amount: 0, reason: '' } }
            : kind === 'rest'
              ? { id, name: nl ? 'De rest' : 'The rest', rest: true }
              : s.type === 'variable'
                ? { id, name: '', pct: 0, perUnit: 1, price: 0, basis: null, productVat: 0.21, source: null }
                : { id, name: '', qty: 1, price: 0, basis: null, productVat: 0.21, source: null };
        s.rows.push(row);
      });
      setFocusRowId(id);
    },
    [mutate, nl]
  );

  const clearFocusRow = useCallback(() => setFocusRowId(null), []);

  const openRow = useCallback((rowId: string, opener?: HTMLElement | null) => {
    panelOpener.current = opener ?? (document.activeElement as HTMLElement | null);
    setPanel(rowId);
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    const opener = panelOpener.current;
    if (opener && document.contains(opener)) window.setTimeout(() => opener.focus(), 0);
  }, []);

  const api: EditorApi = {
    content,
    ctx,
    nl,
    readOnly,
    mutate,
    openRow,
    checksByRow,
    focusRowId,
    clearFocusRow,
    addRow,
    locationNames: settings.locations.map((l) => l.name),
    liveCollectGo: settings.collectGoLive && !readOnly,
    checkingRows: checking,
    checkPrices: (rowIds?: string[]) => void checkPrices(rowIds),
    acceptPrice: (rowId: string) =>
      mutate((d) => {
        for (const s of d.sections)
          if (s.type !== 'income') for (const r of s.rows) if (r.id === rowId) acceptCheckedPrice(r, todayIso());
      }),
  };

  function goTo(check: Check) {
    if (check.rowId) {
      openRow(check.rowId);
      return;
    }
    const target = check.sectionId ? `bud-sec-${check.sectionId}` : check.field ? `bud-field-${check.field}` : null;
    const el = target ? document.getElementById(target) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = el.matches('input, select, textarea') ? el : el.querySelector<HTMLElement>('input, select, textarea');
    window.setTimeout(() => input?.focus({ preventScroll: true }), 300);
  }

  const downloadHref = `${locale === 'en' ? '/en' : ''}/api/admin/bestuursorgaan/budget/${budget.id}${locale === 'en' ? '?taal=en' : ''}`;

  /** Eerst bewaren wat nog niet bewaard is: de download leest het budget uit de databank. */
  async function download(event: React.MouseEvent<HTMLAnchorElement>) {
    if (revision.current === savedRevision.current) return;
    event.preventDefault();
    const link = event.currentTarget;
    const ok = await persist();
    // Een bestand en geen pagina: dezelfde link opnieuw aanklikken, nu met alles bewaard.
    if (ok) link.click();
  }

  /** Vraagt de prijzen op bij collectandgo.be en zet het antwoord in de regels. */
  async function checkPrices(rowIds?: string[]) {
    const rows = collectGoRows(content).filter((r) => !rowIds || rowIds.includes(r.rowId));
    if (rows.length === 0) return;
    setChecking(rows.map((r) => r.rowId));
    const result = await unsentGuard.run(() => checkCollectGoPricesAction({ id: budget.id, rows }));
    setChecking(null);
    if (result === UNSENT) return;
    if (!result.ok) {
      showToast({
        message:
          result.code === 'DISABLED'
            ? nl
              ? 'Prijzen live nakijken staat uit bij de instellingen.'
              : 'Live price checks are switched off in the settings.'
            : errorText(result.code, nl),
        variant: 'error',
        duration: 0,
      });
      return;
    }
    const at = new Date().toISOString();
    // Eerst uitrekenen, dan pas in het budget zetten: de update van React loopt
    // pas bij de volgende render, en de samenvatting hieronder heeft ze nu nodig.
    const checks = new Map<string, PriceCheck>();
    for (const r of allCostRows(content)) {
      const hit = result.results.find((x) => x.rowId === r.id);
      if (hit) checks.set(r.id, checkFromLookup(r, hit.lookup, at));
    }
    const counts = { ok: 0, changed: 0, notfound: 0, failed: 0 };
    for (const c of checks.values()) counts[c.status] += 1;
    mutate((d) => {
      for (const s of d.sections) {
        if (s.type === 'income') continue;
        for (const r of s.rows) {
          const check = checks.get(r.id);
          if (!check) continue;
          r.lastCheck = check;
          if (check.status === 'ok') r.checkedAt = at.slice(0, 10);
        }
      }
    });
    const parts = [
      counts.ok ? (nl ? `${counts.ok} ${counts.ok === 1 ? 'klopt' : 'kloppen'}` : `${counts.ok} correct`) : null,
      counts.changed
        ? nl
          ? `${counts.changed} ${counts.changed === 1 ? 'is gewijzigd' : 'zijn gewijzigd'}`
          : `${counts.changed} changed`
        : null,
      counts.notfound ? (nl ? `${counts.notfound} niet meer te vinden` : `${counts.notfound} not found`) : null,
      counts.failed ? (nl ? `${counts.failed} zonder antwoord` : `${counts.failed} without an answer`) : null,
    ].filter(Boolean);
    const summary = nl ? `${parts.join(', ')}.` : `${parts.join(', ')}.`;
    setPriceSummary(summary);
    const trouble = counts.changed + counts.notfound + counts.failed;
    showToast({
      message: nl
        ? `Prijzen nagekeken: ${summary}${trouble ? ' Ze staan bij de controles.' : ''}`
        : `Prices checked: ${summary}`,
      variant: counts.failed && !counts.ok && !counts.changed ? 'warning' : 'success',
    });
  }

  async function reopen() {
    const result = await unsentGuard.run(() => reopenBoBudgetAction({ id: budget.id }));
    if (result === UNSENT) return;
    if (result.status === 'success' && result.version) {
      version.current = result.version;
      setStatus('DRAFT');
      showToast({
        message: nl
          ? 'Terug in opmaak. Dien het opnieuw in als je klaar bent.'
          : 'Back to draft. Submit it again when you are done.',
        variant: 'success',
      });
    } else if (result.status === 'error')
      showToast({ message: errorText(result.code, nl), variant: 'error', duration: 0 });
  }

  function addSection(type: Section['type']) {
    const id = newId();
    mutate((draft) => {
      const name =
        type === 'income'
          ? nl
            ? 'Inkomsten'
            : 'Income'
          : type === 'fixed'
            ? nl
              ? 'Vaste kosten'
              : 'Fixed costs'
            : nl
              ? 'Variabele kosten'
              : 'Variable costs';
      const section: Section =
        type === 'income'
          ? { id, name, type, rows: [] }
          : type === 'variable'
            ? { id, name, type, distribute: true, perPerson: 1, rows: [] }
            : { id, name, type, rows: [] };
      if (type === 'income') {
        const firstCost = draft.sections.findIndex((s) => s.type !== 'income');
        draft.sections.splice(firstCost < 0 ? draft.sections.length : firstCost, 0, section);
      } else draft.sections.push(section);
    });
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`#bud-sec-${id} .vtk-bud-sec-name`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.select();
    }, 50);
  }

  const p = content.params;
  const isCantus = p.memberShare != null;
  const postRate = settings.vatByPost[budget.postKey];
  const location = content.info.location;
  const knownLocation = settings.locations.some((l) => l.name.toLowerCase() === location.trim().toLowerCase());
  const incomeLines = overview.lines.filter((l) => l.side === 'in');
  const costLines = overview.lines.filter((l) => l.side === 'out');

  const saveLabel = readOnly
    ? null
    : save.kind === 'saving'
      ? nl
        ? 'Bewaren…'
        : 'Saving…'
      : save.kind === 'dirty'
        ? nl
          ? 'Niet bewaarde wijzigingen'
          : 'Unsaved changes'
        : save.kind === 'error'
          ? nl
            ? 'Niet bewaard'
            : 'Not saved'
          : save.kind === 'conflict'
            ? nl
              ? 'Niet bewaard: iemand anders wijzigde het'
              : 'Not saved: changed elsewhere'
            : save.at
              ? nl
                ? `Bewaard om ${time(save.at, nl)}`
                : `Saved at ${time(save.at, nl)}`
              : nl
                ? 'Alles bewaard'
                : 'Everything saved';

  return (
    <div className="vtk-bud">
      {/* Meescrollende kop, zoals het evenementenformulier: wat je bewerkt, of
          het bewaard is, het totaal, en indienen. */}
      <div className="vtk-bud-top">
        <div className="vtk-bud-top-text">
          <nav className="vtk-bud-crumbs" aria-label={nl ? 'Kruimelpad' : 'Breadcrumb'}>
            <Link href={backHref}>{nl ? 'Mijn budgetten' : 'My budgets'}</Link>
            <span aria-hidden="true">/</span>
            <span>{postName}</span>
          </nav>
          <input
            className="vtk-bud-bare vtk-bud-title"
            value={title}
            disabled={readOnly}
            aria-label={nl ? 'Naam van de activiteit' : 'Activity name'}
            placeholder={nl ? 'Naam van de activiteit' : 'Activity name'}
            onChange={(e) => {
              setTitle(e.target.value);
              changed();
            }}
          />
        </div>
        <div className="vtk-bud-top-actions">
          <dl className="vtk-bud-top-figs">
            <div>
              <dt>{nl ? 'Totaal' : 'Total'}</dt>
              <dd className={overview.total < -0.004 ? 'neg' : ''}>{money(overview.total, nl)}</dd>
            </div>
            <div>
              <dt>{nl ? 'Tegenover begroting' : 'Against plan'}</dt>
              <dd className={overview.diff == null ? '' : overview.diff < -0.004 ? 'neg' : 'pos'}>
                {overview.diff == null ? '–' : signedMoney(overview.diff, nl)}
              </dd>
            </div>
          </dl>
          {readOnly ? (
            <span className="vtk-bo-pill" data-tone="ok">
              {nl ? 'Ingediend' : 'Submitted'}
            </span>
          ) : (
            <>
              {saveLabel && (
                <span className="vtk-bud-save" data-kind={save.kind} role="status" aria-live="polite">
                  {save.kind === 'error' ? (
                    <>
                      <span className="text-vtk-danger">{saveLabel}.</span>{' '}
                      <button type="button" className="vtk-bud-link" onClick={() => void persist()}>
                        {nl ? 'Opnieuw' : 'Retry'}
                      </button>
                    </>
                  ) : (
                    saveLabel
                  )}
                </span>
              )}
            </>
          )}
          {/* Zolang het BO met Drive werkt, gaat een budget als rekenblad naar de map Budgetten. */}
          <a
            href={downloadHref}
            className="vtk-bud-primary"
            onClick={(e) => void download(e)}
            aria-describedby="bud-submit-note"
          >
            {nl ? 'Download voor Drive' : 'Download for Drive'}
          </a>
        </div>
      </div>

      <dl className="vtk-bud-facts">
        <div>
          <dt>{nl ? 'Sjabloon' : 'Template'}</dt>
          <dd>{budget.template === 'cantus' ? 'Cantus' : nl ? 'Standaard' : 'Standard'}</dd>
        </div>
        <div id="bud-field-target">
          <dt>
            <label htmlFor="bud-target">{nl ? 'Voor het BO van' : 'For the meeting of'}</label>
          </dt>
          <dd>
            <input
              id="bud-target"
              type="date"
              className="vtk-bud-input vtk-bud-date"
              value={targetDate}
              disabled={readOnly}
              onChange={(e) => {
                setTargetDate(e.target.value);
                changed();
              }}
            />
          </dd>
        </div>
        <div>
          <dt>{nl ? 'Naar het BO' : 'To the board'}</dt>
          <dd id="bud-submit-note" className="vtk-bud-tobo">
            {blocks.length > 0 && (
              <button
                type="button"
                className="vtk-bud-open"
                onClick={() =>
                  document.getElementById('bud-checks')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                {nl
                  ? `Nog ${blocks.length} ${blocks.length === 1 ? 'punt' : 'punten'} open`
                  : `${blocks.length} open ${blocks.length === 1 ? 'point' : 'points'}`}
              </button>
            )}
            <span>
              {nl
                ? 'Download het rekenblad en zet het in de map Budgetten van die BO, zoals voordien.'
                : "Download the spreadsheet and put it in that meeting's Budgetten folder, as before."}
            </span>
          </dd>
        </div>
      </dl>

      {readOnly && (
        <div className="vtk-bud-banner">
          <div>
            <b>
              {nl
                ? `Ingediend voor het BO van ${shortDate(targetDate, nl)}.`
                : `Submitted for the meeting of ${shortDate(targetDate, nl)}.`}
            </b>{' '}
            {nl
              ? 'De GM kijkt het na; tot dan wijzig je niets. Moet er toch iets anders?'
              : 'It is being reviewed; until then nothing changes. Need to change something?'}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void reopen()}>
            {nl ? 'Terug in opmaak' : 'Back to draft'}
          </Button>
        </div>
      )}

      {/* Overzicht: zoals het blok bovenaan het blad, maar uit de regels gerekend. */}
      <section className="vtk-bud-card vtk-bud-overview" aria-labelledby="bud-ov">
        <h2 id="bud-ov" className="vtk-bud-h2">
          {nl ? 'Overzicht' : 'Overview'}
        </h2>
        <div className="vtk-bud-ov-cols">
          <div>
            <h3 className="vtk-bud-colhead">{nl ? 'Inkomsten' : 'Income'}</h3>
            <dl className="vtk-bud-ov-list">
              {incomeLines.length === 0 && <div className="vtk-bud-muted">{nl ? 'Geen' : 'None'}</div>}
              {incomeLines.map((l) => (
                <div key={l.id}>
                  <dt>
                    <a href={`#bud-sec-${l.id}`}>{l.name || '…'}</a>
                  </dt>
                  <dd>{money(l.amount, nl)}</dd>
                </div>
              ))}
              <div className="sum">
                <dt>{nl ? 'Inkomsten' : 'Income'}</dt>
                <dd>{money(overview.income, nl)}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="vtk-bud-colhead">{nl ? 'Uitgaven' : 'Expenses'}</h3>
            <dl className="vtk-bud-ov-list">
              {costLines.length === 0 && <div className="vtk-bud-muted">{nl ? 'Geen' : 'None'}</div>}
              {costLines.map((l) => (
                <div key={l.id}>
                  <dt>
                    <a href={`#bud-sec-${l.id}`}>{l.name || '…'}</a>
                  </dt>
                  <dd>{money(l.amount, nl)}</dd>
                </div>
              ))}
              <div className="sum">
                <dt>{nl ? 'Uitgaven' : 'Expenses'}</dt>
                <dd>{money(overview.expense, nl)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <dl className="vtk-bud-ov-total">
          <div>
            <dt>{nl ? 'Totaal' : 'Total'}</dt>
            <dd className={overview.total < -0.004 ? 'neg' : ''}>{money(overview.total, nl)}</dd>
          </div>
          <div id="bud-field-begroting">
            <dt>
              <label htmlFor="bud-begroting">{nl ? 'Begroting' : 'Yearly budget'}</label>
            </dt>
            <dd>
              <NumberField
                id="bud-begroting"
                className="vtk-bud-input num vtk-bud-begroting"
                value={content.begroting}
                decimals={2}
                allowEmpty
                disabled={readOnly}
                placeholder={nl ? 'uit de begroting' : 'from the plan'}
                onValue={(v) => mutate((d) => (d.begroting = v))}
              />
            </dd>
          </div>
          <div>
            <dt>{nl ? 'Verschil met begroting' : 'Difference with plan'}</dt>
            <dd className={overview.diff == null ? '' : overview.diff < -0.004 ? 'neg' : 'pos'}>
              {signedMoney(overview.diff, nl)}
            </dd>
          </div>
        </dl>
        <p className="vtk-bud-fine">
          {nl
            ? 'Een kost telt negatief in het totaal, zoals in het blad. De begroting is het bedrag dat de begrotings-BO voor deze activiteit voorzag.'
            : 'Costs count negatively in the total, as in the sheet. The yearly budget is what the budget meeting set aside for this activity.'}
        </p>
      </section>

      {/* Controles */}
      {(blocks.length > 0 || reviews.length > 0 || infos.length > 0) && (
        <section className="vtk-bud-card vtk-bud-checks" id="bud-checks" aria-labelledby="bud-checks-h">
          <h2 id="bud-checks-h" className="vtk-bud-h2">
            {blocks.length > 0
              ? nl
                ? `Nog na te kijken voor het BO (${blocks.length})`
                : `To fix before the board meeting (${blocks.length})`
              : nl
                ? 'Klaar voor het BO'
                : 'Ready for the board meeting'}
          </h2>
          {blocks.length > 0 && (
            <ul className="vtk-bud-checklist" data-level="block">
              {blocks.map((c, i) => (
                <li key={`b${i}`}>
                  <span>{c.text}</span>
                  {(c.rowId || c.sectionId || c.field) && (
                    <button type="button" className="vtk-bud-goto" onClick={() => goTo(c)}>
                      {c.rowId ? (nl ? 'Naar de regel' : 'Go to row') : nl ? 'Ernaartoe' : 'Go there'}{' '}
                      <ArrowRightIcon />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {reviews.length > 0 && (
            <>
              <h3 className="vtk-bud-colhead">{nl ? 'Mag, maar de GM kijkt het na' : 'Allowed, but reviewed'}</h3>
              <ul className="vtk-bud-checklist" data-level="review">
                {reviews.map((c, i) => (
                  <li key={`r${i}`}>
                    <span>{c.text}</span>
                    {(c.rowId || c.sectionId || c.field) && (
                      <button type="button" className="vtk-bud-goto" onClick={() => goTo(c)}>
                        {nl ? 'Bekijken' : 'View'} <ArrowRightIcon />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {infos.map((c, i) => (
            <p key={`i${i}`} className="vtk-bud-fine">
              {c.text}
            </p>
          ))}
        </section>
      )}

      {/* Prijzen bij Collect&Go: live opgevraagd op de productpagina. */}
      {(() => {
        const cgRows = allCostRows(content).filter((r) => r.source?.type === 'collectgo' && !r.forfait && !r.rest);
        if (cgRows.length === 0) return null;
        const checkable = collectGoRows(content).length;
        const loose = cgRows.filter(isUncheckableCollectGo).length;
        const noLink = cgRows.filter((r) => !r.source?.url?.trim()).length;
        const last = cgRows
          .map((r) => r.lastCheck?.at)
          .filter(Boolean)
          .sort()
          .at(-1);
        return (
          <section className="vtk-bud-card vtk-bud-prices" aria-labelledby="bud-prices">
            <div className="vtk-bud-prices-row">
              <div>
                <h2 id="bud-prices" className="vtk-bud-h2">
                  {nl ? 'Prijzen bij Collect&Go' : 'Prices at Collect&Go'}
                </h2>
                <p className="vtk-bud-fine">
                  {nl
                    ? `${checkable} van ${cgRows.length} ${cgRows.length === 1 ? 'regel wijst' : 'regels wijzen'} naar een product op collectandgo.be. ${last ? `Laatst nagekeken op ${new Date(last).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })}.` : 'Nog niet nagekeken.'}`
                    : `${checkable} of ${cgRows.length} rows point to a product on collectandgo.be. ${last ? `Last checked ${new Date(last).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })}.` : 'Not checked yet.'}`}
                  {loose + noLink > 0 &&
                    (nl
                      ? ` ${loose + noLink} zonder productlink: daar kijkt een mens de prijs na.`
                      : ` ${loose + noLink} without a product link: someone checks those by hand.`)}
                  {priceSummary && ` ${nl ? 'Net nagekeken:' : 'Just checked:'} ${priceSummary}`}
                  {!settings.collectGoLive &&
                    (nl
                      ? ' Live nakijken staat uit bij de instellingen.'
                      : ' Live checks are switched off in the settings.')}
                </p>
              </div>
              {settings.collectGoLive && !readOnly && checkable > 0 && (
                <Button size="sm" variant="ghost" onClick={() => void checkPrices()} disabled={checking !== null}>
                  {checking
                    ? nl
                      ? `Bezig met ${checking.length} ${checking.length === 1 ? 'prijs' : 'prijzen'}…`
                      : 'Checking…'
                    : nl
                      ? 'Prijzen nakijken'
                      : 'Check prices'}
                </Button>
              )}
            </div>
          </section>
        );
      })()}

      <fieldset className="vtk-bud-fieldset" disabled={readOnly}>
        {/* Activiteit */}
        <section className="vtk-bud-card" aria-labelledby="bud-act">
          <h2 id="bud-act" className="vtk-bud-h2">
            {nl ? 'Activiteit' : 'Activity'}
          </h2>
          <div className="vtk-bud-grid">
            <label className="vtk-bud-field">
              <span className="vtk-bud-label">{nl ? 'Datum' : 'Date'}</span>
              <input
                type="date"
                className="vtk-bud-input"
                value={content.info.date}
                onChange={(e) => mutate((d) => (d.info.date = e.target.value))}
              />
            </label>
            <div className="vtk-bud-field" id="bud-field-location">
              <label className="vtk-bud-label" htmlFor="bud-location">
                {nl ? 'Locatie' : 'Venue'}
              </label>
              {settings.locations.length > 0 ? (
                <select
                  id="bud-location"
                  className="vtk-bud-input"
                  value={
                    knownLocation
                      ? settings.locations.find((l) => l.name.toLowerCase() === location.trim().toLowerCase())!.name
                      : location
                        ? '__other'
                        : ''
                  }
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
              ) : null}
              {(settings.locations.length === 0 || (!knownLocation && location !== '')) && (
                <input
                  id={settings.locations.length === 0 ? 'bud-location' : undefined}
                  className="vtk-bud-input"
                  value={location.trim()}
                  placeholder={nl ? 'Waar gaat het door?' : 'Where is it?'}
                  onChange={(e) => mutate((d) => (d.info.location = e.target.value || ' '))}
                />
              )}
            </div>
            <label className="vtk-bud-field wide">
              <span className="vtk-bud-label">{nl ? 'Concept' : 'Concept'}</span>
              <textarea
                className="vtk-bud-input"
                rows={2}
                value={content.info.concept}
                placeholder={
                  nl
                    ? 'Wat is het, en waarom kost het wat het kost? Dit komt bij de toelichting op het BO.'
                    : 'What is it, and why does it cost what it costs?'
                }
                onChange={(e) => mutate((d) => (d.info.concept = e.target.value))}
              />
            </label>
          </div>

          <h3 className="vtk-bud-colhead" id="bud-field-persons">
            {nl ? 'Deelnemers' : 'Participants'}
          </h3>
          <div className="vtk-bud-grid">
            <label className="vtk-bud-field">
              <span className="vtk-bud-label">{nl ? 'Aantal deelnemers' : 'Participants'}</span>
              <NumberField
                className="vtk-bud-input num"
                value={p.persons}
                onValue={(v) => mutate((d) => (d.params.persons = v ?? 0))}
              />
            </label>
            {isCantus && (
              <>
                <label className="vtk-bud-field">
                  <span className="vtk-bud-label">{nl ? 'Genodigden' : 'Guests'}</span>
                  <NumberField
                    className="vtk-bud-input num"
                    value={p.guests ?? 0}
                    onValue={(v) => mutate((d) => (d.params.guests = v ?? 0))}
                  />
                </label>
                <label className="vtk-bud-field">
                  <span className="vtk-bud-label">{nl ? 'Leden (%)' : 'Members (%)'}</span>
                  <NumberField
                    className="vtk-bud-input num"
                    value={p.memberShare ?? 0}
                    percent
                    onValue={(v) => mutate((d) => (d.params.memberShare = v ?? 0))}
                  />
                </label>
                <label className="vtk-bud-field">
                  <span className="vtk-bud-label">{nl ? 'Waarvan ereleden (%)' : 'Of which honorary (%)'}</span>
                  <NumberField
                    className="vtk-bud-input num"
                    value={p.honoraryShare ?? 0}
                    percent
                    onValue={(v) => mutate((d) => (d.params.honoraryShare = v ?? 0))}
                  />
                </label>
              </>
            )}
          </div>
          {isCantus && (
            <p className="vtk-bud-fine">
              {nl
                ? `Dat zijn ${audienceCount(content, 'leden')} betalende leden, ${audienceCount(content, 'nietleden')} niet-leden, ${audienceCount(content, 'ereleden')} ereleden en ${audienceCount(content, 'genodigden')} genodigden.`
                : `That is ${audienceCount(content, 'leden')} paying members, ${audienceCount(content, 'nietleden')} non-members, ${audienceCount(content, 'ereleden')} honorary members and ${audienceCount(content, 'genodigden')} guests.`}
            </p>
          )}

          <h3 className="vtk-bud-colhead" id="bud-field-vat">
            {nl ? 'BTW' : 'VAT'}
          </h3>
          <div className="vtk-bud-vat">
            <p>
              {postRate == null
                ? nl
                  ? `Beheer vulde het tarief van ${postName} nog niet in. Tot dan telt elke prijs zoals ingetypt.`
                  : `Finance has not set ${postName}'s rate yet. Until then every price counts as typed.`
                : nl
                  ? `${postName} rekent met ${percent(postRate)}: een prijs excl. BTW telt × ${(1 + postRate).toLocaleString('nl-BE', { maximumFractionDigits: 3 })}, een winkelprijs wordt eerst omgerekend naar excl.`
                  : `${postName} uses ${percent(postRate, false)}: a price excl. VAT counts × ${1 + postRate}, a shop price is converted to excl. first.`}{' '}
              {settingsHref && (
                <Link href={settingsHref} className="vtk-bud-link">
                  {nl ? 'Tarieven per post' : 'Rates per post'}
                </Link>
              )}
            </p>
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
            {content.vat && (
              <div className="vtk-bud-grid">
                <label className="vtk-bud-field">
                  <span className="vtk-bud-label">{nl ? 'Tarief' : 'Rate'}</span>
                  <select
                    className="vtk-bud-input"
                    value={String(content.vat.rate)}
                    onChange={(e) => mutate((d) => d.vat && (d.vat.rate = Number(e.target.value)))}
                  >
                    {POST_VAT_RATES.map((r) => (
                      <option key={r} value={String(r)}>
                        {percent(r, nl)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="vtk-bud-field wide">
                  <span className="vtk-bud-label">{nl ? 'Waarom?' : 'Why?'}</span>
                  <input
                    className="vtk-bud-input"
                    value={content.vat.reason}
                    placeholder={nl ? 'Verplicht. Bv. samen met een andere post' : 'Required'}
                    onChange={(e) => mutate((d) => d.vat && (d.vat.reason = e.target.value))}
                  />
                </label>
              </div>
            )}
          </div>

          <h3 className="vtk-bud-colhead" id="bud-field-allocation">
            {nl ? 'Verdeling per organisatie' : 'Split per organisation'}
          </h3>
          <div className="vtk-bud-alloc">
            {content.allocation.map((a, i) => (
              <div key={i} className="vtk-bud-alloc-row">
                <input
                  className="vtk-bud-input"
                  value={a.org}
                  aria-label={nl ? 'Organisatie' : 'Organisation'}
                  onChange={(e) => mutate((d) => (d.allocation[i].org = e.target.value))}
                />
                <NumberField
                  className="vtk-bud-input num"
                  value={a.share}
                  percent
                  aria-label={nl ? `Aandeel van ${a.org}, in procent` : `Share of ${a.org}, in percent`}
                  onValue={(v) => mutate((d) => (d.allocation[i].share = v ?? 0))}
                />
                <span className="vtk-bud-muted">%</span>
                {content.allocation.length > 1 && (
                  <button
                    type="button"
                    className="vtk-bud-link"
                    onClick={() => mutate((d) => void d.allocation.splice(i, 1))}
                  >
                    {nl ? 'Weg' : 'Remove'}
                  </button>
                )}
              </div>
            ))}
            {content.allocation.length < 4 && (
              <button
                type="button"
                className="vtk-bud-link"
                onClick={() => mutate((d) => void d.allocation.push({ org: '', share: 0 }))}
              >
                {nl ? 'Samen met een andere organisatie' : 'Together with another organisation'}
              </button>
            )}
          </div>
        </section>

        {content.sections.map((section) => (
          <SectionCard
            key={section.id}
            api={api}
            section={section}
            onDelete={() => mutate((d) => void (d.sections = d.sections.filter((s) => s.id !== section.id)))}
          />
        ))}

        {!readOnly && (
          <div className="vtk-bud-addsec">
            <span>{nl ? 'Sectie toevoegen:' : 'Add a section:'}</span>
            <button type="button" className="vtk-bud-add" onClick={() => addSection('fixed')}>
              <PlusIcon /> {nl ? 'Vaste kosten' : 'Fixed costs'}
            </button>
            <button type="button" className="vtk-bud-add" onClick={() => addSection('variable')}>
              <PlusIcon /> {nl ? 'Variabele kosten' : 'Variable costs'}
            </button>
            <button type="button" className="vtk-bud-add" onClick={() => addSection('income')}>
              <PlusIcon /> {nl ? 'Inkomsten' : 'Income'}
            </button>
          </div>
        )}
      </fieldset>

      {!readOnly && (
        <div className="vtk-bud-danger-zone">
          <DeleteButton
            action={deleteBoBudgetAction}
            fields={{ id: budget.id, locale }}
            title={nl ? `"${title || 'Dit budget'}" verwijderen?` : `Delete "${title || 'this budget'}"?`}
            description={
              nl
                ? `Het budget met al zijn secties en regels verdwijnt van de site. Er is nog niets ingediend, dus het BO heeft het niet gezien. Andere budgetten en wat in Drive staat, blijven zoals ze zijn.`
                : `The budget with all its sections and rows disappears from the site. Other budgets and what is in Drive stay as they are.`
            }
            confirmLabel={nl ? 'Budget verwijderen' : 'Delete budget'}
            cancelLabel={nl ? 'Annuleren' : 'Cancel'}
            errorMessages={{ NOT_YOUR_POST: errorText('NOT_YOUR_POST', nl), NOT_FOUND: errorText('NOT_FOUND', nl) }}
            errorFallback={nl ? 'Verwijderen lukte niet.' : 'Deleting failed.'}
          >
            {nl ? 'Budget verwijderen' : 'Delete budget'}
          </DeleteButton>
        </div>
      )}

      {panel && (
        <RowPanel
          api={api}
          rowId={panel}
          onClose={closePanel}
          onDelete={() => {
            const id = panel;
            closePanel();
            mutate((d) => {
              for (const s of d.sections) {
                if (s.type === 'income') s.rows = s.rows.filter((r) => r.id !== id);
                else
                  s.rows = s.rows
                    .filter((r) => r.id !== id)
                    .map((r) => (r.mixOf === id ? { ...r, mixOf: undefined } : r));
              }
            });
          }}
        />
      )}
    </div>
  );
}
