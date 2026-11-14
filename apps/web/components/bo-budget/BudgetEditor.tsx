'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@vtk/ui';
import Link from '@/components/ui/Link';
import { DeleteButton } from '@/components/ui/DeleteIconButton';
import { PlusIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { UNSENT, unsentGuard } from '@/components/ui/unsentGuard';
import {
  deleteBoBudgetAction,
  rememberFixedPriceAction,
  reopenBoBudgetAction,
  saveBoBudgetAction,
} from '@/app/actions/boBudgets';
import {
  allCostRows,
  costAmount,
  findCostRow,
  hasResult,
  incomeAmount,
  overviewOf,
  priceOf,
  resultOverviewOf,
  type CalcContext,
} from '@/lib/bo/budget/calc';
import { checksOf, type Check } from '@/lib/bo/budget/checks';
import { priceSummary } from '@/lib/bo/budget/control';
import { applyFormulas } from '@/lib/bo/budget/formula';
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
import type { BudgetContent, BudgetSettings, CostRow, IncomeRow, PriceCheck, Section } from '@/lib/bo/budget/types';
import { OverviewCard, ParamsCard, PotCard, PricesBar } from './BudgetTop';
import type { EditorApi } from './editorApi';
import { checkRowPrices, forcePrices, refreshPrices } from './priceApi';
import { shortDate, todayIso } from './format';
import { Money } from './Money';
import { RowPanel } from './RowPanel';
import { ShareDialog } from './ShareDialog';
import { SectionCard } from './SectionCard';

/*
 * Een budget op de site (/admin/bestuursorgaan/mijn/<id>, en de deellinks).
 *
 * Eén blad voor wie het maakt en wie het nakijkt, opgebouwd zoals het
 * rekenblad: bovenaan het Overzicht en de Parameters naast elkaar, daaronder
 * de prijzen bij de webshops, en dan de secties met hun regels. Typen gebeurt
 * in de cel, en de site bewaart het zelf een halve seconde later ("Bewaard om
 * 22:41" bovenaan). Wat de site uitrekent, staat zonder vlak. Wat aan een
 * regel scheelt, staat bij die regel (het bolletje, de kolom Controle); het
 * overzicht telt per sectie hoeveel er openstaat.
 *
 * Wie niet mag wijzigen (een ingediend budget, de deellink om te bekijken),
 * ziet hetzelfde blad met tekst in plaats van cellen.
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
  token = null,
  pot = null,
  begroting = null,
  share = null,
  viewOnly = false,
  viewerName = '',
  canManage = false,
  logHref = null,
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
  /** De deellink om te bekijken: hetzelfde blad, zonder iets te kunnen wijzigen of bewaren. */
  viewOnly?: boolean;
  /** Wie een prijs met de hand bevestigt; de server zet de echte naam bij het bewaren. */
  viewerName?: string;
  /** Groep 5: mag een vaste prijs onthouden vanuit een budget. */
  canManage?: boolean;
  /** Het logboek van de prijscontroles van dit budget, voor wie het mag zien. */
  logHref?: string | null;
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
  const readOnly = viewOnly || status !== 'DRAFT';
  const [sharing, setSharing] = useState(false);
  const [forcing, setForcing] = useState<number | null>(null);

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
    checks,
    controlActions: readOnly
      ? null
      : {
          accept: (rowId: string) =>
            mutate((d) => {
              const found = findCostRow(d, rowId);
              if (found) acceptCheckedPrice(found.row);
            }),
          confirm: (rowId: string, on: boolean) =>
            mutate((d) => {
              const found = findCostRow(d, rowId);
              if (!found) return;
              if (on) confirmRow(found.row, viewerName || (nl ? 'iemand met de deellink' : 'someone with the link'));
              else clearConfirmation(found.row);
            }),
        },
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
    const result = await checkRowPrices(budget.id, rows, token, manual);
    setChecking(null);
    if (!result.ok) {
      if (manual)
        showToast({
          message:
            result.code === 'DISABLED'
              ? nl
                ? 'Prijzen nakijken staat uit bij de instellingen.'
                : 'Price checks are switched off in the settings.'
              : result.code === 'UNSENT'
                ? nl
                  ? 'De site kon de winkel nu niet vragen: geen verbinding met de server.'
                  : 'Could not reach the server to ask the shop.'
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
  // het budget langs het BO ging; de budgetten van het eerstvolgende BO kijkt
  // ze ook zonder bezoek na); wat ze antwoordt, staat al in de databank, dus
  // dit maakt de editor niet "gewijzigd". Langs een route handler en niet als
  // server action, zodat het bewaren er niet op wacht.
  const refreshed = useRef(false);
  const [refreshing, setRefreshing] = useState(true);
  useEffect(() => {
    if (refreshed.current) return;
    refreshed.current = true;
    void (async () => {
      const result = await refreshPrices(budget.id, token);
      setRefreshing(false);
      if (!result.ok || Object.keys(result.checks).length === 0) return;
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
  // Pas na de ronde bij het openen: die vraagt dezelfde regels al.
  const pendingKey =
    readOnly || !settings.collectGoLive || refreshing
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

  // Per sectie: hoeveel punten er openstaan (de bolletjes en de sectie zelf) en
  // hoeveel regels nog geen resultaat hebben. Voor het overzicht.
  const issuesBySection = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of checks)
      if (c.sectionId && c.level !== 'info') map.set(c.sectionId, (map.get(c.sectionId) ?? 0) + 1);
    return map;
  }, [checks]);
  const missingBySection = useMemo(() => {
    const map = new Map<string, number>();
    if (!resultOn) return map;
    for (const section of content.sections) {
      let missing = 0;
      for (const row of section.rows) {
        if (row.result != null) continue;
        const amount =
          section.type === 'income'
            ? incomeAmount(content, row as IncomeRow)
            : costAmount(content, ctx, section, row as CostRow);
        if (Math.abs(amount) > 0.004) missing += 1;
      }
      if (missing) map.set(section.id, missing);
    }
    return map;
  }, [resultOn, content, ctx]);
  const fieldChecks = (field: NonNullable<Check['field']>) =>
    checks.filter((c) => c.field === field && !c.rowId && c.level !== 'info');
  // Over de begroting of het resultaat: onder het overzicht. Wat geen plaats
  // heeft (de naam van de activiteit), ook.
  const overviewNotes = checks.filter(
    (c) => !c.rowId && !c.sectionId && (c.field === 'begroting' || !c.field) && c.level !== 'info'
  );
  const prices = useMemo(() => priceSummary(content, ctx), [content, ctx]);
  const pricesFixed =
    status !== 'DRAFT'
      ? nl
        ? 'Liggen vast sinds het indienen.'
        : 'Fixed since it was submitted.'
      : targetDate && targetDate < todayIso()
        ? nl
          ? 'Liggen vast: het BO waarvoor dit budget was, is voorbij.'
          : 'Fixed: the board meeting this budget was for has passed.'
        : null;

  // Het totaal in de meescrollende kop pas wanneer het overzicht uit beeld is:
  // daarboven staat het er al, en twee keer hetzelfde getal leest als twee getallen.
  const overviewRef = useRef<HTMLElement | null>(null);
  const [overviewInView, setOverviewInView] = useState(true);
  useEffect(() => {
    const el = overviewRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setOverviewInView(entry.isIntersecting), {
      rootMargin: '-140px 0px 0px 0px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** "Prijzen opnieuw ophalen": elke winkel vers, en de server bewaart de antwoorden. */
  async function forceRefresh() {
    setForcing(checkableRows(content).length);
    const result = await forcePrices(budget.id, token);
    setForcing(null);
    if (!result.ok) {
      showToast({
        message:
          result.code === 'TOO_SOON'
            ? nl
              ? `De prijzen zijn net opgehaald. Probeer het over ${result.retryInSeconds ?? 120} seconden opnieuw.`
              : `Prices were just fetched. Try again in ${result.retryInSeconds ?? 120} seconds.`
            : result.code === 'DISABLED'
              ? nl
                ? 'Prijzen nakijken staat uit bij de instellingen.'
                : 'Price checks are switched off in the settings.'
              : result.code === 'FIXED'
                ? nl
                  ? 'Dit budget ligt vast: ingediend, of het BO is voorbij. De prijzen blijven zoals ze waren.'
                  : 'This budget is fixed; its prices stay as they were.'
                : result.code === 'UNSENT'
                  ? nl
                    ? 'De site kon de winkels nu niet vragen: geen verbinding met de server.'
                    : 'Could not reach the server.'
                  : errorText(result.code, nl),
        variant: 'error',
        duration: 0,
      });
      return;
    }
    const answers = Object.values(result.checks);
    setContent((prev) => {
      const next = structuredClone(prev);
      for (const r of allCostRows(next)) if (result.checks[r.id]) r.lastCheck = result.checks[r.id];
      if (result.at) next.pricesAt = result.at;
      return next;
    });
    const changedCount = answers.filter((c) => c.status === 'changed').length;
    const failed = answers.filter((c) => c.status === 'failed' || c.status === 'notfound').length;
    const n = answers.length;
    const what = nl ? `${n} ${n === 1 ? 'prijs' : 'prijzen'} opgevraagd` : `${n} ${n === 1 ? 'price' : 'prices'} asked`;
    const issues = [
      changedCount ? (nl ? `${changedCount} gewijzigd` : `${changedCount} changed`) : '',
      failed ? (nl ? `${failed} zonder antwoord` : `${failed} without an answer`) : '',
    ].filter(Boolean);
    showToast({
      message:
        n === 0
          ? nl
            ? 'Geen enkele regel heeft een link naar een product dat de site kan nakijken.'
            : 'No row links to a product the site can check.'
          : issues.length
            ? `${what}: ${issues.join(', ')}. ${nl ? 'Je ziet het bij de regel.' : 'See the row.'}`
            : `${what}: ${nl ? 'alles klopt' : 'all correct'}.`,
      variant: n === 0 || issues.length ? 'warning' : 'success',
    });
  }

  const openPoints = blocks.length + reviews.length;
  const firstPoint = blocks[0] ?? reviews[0];

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
          het bewaard is, en de download. Het totaal komt erbij zodra het
          overzicht uit beeld scrolt. */}
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
          {!overviewInView && (
            <dl className="vtk-bud-top-figs">
              <div>
                <dt>{resultOverview ? (nl ? 'Resultaat' : 'Result') : nl ? 'Totaal' : 'Total'}</dt>
                <dd>
                  <Money value={resultOverview ? resultOverview.total : overview.total} nl={nl} />
                </dd>
              </div>
              <div>
                <dt>{nl ? 'Tegenover begroting' : 'Against plan'}</dt>
                <dd>
                  <Money signed value={resultOverview ? resultOverview.diffBegroting : overview.diff} nl={nl} />
                </dd>
              </div>
            </dl>
          )}
          {viewOnly ? (
            <span className="vtk-bo-pill">{nl ? 'Alleen bekijken' : 'View only'}</span>
          ) : status !== 'DRAFT' ? (
            <span className="vtk-bo-pill" data-tone="ok">
              {nl ? 'Ingediend' : 'Submitted'}
            </span>
          ) : (
            saveLabel && (
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
            )
          )}
          {openPoints > 0 && firstPoint && (
            <button
              type="button"
              className="vtk-bud-open"
              data-level={blocks.length ? 'block' : 'review'}
              title={nl ? 'Naar het eerste punt' : 'To the first point'}
              onClick={() => goTo(firstPoint)}
            >
              {nl
                ? `${openPoints} ${openPoints === 1 ? 'punt' : 'punten'} open`
                : `${openPoints} open ${openPoints === 1 ? 'point' : 'points'}`}
            </button>
          )}
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
            title={
              nl
                ? 'Download het rekenblad en zet het in de map Budgetten van die BO, zoals voordien.'
                : "Download the spreadsheet and put it in that meeting's Budgetten folder."
            }
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

      {status !== 'DRAFT' && !viewOnly && (
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

      {/* Bovenaan, zoals in het blad: het overzicht en de parameters naast elkaar. */}
      <div className="vtk-bud-sheettop">
        <OverviewCard
          api={api}
          overview={overview}
          result={resultOverview}
          pot={pot}
          issuesBySection={issuesBySection}
          missingBySection={missingBySection}
          notes={overviewNotes}
          cardRef={overviewRef}
        />
        <ParamsCard
          api={api}
          settings={settings}
          template={budget.template}
          targetDate={targetDate}
          onTargetDate={(value) => {
            setTargetDate(value);
            changed();
          }}
          postName={postName}
          settingsHref={settingsHref}
          begroting={begroting}
          pot={pot}
          fieldChecks={fieldChecks}
        />
      </div>

      {(content.info.concept.trim() || !readOnly) && (
        <label className="vtk-bud-concept">
          <span className="vtk-bud-label">{nl ? 'Concept' : 'Concept'}</span>
          {readOnly ? (
            <span>{content.info.concept}</span>
          ) : (
            <textarea
              className="vtk-bud-bare vtk-bud-cell"
              rows={2}
              value={content.info.concept}
              placeholder={
                nl
                  ? 'Wat is het, en waarom kost het wat het kost? Dit komt bij de toelichting op het BO.'
                  : 'What is it, and why does it cost what it costs?'
              }
              onChange={(e) => mutate((d) => (d.info.concept = e.target.value))}
            />
          )}
        </label>
      )}
      {content.source && (
        <p className="vtk-bud-source">
          {nl ? 'Overgenomen uit het rekenblad ' : 'Taken from the spreadsheet '}
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

      {pot && pot.others.length > 0 && (
        <PotCard
          pot={pot}
          title={title}
          total={overview.total}
          resultTotal={resultOverview ? resultOverview.total : null}
          diff={overview.diff}
          nl={nl}
          potHref={token ? null : (id) => `${locale === 'en' ? '/en' : ''}/admin/bestuursorgaan/mijn/${id}`}
        />
      )}

      {prices.rows > 0 && (
        <PricesBar
          summary={prices}
          nl={nl}
          live={settings.collectGoLive}
          fixed={pricesFixed}
          running={forcing ?? (checking ? checking.length : null)}
          canForce={!readOnly}
          onForce={() => void forceRefresh()}
          logHref={logHref}
        />
      )}

      <fieldset className="vtk-bud-fieldset" disabled={readOnly}>
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
