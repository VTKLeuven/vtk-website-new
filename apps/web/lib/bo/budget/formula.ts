import type { BudgetContent, CostRow, CostSection, IncomeRow } from './types';

/*
 * Een berekening in een getalveld, zoals in het rekenblad: "=2,79/4",
 * "=5+1+2+2+7" of "=[Aantal bedrijven]*[Vertegenwoordigers]+8".
 *
 * In de bladen van 26-27 stond in 67 van de 209 bestanden een losse
 * rekensom in een cel en verwezen er 96 naar een eigen parameter (aantal
 * bedrijven, percentage cola, praesidium en kookploeg naast de deelnemers).
 * Zonder dit moest een post die som buiten de site maken en het antwoord
 * intypen, en wist niemand op het BO nog waar "0,6975" vandaan kwam.
 *
 * Bewust klein: getallen, + − × ÷, haakjes, procenten, parameters en een
 * handvol afrondingen. Geen verwijzingen naar andere regels en geen ALS():
 * dat is waar de bladen stukgingen. Puur, zodat de editor en de server
 * hetzelfde uitrekenen.
 */

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string };

/** Hoe een naam vergeleken wordt: "Aantal bedrijven", "aantal_bedrijven" en "AantalBedrijven" zijn dezelfde. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isFormula(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.trim().startsWith('=');
}

type Token =
  { t: 'num'; v: number } | { t: 'name'; v: string } | { t: 'op'; v: '+' | '-' | '*' | '/' | '(' | ')' | ';' | '%' };

function tokenize(input: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;
  const s = input.replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/[÷:]/g, '/');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c) || c === '€') {
      i += 1;
      continue;
    }
    if (/[0-9]/.test(c) || ((c === ',' || c === '.') && /[0-9]/.test(s[i + 1] ?? ''))) {
      let j = i;
      while (j < s.length && /[0-9.,]/.test(s[j])) j += 1;
      let raw = s.slice(i, j);
      // "1.215,50" is duizend tweehonderd: met een komma erbij is de punt een scheidingsteken.
      if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
      const v = Number(raw);
      if (!Number.isFinite(v)) return `"${s.slice(i, j)}" is geen getal`;
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (c === '[') {
      const end = s.indexOf(']', i);
      if (end < 0) return 'een [ zonder ]';
      out.push({ t: 'name', v: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-zÀ-ÿ_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-zÀ-ÿ0-9_]/.test(s[j])) j += 1;
      out.push({ t: 'name', v: s.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/();%'.includes(c)) {
      out.push({ t: 'op', v: c as '+' });
      i += 1;
      continue;
    }
    return `"${c}" kan niet in een berekening`;
  }
  return out;
}

const FUNCTIONS: Record<string, (args: number[]) => number | string> = {
  // Altijd weg van nul, zoals ROUNDUP in het blad; met een tweede getal het aantal decimalen.
  omhoog: (a) => roundWith(a, Math.ceil),
  roundup: (a) => roundWith(a, Math.ceil),
  ceiling: (a) => roundWith([a[0]], Math.ceil),
  omlaag: (a) => roundWith(a, Math.floor),
  rounddown: (a) => roundWith(a, Math.floor),
  floor: (a) => roundWith([a[0]], Math.floor),
  afronden: (a) => roundWith(a, (x) => Math.round(x + 1e-9)),
  round: (a) => roundWith(a, (x) => Math.round(x + 1e-9)),
  min: (a) => (a.length ? Math.min(...a) : 'MIN vraagt minstens één getal'),
  max: (a) => (a.length ? Math.max(...a) : 'MAX vraagt minstens één getal'),
  som: (a) => a.reduce((x, y) => x + y, 0),
  sum: (a) => a.reduce((x, y) => x + y, 0),
};

function roundWith(args: number[], fn: (x: number) => number): number | string {
  if (args.length < 1 || args.length > 2) return 'afronden vraagt één getal, en eventueel het aantal decimalen';
  const factor = 10 ** Math.round(args[1] ?? 0);
  const x = args[0] * factor;
  // 2,0000000001 is twee: zonder dit rondt een deling die net niet uitkomt een eenheid te veel af.
  const eps = fn === Math.ceil ? -1e-9 : fn === Math.floor ? 1e-9 : 0;
  return fn(x + eps) / factor;
}

/**
 * Rekent een berekening uit. `scope` zijn de parameters, op genormaliseerde
 * naam. De "=" vooraan mag, hoeft niet.
 */
