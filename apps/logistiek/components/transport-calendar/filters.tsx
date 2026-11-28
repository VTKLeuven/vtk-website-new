'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { driverColorVar, type DriverColorOverrides } from '@/lib/driver-colors';
import {
  EMPTY_FILTERS,
  FILTER_QUERY_KEYS,
  NO_DRIVER,
  REQUESTER_TYPES,
  TRIP_STATUSES,
  countActiveFilters,
  filtersToQuery,
  type TransportFilters,
} from '@/lib/transport-filters';
import { LogisticsIcon, type IconName } from '@/components/logistics-icon';
import { useCalendarCopy } from './copy';

/**
 * De filters van de transportplanning (P3).
 *
 * Ze staan in de URL, net als de weergave en de datum: de query haalt dan
 * precies op wat je ziet, een gefilterde week is deelbaar, en de terugknop werkt.
 * Daarnaast onthoudt de browser je laatste keuze, zoals de kalenderfilters op
 * /beheer/kalender dat al doen: wie enkel met de kar bezig is, wil dat morgen
 * niet opnieuw aanvinken.
 *
 * Eén knop met een teller, ook op een breed scherm. Vier groepen aanvinkbare
 * pillen open in de werkbalk duwen de kalender zelf onder de vouw, en dat is net
 * waar je naar kijkt; op een telefoon is er helemaal geen plaats voor. De teller
 * op de knop plus de zin onder de kalender zeggen wát er verborgen is, zodat een
 * gefilterde week niet als een lege week leest.
 */

/** Waar de laatst gekozen filters blijven staan, per browser. */
const STORAGE_KEY = 'logistiek.transportplanning.filters';

export type FilterOption = {
  id: string;
  name: string;
  /** Het icoon van een voertuig, zoals in de ritblokken en de legende. */
  icon?: IconName;
  /** Bij de posten: in welk blok ze staan. Weggelaten = bij de posten. */
  kind?: 'PRAESIDIUM' | 'WERKGROEP' | 'JAARWERKING';
};

/**
 * Welke groepen er in het paneel staan.
 *
 * Bestaat voor het publieke bezettingsoverzicht: daar hangt geen
 * evenementenstrook en geen beschikbaarheidsband onder de kalender, en wie
 * zonder login kijkt, krijgt geen chauffeursnamen te zien. Een groep verbergen
 * is dan het enige eerlijke: een filter tonen die niets kan doen, of erger, die
 * namen prijsgeeft die het rooster zelf niet toont, is geen filter.
 */
export type FilterGroups = {
  vehicles?: boolean;
  drivers?: boolean;
  posts?: boolean;
  statuses?: boolean;
  requesters?: boolean;
  events?: boolean;
  availability?: boolean;
};

