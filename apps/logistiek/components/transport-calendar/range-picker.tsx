'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { LogisticsIcon } from '@/components/logistics-icon';
import {
  addIsoDays,
  isPickable,
  monthCells,
  monthOf,
  pickRangeDay,
  rangeDays,
  shiftMonth,
  type DayRange,
  type RangeEnd,
} from '@/lib/range-calendar';
import { byLocale, useCalendarCopy } from './copy';

/**
 * De twee datums van "Aangepast", in het segment zelf.
 *
 * Klik je op Aangepast, dan kleurt het segment en schuift het open met deze twee
 * datums; een datum kiezen past de planning meteen aan. Geen apart venster en
 * geen "Toon": een groot keuzepaneel en daarna een venstertje met een knop zijn
 * allebei gebouwd en op vraag vervangen door dit.
 *
 * **Een knopje met "23 nov", en een kleine kalender erachter.** Het knopje toont
 * enkel dag en maand (het jaar staat in de titel van de planning). Een klik
 * opent een maand met de periode die je nu ziet als band erin, en het uiteinde
 * van dat knopje omcirkeld. Eerst was dat de kalender van de browser, maar die
 * kent maar één datum: wie op "tot" klikte, zag niet van wanneer.
 */

const SHORT = byLocale({ timeZone: 'UTC', day: 'numeric', month: 'short' });
const LONG = byLocale({ timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const MONTH = byLocale({ timeZone: 'UTC', month: 'long', year: 'numeric' });
const WEEKDAY = byLocale({ timeZone: 'UTC', weekday: 'short' });
/** Maandag 1 tot zondag 7 juni 2026: enkel voor de koppen van de kolommen. */
const WEEK = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2026, 5, 1 + index)));
/** Zo breed is de kalender (`w-[17.5rem]`); nodig voor hij de eerste keer open is. */
const PANEL_WIDTH = 280;
const PANEL_HEIGHT = 360;
const GAP = 6;

const asDate = (value: string) => new Date(`${value}T00:00:00Z`);
const short = (locale: 'nl' | 'en', value: string) => SHORT[locale].format(asDate(value)).replace('.', '');

/** Vandaag op de Brusselse klok, als `YYYY-MM-DD`. */
function todayInBrussels(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
}

export function RangeFields({
  first,
  last,
  onChange,
}: {
  /** Het bereik waar de planning op staat, als `YYYY-MM-DD`. */
  first: string;
  last: string;
  onChange: (van: string, tot: string) => void;
}) {
  const t = useCalendarCopy();
  // De gekozen datums tot de planning ze terugstuurt, met het bereik waar ze bij
  // horen: blader je verder, dan volgen de knopjes het nieuwe bereik.
  const source = `${first}|${last}`;
  const [draft, setDraft] = useState<(DayRange & { source: string }) | null>(null);
  const range: DayRange = draft?.source === source ? { van: draft.van, tot: draft.tot } : { van: first, tot: last };

  const pick = (end: RangeEnd, day: string) => {
    const next = pickRangeDay(end, day, range);
    setDraft({ source, ...next });
    onChange(next.van, next.tot);
  };

  // `w-max` en geen `flex-wrap`: tijdens het openschuiven is het segment smaller
  // dan dit, en dan braken de datums onder elkaar af en sprong de hele balk een
  // regel hoger.
  return (
    <span className="flex w-max shrink-0 items-center gap-1.5">
      <DateChip end="van" label={t.range.from} range={range} onPick={pick} />
      <span aria-hidden className="text-xs opacity-80">
        {t.range.to}
      </span>
      <DateChip end="tot" label={t.range.until} range={range} onPick={pick} />
    </span>
  );
}

/**
 * Het segment schuift open tot de breedte van de datums, niet tot een vaste
 * maximumbreedte.
 *
 * Met `max-width: 0 → 24rem` in CSS was de animatie op een derde van haar tijd
 * al voorbij de 170px die de datums nodig hebben, en stond ze de rest stil: een
 * schok in plaats van een beweging. Hier meet het blok zijn eigen breedte en
 * schuift het precies zo ver open. Op een telefoon, waar de datums onder het
 * woord komen, enkel een fade. Wie minder beweging vroeg, krijgt geen van beide.
 */