export function evalFormula(text: string, scope: Record<string, number>): FormulaResult {
  const body = text.trim().replace(/^=/, '');
  if (!body.trim()) return { ok: false, error: 'de berekening is leeg' };
  const tokenized = tokenize(body);
  if (typeof tokenized === 'string') return { ok: false, error: tokenized };
  const tokens: Token[] = tokenized;
  let pos = 0;
  let error: string | null = null;
  const fail = (message: string): number => {
    error = error ?? message;
    return 0;
  };
  const peekOp = (v: string) => {
    const tok = tokens[pos];
    return tok?.t === 'op' && tok.v === v;
  };

  function expression(): number {
    let left = term();
    while (!error && (peekOp('+') || peekOp('-'))) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function term(): number {
    let left = unary();
    while (!error && (peekOp('*') || peekOp('/'))) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = unary();
      if (op === '/') {
        if (right === 0) return fail('delen door nul');
        left /= right;
      } else left *= right;
    }
    return left;
  }
  function unary(): number {
    if (peekOp('-')) {
      pos += 1;
      return -unary();
    }
    if (peekOp('+')) {
      pos += 1;
      return unary();
    }
    let value = primary();
    while (!error && peekOp('%')) {
      pos += 1;
      value /= 100;
    }
    return value;
  }
  function primary(): number {
    const tok = tokens[pos];
    if (!tok) return fail('de berekening houdt te vroeg op');
    if (tok.t === 'num') {
      pos += 1;
      return tok.v;
    }
    if (tok.t === 'name') {
      pos += 1;
      const key = normalizeName(tok.v);
      if (peekOp('(')) {
        const fn = FUNCTIONS[key];
        if (!fn) return fail(`"${tok.v}" is geen functie die de site kent`);
        pos += 1;
        const args: number[] = [];
        if (!peekOp(')')) {
          args.push(expression());
          while (!error && peekOp(';')) {
            pos += 1;
            args.push(expression());
          }
        }
        if (!peekOp(')')) return fail('een ( zonder )');
        pos += 1;
        const result = fn(args);
        return typeof result === 'string' ? fail(result) : result;
      }
      if (!(key in scope)) return fail(`er is geen parameter "${tok.v}"`);
      return scope[key];
    }
    if (tok.v === '(') {
      pos += 1;
      const value = expression();
      if (!peekOp(')')) return fail('een ( zonder )');
      pos += 1;
      return value;
    }
    return fail(`"${tok.v}" staat op een vreemde plek`);
  }

  const value = expression();
  if (!error && pos < tokens.length) {
    const tok = tokens[pos];
    error = `"${tok.v}" staat op een vreemde plek`;
  }
  if (error) return { ok: false, error };
  if (!Number.isFinite(value)) return { ok: false, error: 'dat komt niet op een getal uit' };
  return { ok: true, value };
}

/* --------------------------------------------------- Formules in een budget */

export type FormulaError = { text: string; rowId?: string; sectionId?: string; paramId?: string; key: string };

const COST_KEYS = ['qty', 'pct', 'perPerson', 'perUnit', 'price'] as const;
const SECTION_KEYS = ['share', 'perPerson', 'base'] as const;

/** De parameters waar een berekening naar kan verwijzen, met de naam zoals je ze typt. */
export function scopeNames(content: BudgetContent, nl = true): { label: string; value: number; percent?: boolean }[] {
  const p = content.params;
  const out: { label: string; value: number; percent?: boolean }[] = [
    { label: nl ? 'Deelnemers' : 'Participants', value: p.persons || 0 },
  ];
  if (p.guests != null) out.push({ label: nl ? 'Genodigden' : 'Guests', value: p.guests || 0 });
  for (const extra of p.extra ?? [])
    if (extra.name.trim())
      out.push({ label: extra.name.trim(), value: extra.value || 0, percent: extra.kind === 'percent' });
  return out;
}

