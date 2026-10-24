'use client';

import { useCallback, useEffect, useOptimistic, useState, useTransition } from 'react';
import { Button, ConfirmDialog } from '@vtk/ui';
import {
  addAvailabilityAction,
  editAvailabilityAction,
  removeAvailabilityAction,
} from '@/app/actions/uitleen';
import { QuarterDateTime } from '@/components/quarter-datetime';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { useToast } from '@/components/ui/toast';
import { TimeGrid } from '@/components/transport-calendar/time-grid';
import type { AvailabilityBand } from '@/components/transport-calendar/types';
import { formatDateTime, toDatetimeLocalValue } from '@/lib/uitleen';
import {
  AVAILABILITY_KINDS,
  DAG_START_UUR,
  subtractRange,
  type AvailabilityKind,
} from '@/lib/availability-day';
import { AVAILABILITY_KIND_HINT, AVAILABILITY_KIND_LABEL, availabilityFillClass } from '@/lib/availability-kinds';
import { AvailabilityNote } from './availability-note';
import { AvailabilityPaint } from './availability-paint';
import { snapshotOf, useOfferUndo, type AvailabilitySnapshot } from './availability-undo';
import { BandMenu, windowLabel } from './band-menu';
import { CopyPreviousWeek } from './copy-previous-week';

/**
 * Wanneer kan je rijden (V1).
 *
 * Sleep een venster in de week en het staat er meteen; sleep er nog eens over en
 * het gaat weer weg. Dat is het gebaar van een Let's Meet, en het is wat mensen
 * hier verwachten.
 *
 * Een venster dat er staat, maak je korter of langer aan zijn boven- of
 * onderrand, zoals een afspraak in een agenda. Voordien kon dat enkel door het
 * weg te halen en opnieuw te tekenen, en een uur later stoppen dan gepland is
 * precies de wijziging die het vaakst voorkomt. Klik je erop zonder te slepen,
 * dan krijg je een menuutje om de soort te kiezen of het weg te halen.
 *
 * Wat een venster laat verdwijnen of verandert (wissen, rekken, de soort, een
 * week overnemen), zegt het in een melding met "Ongedaan maken". Tekenen niet:
 * het nieuwe venster staat er, en dat is de melding.
 *
 * Het was eerst slepen om twee velden in te vullen en dan op "Toevoegen"
 * klikken. Dat leek zorgvuldig (je kon er nog een nota bij zetten) maar het
 * betekende drie handelingen voor één venster, en de nota bleek in de praktijk
 * bijna nooit ingevuld. Slepen slaat nu direct op.
 *
 * De velden eronder blijven staan, want op een telefoon is verticaal vegen
 * scrollen en dan valt er niets in te tekenen. De lijst eronder blijft ook: daar
 * zie je de vensters van de hele week op een rij, en daar zit de weghaalknop met
 * bevestiging voor wie liever niet met een gebaar wist.
 */

export type AvailabilityWindow = {
  id: string;
  startAt: string;
  endAt: string;
  kind: AvailabilityKind;
  note: string | null;
};

/** Een venster dat nog niet van de server terugkwam; het id is tijdelijk. */
const OPTIMISTIC_ID = 'optimistisch';

/**
 * Staat dit venster nog niet in de databank? Dan valt het nog niet aan te
 * passen of weg te halen; even wachten is dan het juiste antwoord.
 */
function isPending(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID);
}

type Optimistic =
  // `what` en niet `kind`: dat woord is hier al bezet door de soort
  // beschikbaarheid, en twee betekenissen in één object is één te veel.
  | { what: 'add'; startAt: string; endAt: string; kind: AvailabilityKind }
  | { what: 'edit'; id: string; startAt: string; endAt: string; kind?: AvailabilityKind }
  | { what: 'remove'; id: string }
  | { what: 'restore'; snapshot: AvailabilitySnapshot };