export function RangeSlide({ narrow, className, children }: { narrow: boolean; className: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timing = { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };
    const animation = narrow
      ? el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], timing)
      : el.animate(
          [
            { width: '0px', opacity: 0 },
            { width: `${el.getBoundingClientRect().width}px`, opacity: 1 },
          ],
          timing
        );
    return () => animation.cancel();
    // Enkel bij het openen: daarna verandert de breedte nog met de datums
    // ("1 dec" is smaller dan "30 nov"), en dat hoort niet te schuiven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span ref={ref} className={`overflow-hidden ${className}`}>
      {children}
    </span>
  );
}

function DateChip({
  end,
  label,
  range,
  onPick,
}: {
  end: RangeEnd;
  label: string;
  range: DayRange;
  onPick: (end: RangeEnd, day: string) => void;
}) {
  const t = useCalendarCopy();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Na elke keer dicht een verse kalender: open je hem opnieuw, dan staat hij op
  // de maand van je datum en niet op de maand waar je vorige keer naartoe
  // bladerde. Dicht gebeurt dat onzichtbaar.
  const [session, setSession] = useState(0);
  const value = range[end];

  /**
   * Onder het knopje, of erboven wanneer er onderaan geen plaats is, en nooit
   * over de rand van het venster. `popover` zet de kalender in de bovenste laag,
   * zodat het afgeronde segment (`overflow: hidden`) hem niet afknipt.
   */
  const place = useCallback(() => {
    const anchor = button.current;
    const pop = panel.current;
    if (!anchor || !pop) return;
    const rect = anchor.getBoundingClientRect();
    const width = pop.offsetWidth || PANEL_WIDTH;
    const height = pop.offsetHeight || PANEL_HEIGHT;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    const below = rect.bottom + GAP;
    const fitsBelow = below + height <= window.innerHeight - 8;
    const top = fitsBelow || rect.top - GAP - height < 8 ? below : rect.top - GAP - height;
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${top}px`;
  }, []);

  // Scrolt de pagina of verandert het venster terwijl hij open staat, dan blijft
  // hij aan zijn knopje hangen.
  useEffect(() => {
    if (!open) return;
    const follow = () => place();
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${LONG[t.locale].format(asDate(value))}`}
        className={`h-7 rounded-full px-2.5 text-xs font-semibold tabular-nums transition ${
          open ? 'bg-vtk-paper text-vtk-ink ring-2 ring-vtk-yellow' : 'bg-vtk-surface text-vtk-ink hover:bg-vtk-paper'
        }`}
      >
        {short(t.locale, value)}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={label}
        onBeforeToggle={(event) => {
          if (event.newState === 'open') place();
        }}
        onToggle={(event) => {
          const isOpen = event.newState === 'open';
          setOpen(isOpen);
          if (isOpen) {
            place();
            panel.current?.querySelector<HTMLButtonElement>('[data-day][tabindex="0"]')?.focus();
          } else {
            setSession((count) => count + 1);
          }
        }}
        className="range-calendar fixed inset-auto m-0 w-[17.5rem] rounded-[16px] border border-vtk-navy/15 bg-vtk-surface p-3 text-vtk-ink shadow-xl"
      >
        <RangeCalendar
          key={session}
          end={end}
          range={range}
          onPick={(day) => {
            panel.current?.hidePopover();
            onPick(end, day);
          }}
        />
      </div>
    </>
  );
}