function buildScope(content: BudgetContent, errors: FormulaError[]): Record<string, number> {
  const p = content.params;
  const scope: Record<string, number> = {
    deelnemers: p.persons || 0,
    personen: p.persons || 0,
    participants: p.persons || 0,
    aantalpersonen: p.persons || 0,
    genodigden: p.guests || 0,
    guests: p.guests || 0,
  };
  // In volgorde: een parameter mag naar een vorige verwijzen, niet naar zichzelf of een latere.
  for (const extra of p.extra ?? []) {
    if (extra.fx) {
      const r = evalFormula(extra.fx, scope);
      if (r.ok) extra.value = r.value;
      else errors.push({ text: `${extra.name || 'Parameter'}: ${r.error}.`, paramId: extra.id, key: 'value' });
    }
    const key = normalizeName(extra.name);
    if (key) scope[key] = extra.value || 0;
  }
  return scope;
}

function label(key: string): string {
  return (
    (
      {
        qty: 'aantal',
        pct: 'deel',
        perPerson: 'per persoon',
        perUnit: 'per eenheid',
        price: 'prijs',
        share: 'geldt voor',
        base: 'voor hoeveel personen',
      } as Record<string, string>
    )[key] ?? key
  );
}

/**
 * Rekent elke berekening in het budget uit en zet het antwoord in het veld
 * waar ze bij hoort. De rest van de site (`calc.ts`, de controles, de
 * download) leest enkel die getallen en weet niet dat er een berekening achter
 * zat. Wijzigt `content` zelf; geeft terug wat niet uit te rekenen was.
 */
export function applyFormulas(content: BudgetContent): FormulaError[] {
  const errors: FormulaError[] = [];
  const scope = buildScope(content, errors);
  for (const section of content.sections) {
    if (section.type === 'income') {
      for (const row of section.rows) applyIncome(row, section.id, scope, errors);
      continue;
    }
    applySection(section, scope, errors);
    for (const row of section.rows) applyCost(row, section.id, scope, errors);
  }
  return errors;
}

function applySection(section: CostSection, scope: Record<string, number>, errors: FormulaError[]) {
  if (!section.fx) return;
  for (const key of SECTION_KEYS) {
    const fx = section.fx[key];
    if (!fx) continue;
    const r = evalFormula(fx, scope);
    if (r.ok) section[key] = r.value;
    else errors.push({ text: `${section.name}, ${label(key)}: ${r.error}.`, sectionId: section.id, key });
  }
}

function applyCost(row: CostRow, sectionId: string, scope: Record<string, number>, errors: FormulaError[]) {
  if (!row.fx) return;
  for (const key of COST_KEYS) {
    const fx = row.fx[key];
    if (!fx) continue;
    const r = evalFormula(fx, scope);
    if (!r.ok) {
      errors.push({ text: `${row.name || 'Regel'}, ${label(key)}: ${r.error}.`, rowId: row.id, sectionId, key });
      continue;
    }
    if (key === 'price' && row.override != null) row.override = r.value;
    else row[key] = r.value;
  }
}

function applyIncome(row: IncomeRow, sectionId: string, scope: Record<string, number>, errors: FormulaError[]) {
  if (!row.fx) return;
  if (row.fx.qty && row.count.type === 'manual') {
    const r = evalFormula(row.fx.qty, scope);
    if (r.ok) row.count.qty = r.value;
    else errors.push({ text: `${row.name || 'Regel'}, aantal: ${r.error}.`, rowId: row.id, sectionId, key: 'qty' });
  }
  if (row.fx.price && row.price.type === 'manual') {
    const r = evalFormula(row.fx.price, scope);
    if (r.ok) row.price.value = r.value;
    else errors.push({ text: `${row.name || 'Regel'}, prijs: ${r.error}.`, rowId: row.id, sectionId, key: 'price' });
  }
}

/** Zet of wist de berekening van één veld. */
export function setFx<T extends { fx?: Record<string, string> }>(target: T, key: string, formula: string | null): void {
  if (formula && isFormula(formula)) {
    target.fx = { ...(target.fx ?? {}), [key]: formula.trim() };
    return;
  }
  if (!target.fx) return;
  delete target.fx[key];
  if (Object.keys(target.fx).length === 0) delete target.fx;
}