export function AvailabilityEditor({
  days,
  windows,
  driverId,
  driverName,
  weekLabel,
  weekValue,
  note,
  previousHref,
  nextHref,
  backHref,
  now,
  previousWeekCount,
}: {
  /** De week, als ISO-strings van UTC-middernacht. */
  days: string[];
  /**
   * Je vensters vanaf het begin van deze week (of vanaf nu, als dat vroeger
   * is): ook wat vandaag al voorbij is, zodat de week toont wat er stond.
   */
  windows: AvailabilityWindow[];
  driverId: string;
  driverName: string;
  /** Wat de telefoonweergave in haar balk zet; die heeft geen paginakop. */
  weekLabel: string;
  /** De maandag als `YYYY-MM-DD`, voor de weeknota. */
  weekValue: string;
  /** De algemene nota van deze week (F4.5), of een lege string. */
  note: string;
  previousHref: string;
  nextHref: string;
  backHref: string;
  /**
   * Het moment waarop de pagina gemaakt werd, als ISO-string. De lijst onderaan
   * toont enkel wat nog moet komen; met `Date.now()` in de render zou de server
   * en de browser daar elk een eigen antwoord op geven.
   */
  now: string;
  /** Hoeveel vensters er vorige week stonden, voor "Neem vorige week over". */
  previousWeekCount: number;
}) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ startAt: '', endAt: '', note: '' });
  /**
   * Wat je met een sleep neerzet. Hetzelfde penseel als op een telefoon, zodat
   * de twee schermen hetzelfde gebaar houden.
   */
  const [brush, setBrush] = useState<AvailabilityKind>('JA');

  /**
   * Smal scherm? Dan het intekenraster van uurvakjes in plaats van het
   * tijdrooster. Via `matchMedia` en niet via CSS: het gaat niet om hoe iets
   * eruitziet maar om welke component er rendert, en om welk gebaar erbij hoort.
   * In een effect, want op de server bestaat `window` niet.
   */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  /**
   * De vensters zoals ze er nú uitzien, inclusief wat nog aan het opslaan is.
   *
   * `useOptimistic` en geen eigen state: de acties doen `revalidatePath`, dus de
   * echte lijst komt vanzelf terug en React draait de optimistische versie
   * precies dan terug. Met eigen state moet je die twee zelf uit elkaar houden,
   * en dan blijft er bij een fout een venster staan dat niet bestaat.
   */
  const [shown, applyOptimistic] = useOptimistic(windows, (state, action: Optimistic) => {
    if (action.what === 'remove') return state.filter((window) => window.id !== action.id);
    if (action.what === 'restore') {
      // Hetzelfde als de server (`replaceRange`), zonder het samenvoegen: wat
      // het stuk raakt, wordt erop geknipt, en de vastgelegde vensters komen
      // terug. Het echte antwoord volgt een tel later.
      const from = new Date(action.snapshot.startAt);
      const to = new Date(action.snapshot.endAt);
      const outside = state.flatMap((window) => {
        const startAt = new Date(window.startAt);
        const endAt = new Date(window.endAt);
        if (startAt >= to || endAt <= from) return [window];
        return subtractRange({ startAt, endAt, kind: window.kind }, from, to).map((piece, index) => ({
          ...window,
          id: `${OPTIMISTIC_ID}-${window.id}-${index}`,
          startAt: piece.startAt.toISOString(),
          endAt: piece.endAt.toISOString(),
        }));
      });
      const restored = action.snapshot.windows.map((window, index) => ({
        ...window,
        id: `${OPTIMISTIC_ID}-terug-${index}`,
      }));
      return [...outside, ...restored].sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    if (action.what === 'edit') {
      return state.map((window) =>
        window.id === action.id
          ? {
              ...window,
              startAt: action.startAt,
              endAt: action.endAt,
              kind: action.kind ?? window.kind,
            }
          : window
      );
    }
    return [
      ...state,
      {
        id: OPTIMISTIC_ID,
        startAt: action.startAt,
        endAt: action.endAt,
        kind: action.kind,
        note: null,
      },
    ];
  });

  const offerUndo = useOfferUndo(
    useCallback(
      (snapshot: AvailabilitySnapshot) => applyOptimistic({ what: 'restore', snapshot }),
      [applyOptimistic]
    )
  );

  const bands: AvailabilityBand[] = shown.map((window) => ({
    id: window.id,
    driverId,
    driverName,
    startAt: window.startAt,
    endAt: window.endAt,
    kind: window.kind,
    note: window.note,
  }));

  const add = useCallback(
    (values: { startAt: string; endAt: string; note?: string; kind: AvailabilityKind }) => {
      startTransition(async () => {
        applyOptimistic({
          what: 'add',
          startAt: values.startAt,
          endAt: values.endAt,
          kind: values.kind,
        });
        const result = await addAvailabilityAction(values);
        if (result.ok) {
          setDraft({ startAt: '', endAt: '', note: '' });
        } else {
          showToast({ message: result.error, variant: 'error', duration: 0 });
        }
      });
    },
    [applyOptimistic, showToast]
  );

  /** Een venster weghalen, met "Ongedaan maken" in de melding. */
  const remove = useCallback(
    (id: string) => {
      const target = shown.find((window) => window.id === id);
      if (!target) return;
      const snapshot = snapshotOf(shown, new Date(target.startAt), new Date(target.endAt));
      startTransition(async () => {
        applyOptimistic({ what: 'remove', id });
        const result = await removeAvailabilityAction(id);
        if (result.ok) {
          offerUndo('Venster weggehaald.', snapshot);
        } else {
          showToast({ message: result.error, variant: 'error', duration: 0 });
        }
      });
    },
    [applyOptimistic, offerUndo, shown, showToast]
  );

  /**
   * Een venster andere uren of een andere soort geven: een versleepte rand, of
   * een keuze in het menuutje.
   *
   * Optimistisch zoals toevoegen, zodat de band blijft staan waar je ze losliet.
   * Raakt ze daarbij een ander venster, dan voegt de server ze samen en komt de
   * samengevoegde band terug met het antwoord. Wat terug te zetten valt, is het
   * oude én het nieuwe bereik samen: rek je een venster langer, dan maakte een
   * andere soort op dat nieuwe stuk plaats.
   */
  const edit = useCallback(
    (id: string, startAt: Date, endAt: Date, kind?: AvailabilityKind) => {
      // Een venster dat nog aan het opslaan is, heeft nog geen echt id.
      if (isPending(id)) return;
      const target = shown.find((window) => window.id === id);
      if (!target) return;
      const snapshot = snapshotOf(
        shown,
        new Date(Math.min(startAt.getTime(), new Date(target.startAt).getTime())),
        new Date(Math.max(endAt.getTime(), new Date(target.endAt).getTime()))
      );
      startTransition(async () => {
        applyOptimistic({
          what: 'edit',
          id,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          kind,
        });
        const result = await editAvailabilityAction(id, {
          startAt: toDatetimeLocalValue(startAt),
          endAt: toDatetimeLocalValue(endAt),
          kind,
        });
        if (result.ok) {
          offerUndo(
            kind ? `Nu: ${AVAILABILITY_KIND_LABEL[kind].toLowerCase()}.` : 'Venster aangepast.',
            snapshot
          );
        } else {
          showToast({ message: result.error, variant: 'error', duration: 0 });
        }
      });
    },
    [applyOptimistic, offerUndo, shown, showToast]
  );

  const resize = useCallback(
    (id: string, startAt: Date, endAt: Date) => edit(id, startAt, endAt),
    [edit]
  );

  /** Het venster waarvan het menuutje openstaat, en waar zijn band stond. */
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuWindow = menu ? (shown.find((window) => window.id === menu.id) ?? null) : null;
  /** Het venster dat op bevestiging wacht om weggehaald te worden. */
  const [confirmRemove, setConfirmRemove] = useState<AvailabilityWindow | null>(null);

  /**
   * Slepen in de week: er staat al iets op dat moment, dan haalt dit het weg;
   * anders komt het erbij.
   *
   * De toets is het **beginpunt** van de sleep en niet de hele overlap: sleep je
   * van halverwege je zaterdagvenster naar de avond, dan is dat "dit stuk mag
   * weg" en niet "voeg er nog een uur aan toe". Het beginpunt is waar je de knop
   * indrukte, en dat is de plek waarvan je zelf zei dat je ze bedoelde.
   */
  const onCreateRange = useCallback(
    (startAt: Date, endAt: Date) => {
      const at = startAt.getTime();
      const existing = shown.find(
        (window) => new Date(window.startAt).getTime() <= at && new Date(window.endAt).getTime() > at
      );
      // Enkel wanneer er al hetzelfde antwoord stond, wist dit; stond er iets
      // anders, dan verander je het van soort. Anders moest je eerst wissen en
      // dan opnieuw tekenen om van "liever niet" naar "beschikbaar" te gaan.
      if (existing && existing.kind === brush) {
        // Een venster dat nog aan het opslaan is, heeft nog geen echt id; dat kan
        // je niet weghalen. Even wachten is dan het juiste antwoord.
        if (!isPending(existing.id)) remove(existing.id);
        return;
      }
      add({
        startAt: toDatetimeLocalValue(startAt),
        endAt: toDatetimeLocalValue(endAt),
        kind: brush,
      });
    },
    [add, brush, remove, shown]
  );

  const fields = (
    <section className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-5">
      <h2 className="text-sm font-semibold text-vtk-ink">Venster intikken</h2>
      <p className="mt-1 text-xs text-vtk-muted">
        Voor wie een uur precies wil zetten; het rooster hierboven gaat per uur.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-vtk-muted sm:col-span-2">
          Hoe graag
          <select
            value={brush}
            onChange={(event) => setBrush(event.target.value as AvailabilityKind)}
            className="h-10 rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 text-sm text-vtk-ink"
          >
            {AVAILABILITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {AVAILABILITY_KIND_LABEL[kind]}: {AVAILABILITY_KIND_HINT[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Van
          <QuarterDateTime
            value={draft.startAt}
            onChange={(value) => setDraft((current) => ({ ...current, startAt: value }))}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Tot
          <QuarterDateTime
            value={draft.endAt}
            onChange={(value) => setDraft((current) => ({ ...current, endAt: value }))}
            min={draft.startAt}
          />
        </label>
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        disabled={pending || !draft.startAt || !draft.endAt}
        onClick={() => add({ startAt: draft.startAt, endAt: draft.endAt, kind: brush })}
      >
        {pending ? 'Opslaan...' : 'Toevoegen'}
      </Button>
    </section>
  );

  // De lijst gaat over wat je nog belooft; wat vandaag al voorbij is, staat
  // enkel nog in de week erboven.
  const upcoming = shown.filter((window) => new Date(window.endAt).getTime() >= new Date(now).getTime());

  const list = (
    <section>
      <h2 className="text-sm font-semibold text-vtk-ink">Wanneer je kan rijden ({upcoming.length})</h2>
      {upcoming.length === 0 ? (
        <p className="mt-2 text-sm text-vtk-muted">
          Nog niets ingegeven. Zolang je niets ingeeft, gaat Logistiek er niet van uit dat je niet
          kan; ze weten het gewoon niet, en bellen je dan.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {upcoming.map((window) => (
            <li
              key={window.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-vtk-surface px-4 py-2.5 text-sm ${
                isPending(window.id) ? 'opacity-60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium text-vtk-ink">
                  {formatDateTime(new Date(window.startAt))} tot{' '}
                  {formatDateTime(new Date(window.endAt))}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-vtk-muted">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 rounded-[3px] border border-vtk-navy/25 bg-vtk-yellow ${availabilityFillClass(window.kind)}`}
                  />
                  {AVAILABILITY_KIND_LABEL[window.kind]}
                </p>
                {window.note ? <p className="text-xs text-vtk-muted">{window.note}</p> : null}
              </div>
              {isPending(window.id) ? (
                <span className="text-xs text-vtk-muted">Opslaan...</span>
              ) : (
                <ConfirmActionButton
                  label={`Weghalen: ${formatDateTime(new Date(window.startAt))}`}
                  confirmLabel="Venster weghalen"
                  icon={<LogisticsIcon name="close" className="h-4 w-4" />}
                  action={removeAvailabilityAction.bind(null, window.id)}
                  successMessage="Venster weggehaald."
                  destructive
                  dialogTitle="Venster weghalen?"
                  dialogDescription="Logistiek weet dan niet meer dat je op dat moment kan rijden. Ritten die al aan jou toegewezen zijn, blijven staan."
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (narrow) {
    // Op een telefoon enkel het intekenraster, op één scherm dat niet scrolt.
    // De velden om een uur in te tikken en de lijst om een venster weg te halen
    // stonden er eerst onder, maar allebei doen ze wat het raster al doet, en
    // samen duwden ze het raster van het scherm. Slepen in het tijdrooster van
    // het brede scherm is muis-only en kan daar ook niet anders: verticaal vegen
    // is scrollen. Zie `availability-paint.tsx`.
    return (
      <AvailabilityPaint
        days={days}
        windows={shown}
        previousWeekCount={previousWeekCount}
        weekLabel={weekLabel}
        weekValue={weekValue}
        note={note}
        previousHref={previousHref}
        nextHref={nextHref}
        backHref={backHref}
      />
    );
  }

  return (
    <div className="grid gap-5">
      {/* Bovenaan: wat voor de hele week geldt, voor je aan de uren begint. */}
      <AvailabilityNote week={weekValue} initial={note} variant="grid" />

      <TimeGrid
        days={days}
        vehicles={[]}
        blocks={[]}
        bands={bands}
        bandsProminent
        // De dag loopt hier van 05:00 tot 05:00 (F4.2): zaterdagnacht 02:00
        // staat onderaan de zaterdagkolom, waar het hoort, en één sleep van
        // 22:00 tot 02:00 is één venster in plaats van twee.
        dayStartHour={DAG_START_UUR}
        // De uitleg staat al in `above`; hier hoort enkel te staan dat er niets
        // is, anders zeggen twee regels onder elkaar hetzelfde.
        emptyLabel="Nog niets ingetekend deze week."
        showDriver={false}
        onCreateRange={onCreateRange}
        onResizeBand={resize}
        onSelectBand={(id, anchor) => {
          // Een venster dat nog aan het opslaan is, heeft nog geen echt id.
          if (!isPending(id)) setMenu({ id, anchor });
        }}
        now={undefined}
        above={
          <div className="grid gap-2 px-1 pb-2">
            {/* Eerst kiezen wát je neerzet, dan slepen. Dezelfde volgorde als op
                een telefoon, met dezelfde staaltjes, zodat het één gebaar blijft. */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Wat duid je aan">
              {AVAILABILITY_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={brush === kind}
                  title={AVAILABILITY_KIND_HINT[kind]}
                  onClick={() => setBrush(kind)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    brush === kind
                      ? 'border-vtk-navy bg-vtk-navy text-vtk-on-emphasis'
                      : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-3 w-3 rounded-[3px] border border-vtk-navy/25 bg-vtk-yellow ${availabilityFillClass(kind)}`}
                  />
                  {AVAILABILITY_KIND_LABEL[kind]}
                </button>
              ))}
              <CopyPreviousWeek
                week={weekValue}
                previousCount={previousWeekCount}
                windows={shown}
                onRestore={(snapshot) => applyOptimistic({ what: 'restore', snapshot })}
                className="ml-auto rounded-full border border-vtk-navy/20 px-2.5 py-1 text-xs font-semibold text-vtk-ink transition hover:border-vtk-navy/50 disabled:opacity-60"
              />
            </div>
            <p className="text-xs text-vtk-muted">
              Sleep met de muis over een dag: het venster staat er meteen, in de gekozen soort.
              Trek aan de boven- of onderrand om het korter of langer te maken, en klik erop om de
              soort te veranderen of het weg te halen. Een dag loopt hier van 05:00 tot 05:00, dus
              de nacht van zaterdag op zondag staat onderaan bij zaterdag.
            </p>
          </div>
        }
      />

      {fields}

      {list}

      {menu && menuWindow ? (
        <BandMenu
          key={menu.id}
          entry={menuWindow}
          anchor={menu.anchor}
          pending={pending}
          onClose={closeMenu}
          onKind={(kind) => {
            setMenu(null);
            edit(menuWindow.id, new Date(menuWindow.startAt), new Date(menuWindow.endAt), kind);
          }}
          onRemove={() => {
            setMenu(null);
            setConfirmRemove(menuWindow);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmRemove !== null}
        title="Venster weghalen?"
        description={
          confirmRemove
            ? `${windowLabel(confirmRemove)} verdwijnt; Logistiek weet dan niet meer dat je op dat moment kan rijden. Ritten die al aan jou toegewezen zijn, blijven staan.`
            : undefined
        }
        confirmLabel="Venster weghalen"
        cancelLabel="Annuleren"
        destructive
        onConfirm={() => {
          if (confirmRemove) remove(confirmRemove.id);
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}