export function TransportFilterBar({
  filters: urlFilters,
  vehicles,
  drivers,
  posts,
  driverColors,
  groups: shown,
  storageKey = STORAGE_KEY,
}: {
  filters: TransportFilters;
  vehicles: FilterOption[];
  drivers: FilterOption[];
  /** De posten en werkgroepen om op te filteren (F4.1); leeg verbergt de groep. */
  posts?: FilterOption[];
  driverColors?: DriverColorOverrides;
  /** Weglaten toont alles; zie {@link FilterGroups}. */
  groups?: FilterGroups;
  /**
   * Waar de laatste keuze blijft staan. Een eigen sleutel per scherm: de
   * planning en het publieke overzicht filteren op andere dingen, en wat je op
   * het ene aanvinkte, hoort het andere niet leeg te maken.
   */
  storageKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  /**
   * De keuze die je net maakte, tot de URL ze terugstuurt.
   *
   * Een filter staat in de URL, en die komt pas terug na het herladen van de
   * planning: een fractie van een seconde waarin het vinkje of de pil nog op de
   * oude stand stond, en twee snelle klikken na elkaar vergaten de eerste.
   * Gekoppeld aan de URL waarop je klikte, zodat het vanzelf vervalt zodra de
   * nieuwe binnen is.
   */
  const urlKey = params.toString();
  const [pending, setPending] = useState<{ key: string; filters: TransportFilters } | null>(null);
  const filters = pending?.key === urlKey ? pending.filters : urlFilters;

  // Staat de beschikbaarheid niet in dit paneel (de planning heeft er een eigen
  // knop voor in de werkbalk), dan telt ze ook niet mee: de teller op de knop
  // Filters zou anders veranderen telkens je die knop omzet.
  const availabilityHere = shown?.availability ?? true;
  const active =
    countActiveFilters(filters) - (!availabilityHere && filters.showAvailability ? 1 : 0);

  /**
   * De filters uit de vorige keer terugzetten, maar enkel wanneer je zonder één
   * parameter binnenkomt (dus via de navigatie). Hetzelfde stramien als
   * `app/beheer/kalender/kalender-filters.tsx`.
   *
   * Die voorwaarde is streng met opzet: een gedeelde link naar een bepaalde week
   * mag niet overschreven worden door wat er toevallig in deze browser stond, en
   * "alles tonen" moet blijven werken zodra je het aanklikt.
   *
   * Voertuigen en chauffeurs die niet meer bestaan vallen weg, anders filtert een
   * bewaarde keuze op een id dat nergens meer voorkomt en blijft de kalender leeg
   * zonder dat je ziet waarom.
   */
  useEffect(() => {
    if (window.location.search !== '') return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(storageKey);
    } catch {
      return; /* privévenster */
    }
    if (!saved) return;
    const stored = new URLSearchParams(saved);
    const keep = (key: string, known: readonly string[]) => {
      const values = (stored.get(key) ?? '').split(',').filter((id) => known.includes(id));
      if (values.length > 0) stored.set(key, values.join(','));
      else stored.delete(key);
    };
    keep('voertuig', vehicles.map((vehicle) => vehicle.id));
    keep('chauffeur', [NO_DRIVER, ...drivers.map((driver) => driver.id)]);
    // Een post van vorig jaar die er niet meer is, filtert anders alles weg
    // zonder dat je ziet waarom; dezelfde reden als bij de twee hierboven.
    keep('post', (posts ?? []).map((post) => post.id));
    // Een bewaarde `beschikbaar=1` van toen dit nog een filter was, zou de knop
    // in de werkbalk overrulen (de URL wint van de cookie). Waar het geen filter
    // meer is, gaat ze dus niet mee terug in de URL.
    if (!availabilityHere) stored.delete('beschikbaar');
    const query = stored.toString();
    if (!query) return;
    router.replace(`${pathname}?${query}`);
    // Enkel bij het openen van de pagina; daarna stuurt de URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(next: TransportFilters) {
    setPending({ key: urlKey, filters: next });
    const query = new URLSearchParams(params.toString());
    // Élke sleutel die deze module bezit, ook de twee die een vinkje zijn. Een
    // filter op haar standaard schrijft géén sleutel, dus wie enkel schrijft,
    // laat de oude waarde staan: zo was de beschikbaarheidsband niet meer uit te
    // zetten en de evenementenstrook niet meer aan. Zie `FILTER_QUERY_KEYS`.
    for (const key of FILTER_QUERY_KEYS) query.delete(key);
    const added = filtersToQuery(next);
    for (const [key, value] of Object.entries(added)) query.set(key, value);
    try {
      window.localStorage.setItem(storageKey, new URLSearchParams(added).toString());
    } catch {
      /* niet kunnen onthouden mag het filteren niet tegenhouden */
    }
    const search = query.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  }

  function toggle<K extends keyof TransportFilters>(key: K, value: string) {
    const current = filters[key] as string[];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    apply({ ...filters, [key]: next } as TransportFilters);
  }

  // Buiten het paneel klikken sluit het, zoals bij elk uitklapmenu.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /**
   * Links of rechts uitgelijnd onder de knop. Het paneel is breed, en de knop
   * staat vaak rechts in de werkbalk; dan zou het rechts uit het scherm lopen.
   * Gemeten vóór het tekenen, dus zonder verspringen. Allebei in zichtbare
   * pixels (`getBoundingClientRect` en `innerWidth`), dus ook juist onder de
   * zoom van 90% op een laptop.
   */
  const sheet = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);
  useLayoutEffect(() => {
    if (!open || !sheet.current || !panel.current) return;
    const trigger = panel.current.getBoundingClientRect();
    const width = sheet.current.getBoundingClientRect().width;
    setAlignRight(trigger.left + width > window.innerWidth - 12 && trigger.right - width > 12);
  }, [open]);

  const t = useCalendarCopy();
  const copy = t.filterPanel;
  const show = {
    vehicles: shown?.vehicles ?? true,
    drivers: shown?.drivers ?? true,
    posts: shown?.posts ?? true,
    statuses: shown?.statuses ?? true,
    requesters: shown?.requesters ?? true,
    events: shown?.events ?? true,
    availability: shown?.availability ?? true,
  };
  const leftColumn = (show.vehicles && vehicles.length > 0) || (show.drivers && drivers.length > 0);
  const rightColumn = show.statuses || show.requesters;
  const postList = show.posts && (posts ?? []).length > 0;
  const switches = show.events || show.availability;

  return (
    <div className="relative" ref={panel}>
      {/* De knop: gevuld wanneer er iets gefilterd is, met het aantal in een geel
          bolletje, zodat je ook dichtgeklapt ziet dat de kalender niet alles toont. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          active > 0
            ? 'border-vtk-navy bg-vtk-navy text-vtk-on-emphasis'
            : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
        }`}
      >
        <LogisticsIcon name="request" className="h-4 w-4" />
        {t.filters}
        {active > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-vtk-yellow px-1.5 text-xs font-bold tabular-nums text-vtk-on-yellow">
            {active}
          </span>
        ) : null}
        <LogisticsIcon
          name="chevron"
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div
          ref={sheet}
          role="dialog"
          aria-label={t.filters}
          className={`filter-panel absolute top-full z-40 mt-2 w-[min(40rem,calc(100vw-2.5rem))] overflow-hidden rounded-[18px] border border-vtk-navy/15 bg-vtk-surface shadow-xl ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
          {/* Kop: wat er aanstaat, en alles in één keer weg. */}
          <div className="flex items-center justify-between gap-3 border-b border-vtk-navy/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-vtk-ink">{t.filters}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  active > 0 ? 'bg-vtk-yellow text-vtk-on-yellow' : 'bg-vtk-paper text-vtk-muted'
                }`}
              >
                {active > 0 ? copy.active(active) : copy.none}
              </span>
            </div>
            <button
              type="button"
              onClick={() => apply(EMPTY_FILTERS)}
              disabled={active === 0}
              className="text-sm font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4 disabled:cursor-default disabled:text-vtk-muted disabled:no-underline"
            >
              {copy.clear}
            </button>
          </div>

          <div className="grid max-h-[min(70vh,40rem)] gap-0 overflow-y-auto">
            {/* Twee kolommen: links wat er rijdt en wie, rechts welke ritten. */}
            {leftColumn || rightColumn ? (
              <div className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2">
                {leftColumn ? (
                  <FilterSection title={copy.who}>
                    {show.vehicles ? (
                      <ChipGroup
                        label={t.filterVehicle}
                        options={vehicles}
                        selected={filters.vehicleIds}
                        onToggle={(id) => toggle('vehicleIds', id)}
                      />
                    ) : null}
                    {show.drivers ? (
                      <ChipGroup
                        label={t.filterDriver}
                        options={[{ id: NO_DRIVER, name: t.filterNoDriver }, ...drivers]}
                        selected={filters.driverIds}
                        onToggle={(id) => toggle('driverIds', id)}
                        swatch={(id) => (id === NO_DRIVER ? 'var(--driver-none)' : driverColorVar(id, driverColors))}
                      />
                    ) : null}
                  </FilterSection>
                ) : null}
                {rightColumn ? (
                  <FilterSection title={copy.which}>
                    {show.statuses ? (
                      <ChipGroup
                        label={t.filterStatus}
                        options={TRIP_STATUSES.map((status) => ({ id: status, name: t.status[status] }))}
                        selected={filters.statuses}
                        onToggle={(id) => toggle('statuses', id)}
                      />
                    ) : null}
                    {show.requesters ? (
                      <ChipGroup
                        label={t.filterRequester}
                        options={REQUESTER_TYPES.map((type) => ({ id: type, name: t.requester[type] }))}
                        selected={filters.requesterTypes}
                        onToggle={(id) => toggle('requesterTypes', id)}
                      />
                    ) : null}
                  </FilterSection>
                ) : null}
              </div>
            ) : null}

            {/* F4.1: "alle ritten van Acti". Een eigen blok over de volle breedte
                en geen muur van pillen: het zijn er vijfentwintig, dus een
                zoekveld en kolommen, gesplitst in posten en werkgroepen. */}
            {postList ? (
              <PostPicker
                options={posts ?? []}
                selected={filters.groupIds}
                onToggle={(id) => toggle('groupIds', id)}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-vtk-navy/10 bg-vtk-paper/60 px-4 py-3">
            <div className="grid gap-2">
              {/* Aan of uit, dus een schakelaar en geen pil: één pil
                  "Evenementen" die aanstaat betekent iets anders dan één pil in
                  een groep waar er meer zijn. */}
              {show.events ? (
                <Switch
                  on={filters.showEvents}
                  label={t.filterEvents}
                  onChange={(on) => apply({ ...filters, showEvents: on })}
                />
              ) : null}
              {show.availability ? (
                <Switch
                  on={filters.showAvailability}
                  label={t.filterAvailability}
                  hint={t.filterAvailabilityHint}
                  onChange={(on) => apply({ ...filters, showAvailability: on })}
                />
              ) : null}
              {!switches ? <span /> : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-vtk-navy bg-vtk-navy px-4 py-1.5 text-sm font-semibold text-vtk-on-emphasis transition hover:bg-vtk-ink"
            >
              {copy.done}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Een kolom met een kop: "Wat rijdt en wie", "Welke ritten". */
function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-3">
      <h3 className="text-xs font-semibold text-vtk-ink">{title}</h3>
      {children}
    </section>
  );
}

/** Het label van een groep, met wat er nu gekozen is. */
function GroupLabel({ label, count }: { label: string; count: number }) {
  const copy = useCalendarCopy().filterPanel;
  return (
    <p className="flex items-baseline gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
      {label}
      <span
        className={`text-[11px] font-medium normal-case tracking-normal ${
          count > 0 ? 'text-vtk-navy' : 'text-vtk-muted'
        }`}
      >
        {count > 0 ? copy.chosen(count) : copy.all}
      </span>
    </p>
  );
}

/**
 * Eén groep aanvinkbare pillen. Geen keuzelijst met meervoudige selectie: die is
 * op een telefoon nauwelijks te bedienen, en je ziet er niet aan af wat er
 * aanstaat zonder ze te openen. Een gekozen pil is gevuld en draagt een vinkje;
 * het lichte randje van voordien las als "niet gekozen".
 */
function ChipGroup({
  label,
  options,
  selected,
  onToggle,
  swatch,
}: {
  label: string;
  options: FilterOption[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  /** Kleurstip voor de chauffeurs, zodat de filter dezelfde taal spreekt als de kalender. */
  swatch?: (id: string) => string;
}) {
  if (options.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <GroupLabel label={label} count={selected.filter((id) => options.some((o) => o.id === id)).length} />
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Chip
            key={option.id}
            on={selected.includes(option.id)}
            onClick={() => onToggle(option.id)}
            lead={
              option.icon ? (
                <LogisticsIcon name={option.icon} className="h-3.5 w-3.5" />
              ) : swatch ? (
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-vtk-navy/20"
                  style={{ backgroundColor: swatch(option.id) }}
                />
              ) : null
            }
          >
            {option.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  lead,
  children,
}: {
  on: boolean;
  onClick: () => void;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        on
          ? 'border-vtk-navy bg-vtk-navy text-vtk-on-emphasis'
          : 'border-vtk-navy/15 bg-vtk-surface text-vtk-ink hover:border-vtk-navy/40 hover:bg-vtk-paper'
      }`}
    >
      {on ? <LogisticsIcon name="check" className="h-3 w-3" strokeWidth={3} /> : lead}
      {children}
    </button>
  );
}

