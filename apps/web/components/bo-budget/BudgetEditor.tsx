'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@vtk/ui';
import Link from '@/components/ui/Link';
import { DeleteButton } from '@/components/ui/DeleteIconButton';
import { ArrowRightIcon, PlusIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { UNSENT, unsentGuard } from '@/components/ui/unsentGuard';
import {
  checkPricesAction,
  deleteBoBudgetAction,
  refreshPricesAction,
  rememberFixedPriceAction,
  reopenBoBudgetAction,
  saveBoBudgetAction,
} from '@/app/actions/boBudgets';
import {
  allCostRows,
  audienceCount,
  findCostRow,
  hasResult,
  overviewOf,
  priceOf,
  resultOverviewOf,
  type CalcContext,
} from '@/lib/bo/budget/calc';
import { checksOf, type Check } from '@/lib/bo/budget/checks';
import { applyFormulas, scopeNames } from '@/lib/bo/budget/formula';
import type { BegrotingSheet } from '@/lib/bo/budget/begroting';
import type { Pot } from '@/lib/bo/budget/pot';
import {
  acceptCheckedPrice,
  applyCheck,
  checkableRows,
  checkFromLookup,
  clearConfirmation,
  confirmRow,
} from '@/lib/bo/budget/prices';
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
import { money, percent, shortDate, todayIso } from './format';
import { Money } from './Money';
import { NumberField } from './NumberField';
import { BudgetReview } from './BudgetReview';
import { RowPanel } from './RowPanel';
import { ShareDialog } from './ShareDialog';
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

function stamp(iso: string, nl: boolean) {
  return new Date(iso).toLocaleString(nl ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
  });
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
  token = null,
  pot = null,
  begroting = null,
  share = null,
  initialView = 'maken',
  viewerName = '',
  canManage = false,
}: {
  budget: EditorBudget;
  postName: string;
  settings: BudgetSettings;
  locale: 'nl' | 'en';
  /** Null voor wie via een deellink binnenkwam: die heeft geen lijst om naar terug te gaan. */
  backHref: string | null;
  settingsHref: string | null;
  /** De deellink waarmee deze bezoeker bewaart, als hij geen lid van de post is. */
  token?: string | null;
  /** De andere budgetten op dezelfde begrotingslijn. */
  pot?: Pot | null;
  /** De begroting van het werkingsjaar, en het tabblad van deze post. */
  begroting?: { sheets: BegrotingSheet[]; suggested: string | null } | null;
  /** De deellinks van dit budget; null voor wie ze niet mag beheren. */
  share?: { viewToken: string | null; editToken: string | null; origin: string } | null;
  initialView?: 'maken' | 'nakijken';
  /** Wie een prijs met de hand bevestigt; de server zet de echte naam bij het bewaren. */
  viewerName?: string;
  /** Groep 5: mag een vaste prijs onthouden vanuit een budget. */
  canManage?: boolean;
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
  const readOnly = status !== 'DRAFT';
  const [view, setView] = useState<'maken' | 'nakijken'>(initialView);
  const [sharing, setSharing] = useState(false);

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

  const ctx: CalcContext = useMemo(
    () => ({
      postKey: budget.postKey,
      settings,
      pot: pot ? { others: pot.othersTotal, othersResult: pot.othersResult, count: pot.others.length } : null,
    }),
    [budget.postKey, settings, pot]
  );
  const resultOn = hasResult(content);
  const resultOverview = useMemo(() => (resultOn ? resultOverviewOf(content, ctx) : null), [resultOn, content, ctx]);
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
        // Elke berekening opnieuw: een parameter die wijzigt, werkt door in elke regel die ernaar verwijst.
        applyFormulas(next);
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
        token,
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
  }, [budget.id, nl, showToast, token]);

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
    checkPrices: (rowIds?: string[]) => void checkPrices(rowIds, true),
    resultOn,
    acceptPrice: (rowId: string) =>
      mutate((d) => {
        for (const s of d.sections)
          if (s.type !== 'income') for (const r of s.rows) if (r.id === rowId) acceptCheckedPrice(r);
      }),
    confirmPrice: (rowId: string, on: boolean) =>
      mutate((d) => {
        const found = findCostRow(d, rowId);
        if (!found) return;
        if (on) confirmRow(found.row, viewerName || (nl ? 'iemand met de deellink' : 'someone with the link'));
        else clearConfirmation(found.row);
      }),
    rememberFixed: canManage && !token ? (rowId: string) => void rememberFixed(rowId) : null,
  };

  /** Groep 5 onthoudt de prijs van deze regel als vaste prijs: geen enkel budget vraagt er nog een bron voor. */
  async function rememberFixed(rowId: string) {
    const found = findCostRow(content, rowId);
    if (!found || !found.row.name.trim()) return;
    const price = priceOf(content, ctx, found.row);
    const result = await unsentGuard.run(() =>
      rememberFixedPriceAction({ name: found.row.name, price, location: content.info.location.trim() })
    );
    if (result === UNSENT) return;
    if (result.status === 'success')
      showToast({
        message: nl
          ? `"${found.row.name}" staat bij de vaste prijzen${content.info.location.trim() ? ` van ${content.info.location.trim()}` : ''}. Geen budget vraagt er nog een bron voor.`
          : `"${found.row.name}" is now a fixed price.`,
        variant: 'success',
      });
    else if (result.status === 'error')
      showToast({
        message:
          result.code === 'TOO_MANY'
            ? nl
              ? 'Er staan al 300 vaste prijzen. Ruim eerst op bij de instellingen.'
              : 'There are already 300 fixed prices.'
            : nl
              ? 'De vaste prijs bewaren lukte niet. Heeft de regel een naam en een geldige prijs?'
              : 'Saving the fixed price failed.',
        variant: 'error',
        duration: 0,
      });
  }

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

  const downloadQuery = [locale === 'en' ? 'taal=en' : '', token ? `token=${token}` : ''].filter(Boolean).join('&');
  const downloadHref = `/api/admin/bestuursorgaan/budget/${budget.id}${downloadQuery ? `?${downloadQuery}` : ''}`;

  /** Eerst bewaren wat nog niet bewaard is: de download leest het budget uit de databank. */
  async function download(event: React.MouseEvent<HTMLAnchorElement>) {
    if (revision.current === savedRevision.current) return;
    event.preventDefault();
    const link = event.currentTarget;
    const ok = await persist();
    // Een bestand en geen pagina: dezelfde link opnieuw aanklikken, nu met alles bewaard.
    if (ok) link.click();
  }

  /**
   * Vraagt de prijs van regels op bij de webshop en zet het antwoord erin.
   * Vanzelf na een nieuwe of gewijzigde link (stil), of met "Nu nakijken" bij
   * een regel (dan vers bij de winkel, met een melding).
   */
  async function checkPrices(rowIds?: string[], manual = false) {
    const rows = checkableRows(content).filter((r) => !rowIds || rowIds.includes(r.rowId));
    if (rows.length === 0) return;
    setChecking(rows.map((r) => r.rowId));
    const result = await unsentGuard.run(() => checkPricesAction({ id: budget.id, rows, token, fresh: manual }));
    setChecking(null);
    if (result === UNSENT) return;
    if (!result.ok) {
      if (manual)
        showToast({
          message:
            result.code === 'DISABLED'
              ? nl
                ? 'Prijzen nakijken staat uit bij de instellingen.'
                : 'Price checks are switched off in the settings.'
              : errorText(result.code, nl),
          variant: 'error',
          duration: 0,
        });
      return;
    }
    const at = new Date().toISOString();
    const checks = new Map<string, PriceCheck>();
    for (const r of allCostRows(content)) {
      const hit = result.results.find((x) => x.rowId === r.id);
      if (hit) checks.set(r.id, checkFromLookup(r, hit.lookup, at));
    }
    mutate((d) => {
      for (const r of allCostRows(d)) {
        const check = checks.get(r.id);
        if (check) applyCheck(r, check);
      }
    });
    if (!manual) return;
    const check = [...checks.values()][0];
    if (!check) return;
    showToast({
      message:
        check.status === 'ok'
          ? nl
            ? 'De prijs klopt.'
            : 'The price is correct.'
          : check.status === 'changed'
            ? nl
              ? 'De winkel vraagt een andere prijs. Je ziet ze bij de regel.'
              : 'The shop asks a different price.'
            : check.status === 'notfound'
              ? nl
                ? 'Dit product staat niet meer bij de winkel.'
                : 'This product is no longer at the shop.'
              : nl
                ? `De winkel gaf geen prijs (${check.reason ?? 'geen antwoord'}).`
                : 'The shop gave no price.',
      variant: check.status === 'ok' ? 'success' : 'warning',
    });
  }

  // De prijzen vanzelf nakijken bij het openen, in beide weergaven. De server
  // houdt de klok bij (hoogstens om de vier uur per budget, en nooit meer eens
  // het budget langs het BO ging); wat ze antwoordt, staat al in de databank,
  // dus dit maakt de editor niet "gewijzigd".
  const refreshed = useRef(false);
  useEffect(() => {
    if (refreshed.current) return;
    refreshed.current = true;
    void (async () => {
      const result = await refreshPricesAction({ id: budget.id, token }).catch(() => null);
      if (!result || !result.ok || Object.keys(result.checks).length === 0) return;
      setContent((prev) => {
        const next = structuredClone(prev);
        for (const r of allCostRows(next)) if (result.checks[r.id]) r.lastCheck = result.checks[r.id];
        if (result.at) next.pricesAt = result.at;
        return next;
      });
    })();
  }, [budget.id, token]);

  // Een regel met een nieuwe of gewijzigde link naar een gekende winkel: meteen
  // nakijken, zonder knop. Elke link één poging; de rest volgt de ronde van vier uur.
  const tried = useRef(new Set<string>());
  const pendingKey =
    readOnly || !settings.collectGoLive
      ? ''
      : checkableRows(content)
          .filter((r) => !allCostRows(content).find((x) => x.id === r.rowId)?.lastCheck)
          .map((r) => `${r.rowId}|${r.url}`)
          .filter((k) => !tried.current.has(k))
          .join('\n');
  useEffect(() => {
    if (!pendingKey || checking) return;
    const timer = window.setTimeout(() => {
      const keys = pendingKey.split('\n');
      keys.forEach((k) => tried.current.add(k));
      void checkPrices(keys.map((k) => k.split('|')[0]));
    }, 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, checking]);

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

  /**
   * Een sectie erbij, onderaan, met een lege naam die meteen de focus krijgt:
   * de post kiest zelf hoe ze heet (Drank, Decoratie, Sponsoring) en hoeveel er
   * zijn. De soort bepaalt enkel hoe de regels rekenen.
   */
  function addSection(type: Section['type']) {
    const id = newId();
    mutate((draft) => {
      const section: Section =
        type === 'income'
          ? { id, name: '', type, rows: [] }
          : type === 'variable'
            ? { id, name: '', type, distribute: false, perPerson: 1, rows: [] }
            : { id, name: '', type, rows: [] };
      draft.sections.push(section);
    });
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`#bud-sec-${id} .vtk-bud-sec-name`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
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
            {backHref ? (
              <>
                <Link href={backHref}>{nl ? 'Mijn budgetten' : 'My budgets'}</Link>
                <span aria-hidden="true">/</span>
              </>
            ) : (
              <>
                <span>{nl ? 'Gedeeld budget' : 'Shared budget'}</span>
                <span aria-hidden="true">/</span>
              </>
            )}
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
              <dd className={overview.total < -0.004 ? 'neg' : ''}>
                <Money value={overview.total} nl={nl} />
              </dd>
            </div>
            <div>
              <dt>{nl ? 'Tegenover begroting' : 'Against plan'}</dt>
              <dd className={overview.diff == null ? '' : overview.diff < -0.004 ? 'neg' : 'pos'}>
                <Money signed value={overview.diff} nl={nl} />
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
          <div className="vtk-bud-views" role="group" aria-label={nl ? 'Weergave' : 'View'}>
            <button type="button" aria-pressed={view === 'maken'} onClick={() => setView('maken')}>
              {nl ? 'Maken' : 'Edit'}
            </button>
            <button type="button" aria-pressed={view === 'nakijken'} onClick={() => setView('nakijken')}>
              {nl ? 'Nakijken' : 'Review'}
              {blocks.length + reviews.length > 0 && (
                <span className="vtk-bud-views-count" data-level={blocks.length ? 'block' : 'review'}>
                  {blocks.length + reviews.length}
                </span>
              )}
            </button>
          </div>
          {share && (
            <button type="button" className="vtk-bud-ghost" onClick={() => setSharing(true)}>
              {nl ? 'Delen' : 'Share'}
            </button>
          )}
          {/* Zolang het BO met Drive werkt, gaat een budget als rekenblad naar de map Budgetten. */}
          <a
            href={downloadHref}
            className="vtk-bud-primary"
            onClick={(e) => void download(e)}
            aria-describedby="bud-submit-note"
          >
            {resultOn
              ? nl
                ? 'Download resultaat'
                : 'Download result'
              : nl
                ? 'Download voor Drive'
                : 'Download for Drive'}
          </a>
        </div>
      </div>

      {share && sharing && (
        <ShareDialog budgetId={budget.id} initial={share} locale={locale} onClose={() => setSharing(false)} />
      )}

      {view === 'nakijken' ? (
        <BudgetReview
          title={title}
          postName={postName}
          targetDate={targetDate || null}
          content={content}
          ctx={ctx}
          checks={checks}
          pot={pot}
          locale={locale}
          potHref={token ? undefined : (id) => `${locale === 'en' ? '/en' : ''}/admin/bestuursorgaan/mijn/${id}`}
          actions={
            readOnly
              ? undefined
              : {
                  confirm: api.confirmPrice,
                  accept: api.acceptPrice,
                  setPrice: (rowId, value) =>
                    mutate((d) => {
                      const found = findCostRow(d, rowId);
                      if (!found) return;
                      const r = found.row;
                      if (r.source?.type === 'locatie') r.override = value;
                      else r.price = value;
                      if (r.fx?.price) {
                        delete r.fx.price;
                        if (Object.keys(r.fx).length === 0) delete r.fx;
                      }
                      // Een bevestiging gold voor de vorige prijs.
                      clearConfirmation(r);
                    }),
                }
          }
        />
      ) : (
        <>
          <dl className="vtk-bud-facts">
            <div>
              <dt>{nl ? 'Sjabloon' : 'Template'}</dt>
              <dd>
                {(
                  {
                    cantus: 'Cantus',
                    fakfeestje: nl ? 'Fakfeestje' : 'Fak party',
                    sectornight: 'Sector Night',
                    import: nl ? 'Uit een rekenblad' : 'From a spreadsheet',
                  } as Record<string, string>
                )[budget.template] ?? (nl ? 'Standaard' : 'Standard')}
              </dd>
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
            {checkableRows(content).length > 0 && (
              <div>
                <dt>{nl ? 'Prijzen bij de webshops' : 'Prices at the web shops'}</dt>
                <dd className="vtk-bud-tobo">
                  <span>
                    {!settings.collectGoLive
                      ? nl
                        ? 'Nakijken staat uit bij de instellingen.'
                        : 'Checks are switched off in the settings.'
                      : checking
                        ? nl
                          ? `Bezig met ${checking.length} ${checking.length === 1 ? 'prijs' : 'prijzen'}…`
                          : 'Checking…'
                        : readOnly
                          ? nl
                            ? 'Liggen vast sinds het indienen.'
                            : 'Fixed since it was submitted.'
                          : targetDate && targetDate < todayIso()
                            ? nl
                              ? 'Liggen vast: het BO waarvoor dit budget was, is voorbij.'
                              : 'Fixed: the board meeting this budget was for has passed.'
                            : content.pricesAt
                              ? nl
                                ? `Vanzelf nagekeken, laatst op ${stamp(content.pricesAt, nl)}. Dat gebeurt om de vier uur, tot het BO.`
                                : `Checked automatically, last on ${stamp(content.pricesAt, nl)}.`
                              : nl
                                ? 'De site kijkt ze vanzelf na, om de vier uur tot het BO.'
                                : 'The site checks them automatically, every four hours.'}
                  </span>
                </dd>
              </div>
            )}
          </dl>

          {content.source && (
            <p className="vtk-bud-source">
              {nl ? 'Overgenomen uit ' : 'Taken from '}
              <b>{content.source.name}</b>
              {content.source.mode === 'overzicht'
                ? nl
                  ? '. De regels van dit blad kwamen niet op zijn totaal uit (een eigen indeling of meer tabbladen), dus staat hier één regel per post uit het overzicht; de details staan in het blad zelf.'
                  : '. Only the overview was taken over; the details are in the sheet itself.'
                : nl
                  ? '. Elke regel staat er zoals in het blad, als uitkomst: een variabele regel is hier het aantal eenheden tegen de prijs, zonder de verdeling erachter.'
                  : '. Every row is as in the sheet, as its outcome.'}
            </p>
          )}

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
            <div className="vtk-bud-ov-head">
              <h2 id="bud-ov" className="vtk-bud-h2">
                {nl ? 'Overzicht' : 'Overview'}
              </h2>
              {resultOn && (
                <span className="vtk-bud-ov-legend">
                  {nl ? 'budget' : 'budget'} <span className="vtk-bud-ov-res">{nl ? 'resultaat' : 'result'}</span>
                </span>
              )}
              <label className="vtk-bud-check vtk-bud-ov-toggle">
                <input
                  type="checkbox"
                  checked={resultOn}
                  disabled={readOnly}
                  onChange={(e) => mutate((d) => (d.result = { ...(d.result ?? {}), on: e.target.checked }))}
                />
                <span>{nl ? 'Resultaat invullen' : 'Fill in the result'}</span>
              </label>
            </div>
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
                      <dd>
                        <Money value={l.amount} nl={nl} />
                        {resultOverview && (
                          <span className="vtk-bud-ov-res">
                            <Money value={resultOverview.lines.find((x) => x.id === l.id)?.amount ?? 0} nl={nl} />
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                  <div className="sum">
                    <dt>{nl ? 'Inkomsten' : 'Income'}</dt>
                    <dd>
                      <Money value={overview.income} nl={nl} />
                      {resultOverview && <Money className="vtk-bud-ov-res" value={resultOverview.income} nl={nl} />}
                    </dd>
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
                      <dd>
                        <Money cost value={l.amount} nl={nl} />
                        {resultOverview && (
                          <span className="vtk-bud-ov-res">
                            <Money cost value={resultOverview.lines.find((x) => x.id === l.id)?.amount ?? 0} nl={nl} />
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                  <div className="sum">
                    <dt>{nl ? 'Uitgaven' : 'Expenses'}</dt>
                    <dd>
                      <Money cost value={overview.expense} nl={nl} />
                      {resultOverview && (
                        <Money className="vtk-bud-ov-res" cost value={resultOverview.expense} nl={nl} />
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <dl className="vtk-bud-ov-total">
              <div>
                <dt>{nl ? 'Totaal' : 'Total'}</dt>
                <dd className={overview.total < -0.004 ? 'neg' : ''}>
                  <Money value={overview.total} nl={nl} />
                </dd>
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
                  <Money signed value={overview.diff} nl={nl} />
                </dd>
              </div>
            </dl>
            {begroting && begroting.sheets.length > 0 && (
              <BegrotingPicker
                sheets={begroting.sheets}
                suggested={begroting.suggested}
                value={content.begrotingRef ?? null}
                disabled={readOnly}
                nl={nl}
                onPick={(ref, amount) =>
                  mutate((d) => {
                    d.begrotingRef = ref;
                    if (amount != null) d.begroting = amount;
                  })
                }
              />
            )}
            {content.begrotingRef && (
              <label className="vtk-bud-check">
                <input
                  type="checkbox"
                  checked={!!content.potPart || (pot?.others.length ?? 0) > 0}
                  disabled={readOnly || (pot?.others.length ?? 0) > 0}
                  onChange={(e) => mutate((d) => (d.potPart = e.target.checked))}
                />
                <span>
                  {nl
                    ? 'Dit is een potje: er komen meer budgetten op deze lijn (bv. materiaal door het jaar)'
                    : 'This is a pot: more budgets will draw on this line'}
                </span>
              </label>
            )}
            {pot && pot.others.length > 0 && (
              <div className="vtk-bud-pot">
                <h3 className="vtk-bud-colhead">
                  {nl
                    ? `Potje: ${pot.others.length + 1} budgetten op deze lijn`
                    : `Pot: ${pot.others.length + 1} budgets on this line`}
                </h3>
                <dl className="vtk-bud-ov-list">
                  {pot.others.map((m) => (
                    <div key={m.id}>
                      <dt>
                        {token ? (
                          m.title
                        ) : (
                          <Link href={`${locale === 'en' ? '/en' : ''}/admin/bestuursorgaan/mijn/${m.id}`}>
                            {m.title}
                          </Link>
                        )}
                        {m.targetDate && <span className="vtk-bud-muted"> · BO {shortDate(m.targetDate, nl)}</span>}
                      </dt>
                      <dd>
                        <Money value={m.total} nl={nl} />
                        {m.result != null && <Money className="vtk-bud-ov-res" value={m.result} nl={nl} />}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt>{nl ? 'Dit budget' : 'This budget'}</dt>
                    <dd>
                      <Money value={overview.total} nl={nl} />
                      {resultOverview && <Money className="vtk-bud-ov-res" value={resultOverview.total} nl={nl} />}
                    </dd>
                  </div>
                  <div className="sum">
                    <dt>{nl ? 'Samen, tegenover de begroting' : 'Together, against the yearly budget'}</dt>
                    <dd>
                      <Money value={overview.total + pot.othersTotal} nl={nl} />
                      <span className={overview.diff == null ? '' : overview.diff < -0.004 ? 'neg' : 'pos'}>
                        {' '}
                        (<Money signed value={overview.diff} nl={nl} />)
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            )}
            {resultOn && resultOverview && (
              <div className="vtk-bud-result">
                <dl className="vtk-bud-ov-total">
                  <div>
                    <dt>{nl ? 'Resultaat' : 'Result'}</dt>
                    <dd className={resultOverview.total < -0.004 ? 'neg' : ''}>
                      <Money value={resultOverview.total} nl={nl} />
                    </dd>
                  </div>
                  <div>
                    <dt>{nl ? 'Verschil met budget' : 'Difference with budget'}</dt>
                    <dd className={resultOverview.diffBudget < -0.004 ? 'neg' : 'pos'}>
                      <Money signed value={resultOverview.diffBudget} nl={nl} />
                    </dd>
                  </div>
                  <div>
                    <dt>{nl ? 'Verschil met begroting' : 'Difference with plan'}</dt>
                    <dd
                      className={
                        resultOverview.diffBegroting == null
                          ? ''
                          : resultOverview.diffBegroting < -0.004
                            ? 'neg'
                            : 'pos'
                      }
                    >
                      <Money signed value={resultOverview.diffBegroting} nl={nl} />
                    </dd>
                  </div>
                </dl>
                <label className="vtk-bud-field wide">
                  <span className="vtk-bud-label">{nl ? 'Toelichting bij het resultaat' : 'About the result'}</span>
                  <textarea
                    className="vtk-bud-input"
                    rows={2}
                    value={content.result?.note ?? ''}
                    disabled={readOnly}
                    placeholder={
                      nl
                        ? 'Wat liep anders dan gebudgetteerd? Vul het resultaat per regel in bij de secties; een tussentijds resultaat mag, je vult later aan.'
                        : 'What went differently? Fill in the result per row in the sections.'
                    }
                    onChange={(e) => mutate((d) => (d.result = { on: true, note: e.target.value }))}
                  />
                </label>
              </div>
            )}
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
              <div className="vtk-bud-params" id="bud-params">
                {(p.extra ?? []).map((x, i) => (
                  <div key={x.id} className="vtk-bud-param">
                    <input
                      className="vtk-bud-input"
                      value={x.name}
                      aria-label={nl ? 'Naam van de parameter' : 'Parameter name'}
                      placeholder={nl ? 'Bv. Aantal bedrijven' : 'E.g. Companies'}
                      onChange={(e) => mutate((d) => (d.params.extra![i].name = e.target.value))}
                    />
                    <select
                      className="vtk-bud-input"
                      value={x.kind ?? 'number'}
                      aria-label={nl ? 'Soort' : 'Kind'}
                      onChange={(e) =>
                        mutate((d) => (d.params.extra![i].kind = e.target.value as 'number' | 'percent' | 'money'))
                      }
                    >
                      <option value="number">{nl ? 'aantal' : 'number'}</option>
                      <option value="percent">%</option>
                      <option value="money">€</option>
                    </select>
                    <NumberField
                      className="vtk-bud-input num"
                      value={x.value}
                      percent={x.kind === 'percent'}
                      decimals={x.kind === 'money' ? 2 : undefined}
                      aria-label={
                        nl ? `Waarde van ${x.name || 'de parameter'}` : `Value of ${x.name || 'the parameter'}`
                      }
                      formula={x.fx}
                      onFormula={(f) =>
                        mutate((d) => {
                          if (f) d.params.extra![i].fx = f;
                          else delete d.params.extra![i].fx;
                        })
                      }
                      onValue={(v) => mutate((d) => (d.params.extra![i].value = v ?? 0))}
                    />
                    <button
                      type="button"
                      className="vtk-bud-link"
                      onClick={() => mutate((d) => void d.params.extra!.splice(i, 1))}
                    >
                      {nl ? 'Weg' : 'Remove'}
                    </button>
                  </div>
                ))}
                {(p.extra?.length ?? 0) < 40 && (
                  <button
                    type="button"
                    className="vtk-bud-add"
                    onClick={() =>
                      mutate((d) => {
                        d.params.extra = [
                          ...(d.params.extra ?? []),
                          { id: newId(), name: '', value: 0, kind: 'number' },
                        ];
                      })
                    }
                  >
                    <PlusIcon /> {nl ? 'Eigen parameter' : 'Own parameter'}
                  </button>
                )}
                <p className="vtk-bud-fine">
                  {nl
                    ? 'Elk getalveld neemt ook een berekening aan, zoals een cel in het blad: typ "=" en reken met getallen en parameters. '
                    : 'Every number field also takes a calculation, like a cell in the sheet: type "=" and use numbers and parameters. '}
                  {scopeNames(content, nl).map((n) => (
                    <code key={n.label} className="vtk-bud-code">
                      [{n.label}]
                    </code>
                  ))}
                  {nl
                    ? ' Bv. "=2,79/4", "=[Deelnemers]*30%" of "=omhoog(45/6)". Een veld met een berekening herken je aan de gele hoek.'
                    : ' E.g. "=2.79/4" or "=roundup(45/6)". A field with a calculation has a yellow corner.'}
                </p>
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

            {content.sections.map((section, index) => (
              <SectionCard
                key={section.id}
                api={api}
                section={section}
                onDelete={() => mutate((d) => void (d.sections = d.sections.filter((s) => s.id !== section.id)))}
                onMove={(by) =>
                  mutate((d) => {
                    const from = d.sections.findIndex((s) => s.id === section.id);
                    const to = from + by;
                    if (from < 0 || to < 0 || to >= d.sections.length) return;
                    const [moved] = d.sections.splice(from, 1);
                    d.sections.splice(to, 0, moved);
                  })
                }
                first={index === 0}
                last={index === content.sections.length - 1}
              />
            ))}

            {!readOnly && (
              <div className="vtk-bud-addsec">
                <span>
                  {nl
                    ? 'Sectie toevoegen, zoveel als je wil en met een naam naar keuze:'
                    : 'Add a section, as many as you like, named as you like:'}
                </span>
                <button type="button" className="vtk-bud-add" onClick={() => addSection('fixed')}>
                  <PlusIcon /> {nl ? 'Kosten (aantal × prijs)' : 'Costs (quantity × price)'}
                </button>
                <button type="button" className="vtk-bud-add" onClick={() => addSection('variable')}>
                  <PlusIcon /> {nl ? 'Kosten per persoon' : 'Costs per person'}
                </button>
                <button type="button" className="vtk-bud-add" onClick={() => addSection('income')}>
                  <PlusIcon /> {nl ? 'Inkomsten' : 'Income'}
                </button>
              </div>
            )}
          </fieldset>

          {!readOnly && !token && (
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
        </>
      )}

      {panel && view === 'maken' && (
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

/** De lijn uit de begroting kiezen: het tabblad van de post staat voor, een ander kan ook. */
function BegrotingPicker({
  sheets,
  suggested,
  value,
  disabled,
  nl,
  onPick,
}: {
  sheets: BegrotingSheet[];
  suggested: string | null;
  value: { sheet: string; key: string; label: string } | null;
  disabled: boolean;
  nl: boolean;
  onPick: (ref: { sheet: string; key: string; label: string } | null, amount: number | null) => void;
}) {
  const [sheetName, setSheetName] = useState(value?.sheet ?? suggested ?? sheets[0].name);
  const sheet = sheets.find((s) => s.name === sheetName) ?? sheets[0];
  const groups = [...new Set(sheet.lines.map((l) => l.group))];
  const known = value ? sheets.find((s) => s.name === value.sheet)?.lines.some((l) => l.key === value.key) : true;
  return (
    <div className="vtk-bud-begr" id="bud-field-begrotingref">
      <span className="vtk-bud-label">{nl ? 'Lijn in de begroting' : 'Line in the yearly budget'}</span>
      <div className="vtk-bud-begr-row">
        <select
          className="vtk-bud-input"
          value={sheet.name}
          disabled={disabled}
          aria-label={nl ? 'Tabblad van de begroting' : 'Sheet of the yearly budget'}
          onChange={(e) => setSheetName(e.target.value)}
        >
          {sheets.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="vtk-bud-input"
          value={value && value.sheet === sheet.name ? value.key : ''}
          disabled={disabled}
          aria-label={nl ? 'Lijn' : 'Line'}
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
          <option value="">{nl ? 'Kies de lijn, dan neemt de site het bedrag over' : 'Choose the line'}</option>
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
      </div>
      {value && !known && (
        <p className="vtk-bud-fine text-vtk-danger">
          {nl
            ? `"${value.label}" staat niet meer in de begroting die nu opgeladen is. Kies de lijn opnieuw.`
            : `"${value.label}" is no longer in the uploaded yearly budget. Choose the line again.`}
        </p>
      )}
    </div>
  );
}