function RangeCalendar({ end, range, onPick }: { end: RangeEnd; range: DayRange; onPick: (day: string) => void }) {
  const t = useCalendarCopy();
  const [today] = useState(todayInBrussels);
  /** De maand waar je naartoe bladerde; zonder, de maand van je datum. */
  const [browse, setBrowse] = useState<string | null>(null);
  /** De dag met de focus (pijltjes); zonder, je datum zelf. */
  const [focus, setFocus] = useState<string | null>(null);
  /** De dag onder de muis of de focus: de band toont wat een klik zou geven. */
  const [hover, setHover] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const focusAfterRender = useRef(false);

  const focusDay = focus ?? range[end];
  const month = browse ?? monthOf(focusDay);
  const cells = monthCells(month);
  const tabbable = cells.includes(focusDay) && monthOf(focusDay) === month ? focusDay : `${month}-01`;
  const shown = hover && isPickable(end, hover, range) ? pickRangeDay(end, hover, range) : range;
  const single = shown.van === shown.tot;

  useLayoutEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = addIsoDays(focusDay, step);
    setFocus(next);
    setHover(next);
    if (monthOf(next) !== month) setBrowse(monthOf(next));
    focusAfterRender.current = true;
  };

  const monthButton = (by: number, labelText: string) => (
    <button
      type="button"
      aria-label={labelText}
      onClick={() => setBrowse(shiftMonth(month, by))}
      className="grid h-8 w-8 place-items-center rounded-full text-vtk-ink transition hover:bg-vtk-navy/10"
    >
      <LogisticsIcon name="chevron" className={`h-4 w-4 ${by < 0 ? 'rotate-90' : '-rotate-90'}`} />
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        {monthButton(-1, t.range.prevMonth)}
        <div className="text-center">
          <p className="text-sm font-semibold capitalize" aria-live="polite">
            {MONTH[t.locale].format(asDate(`${month}-01`))}
          </p>
          <p className="text-xs text-vtk-muted">{end === 'van' ? t.range.pickFrom : t.range.pickUntil}</p>
        </div>
        {monthButton(1, t.range.nextMonth)}
      </div>

      <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-medium text-vtk-muted" aria-hidden>
        {WEEK.map((day) => (
          <span key={day.toISOString()} className="py-1">
            {WEEKDAY[t.locale].format(day).replace('.', '').slice(0, 2)}
          </span>
        ))}
      </div>

      <div
        ref={grid}
        role="group"
        aria-label={MONTH[t.locale].format(asDate(`${month}-01`))}
        className="grid grid-cols-7 gap-y-0.5"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
      >
        {cells.map((day, index) => {
          const inMonth = monthOf(day) === month;
          const pickable = isPickable(end, day, range);
          const isStart = day === shown.van;
          const isEnd = day === shown.tot;
          const endpoint = isStart || isEnd;
          const inBand = !single && day >= shown.van && day <= shown.tot;
          const column = index % 7;
          // De band loopt door van het begin tot het einde en rondt af op de
          // uiteinden en aan de rand van elke week.
          const band = inBand
            ? `bg-vtk-navy/10 ${isStart || column === 0 ? 'rounded-l-full' : ''} ${isEnd || column === 6 ? 'rounded-r-full' : ''}`
            : '';
          const role = isStart ? t.range.start : isEnd ? t.range.end : null;
          return (
            <div key={day} className={`flex h-9 items-center justify-center ${band}`}>
              <button
                type="button"
                data-day={day}
                tabIndex={day === tabbable ? 0 : -1}
                disabled={!pickable}
                aria-pressed={endpoint}
                aria-current={day === today ? 'date' : undefined}
                aria-label={`${LONG[t.locale].format(asDate(day))}${role ? `, ${role}` : ''}`}
                onClick={() => onPick(day)}
                onMouseEnter={() => setHover(day)}
                onFocus={() => setFocus(day)}
                className={`relative grid h-8 w-8 place-items-center rounded-full text-xs tabular-nums transition-colors ${
                  endpoint
                    ? 'bg-vtk-navy font-semibold text-vtk-on-emphasis'
                    : pickable
                      ? `hover:bg-vtk-navy/15 ${inMonth ? 'text-vtk-ink' : 'text-vtk-muted'}`
                      : 'cursor-not-allowed text-vtk-muted opacity-40'
                } ${day === shown[end] ? 'ring-2 ring-vtk-navy ring-offset-2 ring-offset-vtk-surface' : ''}`}
              >
                {Number(day.slice(8))}
                {day === today ? (
                  <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-current" />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-2 flex items-center justify-between border-t border-vtk-navy/10 pt-2 text-xs text-vtk-muted">
        <span className="tabular-nums">
          {short(t.locale, shown.van)} {t.range.to} {short(t.locale, shown.tot)}
        </span>
        <span className="tabular-nums">{t.range.dayCount(rangeDays(shown))}</span>
      </p>
    </div>
  );
}