/**
 * De posten en werkgroepen: zoeken, en vinkjes in kolommen per soort.
 *
 * Wat gekozen is, staat bovenaan als pillen die je met één klik weer weghaalt,
 * zodat je het ziet zonder door de lijst te scrollen.
 */
function PostPicker({
  options,
  selected,
  onToggle,
}: {
  options: FilterOption[];
  selected: readonly string[];
  onToggle: (id: string) => void;
}) {
  const t = useCalendarCopy();
  const copy = t.filterPanel;
  const [query, setQuery] = useState('');

  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const shown = useMemo(() => {
    const needle = fold(query.trim());
    return needle ? options.filter((option) => fold(option.name).includes(needle)) : options;
  }, [options, query]);

  const sections: Array<{ key: string; label: string; items: FilterOption[] }> = [
    { key: 'post', label: copy.posts, items: shown.filter((o) => !o.kind || o.kind === 'PRAESIDIUM') },
    { key: 'werkgroep', label: copy.workGroups, items: shown.filter((o) => o.kind === 'WERKGROEP') },
    { key: 'jaarwerking', label: copy.yearGroups, items: shown.filter((o) => o.kind === 'JAARWERKING') },
  ].filter((section) => section.items.length > 0);
  // Zonder soort (het publieke overzicht) heeft een kop "Posten" boven alles geen zin.
  const withHeadings = options.some((option) => option.kind && option.kind !== 'PRAESIDIUM');

  const chosen = options.filter((option) => selected.includes(option.id));

  return (
    <section className="grid gap-3 border-t border-vtk-navy/10 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <GroupLabel label={t.filterPost} count={chosen.length} />
        <label className="relative">
          <span className="sr-only">{copy.search}</span>
          <LogisticsIcon
            name="search"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-vtk-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.search}
            className="h-8 w-56 max-w-full rounded-full border border-vtk-navy/15 bg-vtk-field pl-8 pr-3 text-xs text-vtk-ink placeholder:text-vtk-muted"
          />
        </label>
      </div>

      {chosen.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((option) => (
            <Chip key={option.id} on onClick={() => onToggle(option.id)}>
              {option.name}
            </Chip>
          ))}
        </div>
      ) : null}

      {/* Op een breed scherm een eigen scrollvak; op een telefoon loopt de lijst
          gewoon door, want daar scrolt het paneel zelf al en twee scrollvakken
          in elkaar zijn niet te bedienen. */}
      <div className="rounded-[12px] border border-vtk-navy/10 bg-vtk-paper/50 p-2 sm:max-h-52 sm:overflow-y-auto">
        {sections.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-vtk-muted">{copy.noMatch}</p>
        ) : (
          sections.map((section) => (
            <div key={section.key} className="grid gap-0.5 [&+&]:mt-2">
              {withHeadings ? (
                <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
                  {section.label}
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-3">
                {section.items.map((option) => {
                  const on = selected.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition ${
                        on ? 'bg-vtk-navy/10 font-semibold text-vtk-ink' : 'text-vtk-body hover:bg-vtk-navy/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggle(option.id)}
                        className="h-3.5 w-3.5 shrink-0 accent-vtk-navy"
                      />
                      <span className="truncate" title={option.name}>
                        {option.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/** Een schakelaar voor wat aan of uit staat, zoals Beschikbaarheid in de werkbalk. */
function Switch({
  on,
  label,
  hint,
  onChange,
}: {
  on: boolean;
  label: string;
  hint?: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="group flex items-start gap-2.5 text-left text-sm text-vtk-ink"
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          on ? 'bg-vtk-navy' : 'bg-vtk-navy/20'
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full bg-vtk-surface shadow transition-transform ${on ? 'translate-x-3' : ''}`}
        />
      </span>
      <span>
        {label}
        {hint ? <span className="mt-0.5 block max-w-sm text-xs text-vtk-muted">{hint}</span> : null}
      </span>
    </button>
  );
}
