'use client';

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { Input, Label } from '@vtk/ui';
import { SaveForm } from '@/components/ui/SaveForm';
import { IconButton } from '@/components/ui/IconButton';
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { UNSENT, unsentGuard } from '@/components/ui/unsentGuard';
import {
  proposeDutyAction,
  saveDutyBlockAction,
  saveDutyCarryOverAction,
  setDutyAssignmentAction,
  setDutyAvailabilityAction,
} from '@/app/actions/theokotDuty';
import {
  MAX_DUTY_CAPACITY,
  MAX_DUTY_CARRY_OVER,
  MAX_DUTY_NOTE,
  dutyStatus,
  dutyTotals,
  type DutyCell,
  type DutySlotKey,
} from '@/lib/theokotDuty';
import type { DutyPerson } from '@/lib/theokotDuty-server';

type Day = { key: string; short: string; long: string };
type Slot = { key: DutySlotKey; label: string; start: string; end: string };
type Change = { kind: 'avail' | 'assign'; key: string; userId: string; on: boolean; replace?: boolean };

/** Voornaam, en bij twee dezelfde voornamen de eerste letter van de achternaam erbij. */
function shortNames(people: DutyPerson[]): Map<string, string> {
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
  const counts = new Map<string, number>();
  for (const person of people) counts.set(first(person.name), (counts.get(first(person.name)) ?? 0) + 1);
  return new Map(
    people.map((person) => {
      const parts = person.name.trim().split(/\s+/);
      const short =
        (counts.get(parts[0]) ?? 0) > 1 && parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
      return [person.id, short ?? person.name];
    })
  );
}

function applyChange(cells: DutyCell[], change: Change): DutyCell[] {
  return cells.map((cell) => {
    if (cell.key !== change.key) return cell;
    if (change.kind === 'avail') {
      return change.on
        ? {
            ...cell,
            available: cell.available.includes(change.userId) ? cell.available : [...cell.available, change.userId],
          }
        : {
            ...cell,
            available: cell.available.filter((id) => id !== change.userId),
            assigned: cell.assigned.filter((id) => id !== change.userId),
          };
    }
    if (!change.on) return { ...cell, assigned: cell.assigned.filter((id) => id !== change.userId) };
    if (cell.assigned.includes(change.userId)) return cell;
    return { ...cell, assigned: change.replace ? [change.userId] : [...cell.assigned, change.userId] };
  });
}

/**
 * Het rooster van de verantwoordelijken: de dagen naast elkaar, de blokken
 * onder elkaar, en in elk vak wie kan. Een klik op een naam deelt die in (of
 * niet meer); de toestand staat in de knop zelf, en een toast komt er enkel bij
 * een fout. Onder het rooster de telling per werkingsjaar, met de startstand
 * uit het rekenblad. Op een smal scherm staat elke dag als eigen blok onder
 * elkaar. Zie docs/design-decisions.md, "Theokot: verantwoordelijken".
 */
export function DutyRoster({
  week,
  year,
  yearLabel,
  days,
  slots,
  cells,
  people,
  meId,
  nl,
  weekPicker,
}: {
  week: string;
  year: number;
  yearLabel: string;
  days: Day[];
  slots: Slot[];
  cells: DutyCell[];
  people: DutyPerson[];
  /** De ingelogde gebruiker, wanneer die verantwoordelijke is; anders kan die enkel indelen. */
  meId: string | null;
  nl: boolean;
  weekPicker: ReactNode;
}) {
  const [shown, show] = useOptimistic(cells, applyChange);
  const [, startTransition] = useTransition();
  const [proposing, startProposing] = useTransition();
  const [editing, setEditing] = useState<DutyCell | null>(null);
  const [carryOpen, setCarryOpen] = useState(false);
  const showToast = useToast();
  const names = useMemo(() => shortNames(people), [people]);
  const byKey = useMemo(() => new Map(shown.map((cell) => [cell.key, cell])), [shown]);
  const totals = dutyTotals(shown);
  const weekCount = (userId: string) => shown.filter((cell) => cell.open && cell.assigned.includes(userId)).length;

  const errors: Record<string, string> = {
    NOT_MEMBER: nl
      ? 'Enkel wie dit werkingsjaar in de post Theokot zit, kan blokken aanduiden.'
      : 'Only members of the Theokot post this year can mark blocks.',
    CLOSED: nl
      ? 'Dit blok is er die dag niet meer. Herlaad de pagina.'
      : 'This block no longer exists that day. Reload the page.',
    NOT_AVAILABLE: nl
      ? 'Die persoon kan niet meer in dit blok. Herlaad de pagina.'
      : 'That person is no longer available for this block. Reload the page.',
    FULL: nl
      ? 'Dit blok heeft al genoeg verantwoordelijken. Klik eerst een naam weg.'
      : 'This block already has enough people. Remove someone first.',
    INVALID_BLOCK: nl ? 'Dat blok bestaat niet.' : 'That block does not exist.',
    NOTHING_TO_PROPOSE: nl
      ? 'Er valt niets voor te stellen: elk blok heeft iemand, of niemand anders duidde de open blokken aan.'
      : 'Nothing to propose: every block has someone, or nobody else marked the open blocks.',
  };
  const fail = (code: string) =>
    showToast({
      message: errors[code] ?? (nl ? 'Opslaan mislukt. Probeer het opnieuw.' : 'Saving failed. Try again.'),
      variant: 'error',
      duration: 0,
    });

  const dayOf = (cell: DutyCell) => days.find((day) => day.key === cell.date);
  const slotOf = (cell: DutyCell) => slots.find((slot) => slot.key === cell.slot)!;
  const blockName = (cell: DutyCell) => `${dayOf(cell)?.long ?? cell.date} ${slotOf(cell).label.toLowerCase()}`;

  function setAvailable(cell: DutyCell, on: boolean) {
    if (!meId) return;
    startTransition(async () => {
      show({ kind: 'avail', key: cell.key, userId: meId, on });
      const result = await unsentGuard.run(() =>
        setDutyAvailabilityAction({ date: cell.date, slot: cell.slot, available: on })
      );
      if (result === UNSENT) return;
      if (result.status === 'error') fail(result.code);
    });
  }

  function toggleAssign(cell: DutyCell, userId: string) {
    const on = !cell.assigned.includes(userId);
    const full = on && cell.assigned.length >= cell.capacity;
    if (full && cell.capacity > 1) {
      fail('FULL');
      return;
    }
    startTransition(async () => {
      show({ kind: 'assign', key: cell.key, userId, on, replace: full });
      const result = await unsentGuard.run(() =>
        setDutyAssignmentAction({ date: cell.date, slot: cell.slot, userId, assigned: on })
      );
      if (result === UNSENT) return;
      if (result.status === 'error') fail(result.code);
    });
  }

  function propose() {
    startProposing(async () => {
      const result = await unsentGuard.run(() => proposeDutyAction({ week }));
      if (result === UNSENT) return;
      if (result.status === 'error') {
        fail(result.code);
        return;
      }
      const count = result.status === 'success' ? Number(result.detail ?? 0) : 0;
      showToast({
        message: nl
          ? `${count} ${count === 1 ? 'plaats' : 'plaatsen'} ingevuld, telkens met wie het minst openhield. Klik een naam om bij te sturen.`
          : `Filled ${count} ${count === 1 ? 'place' : 'places'} with whoever did the fewest. Click a name to adjust.`,
        variant: 'success',
      });
    });
  }

  const dayStatus = (dayKey: string) => {
    const dayCells = shown.filter((cell) => cell.date === dayKey && cell.open);
    if (dayCells.length === 0) return { tone: 'closed', text: nl ? 'geen blokken' : 'no blocks' };
    const nobody = dayCells.filter((cell) => dutyStatus(cell) === 'none').length;
    const toPick = dayCells.filter((cell) => dutyStatus(cell) === 'open').length;
    if (nobody) return { tone: 'none', text: nl ? `${nobody} zonder kandidaat` : `${nobody} without candidate` };
    if (toPick) return { tone: 'open', text: nl ? `${toPick} te kiezen` : `${toPick} to pick` };
    return { tone: 'done', text: nl ? 'rond' : 'done' };
  };

  const yearBase = new Map(people.map((person) => [person.id, person.yearBase]));
  const yearOf = (userId: string) => (yearBase.get(userId) ?? 0) + weekCount(userId);
  const memberYears = people.filter((person) => person.member).map((person) => yearOf(person.id));
  const lowest = memberYears.length > 0 ? Math.min(...memberYears) : null;

  function renderCell(cell: DutyCell, dayIndex: number, slotIndex: number) {
    const slot = slotOf(cell);
    const status = dutyStatus(cell);
    const place = { '--col': dayIndex + 2, '--row': slotIndex + 2 } as React.CSSProperties;
    const edit = (
      <IconButton
        className="tk-duty-edit"
        label={nl ? 'Blok aanpassen' : 'Edit block'}
        srLabel={`${nl ? 'Blok aanpassen' : 'Edit block'}: ${blockName(cell)}`}
        onClick={() => setEditing(cell)}
      >
        <PencilIcon />
      </IconButton>
    );
    const slotLine = (
      <span className="tk-duty-cell-slot">
        <b>{slot.label}</b> {slot.start}–{slot.end}
      </span>
    );
    if (!cell.open) {
      return (
        <div key={cell.key} className="tk-duty-cell" data-state="closed" style={place}>
          <div className="tk-duty-cell-top">
            {slotLine}
            <span className="tk-duty-closed">{nl ? 'Geen blok' : 'No block'}</span>
            {edit}
          </div>
        </div>
      );
    }
    const missing = cell.capacity - cell.assigned.length;
    const need =
      status === 'none'
        ? nl
          ? 'niemand kan'
          : 'nobody can'
        : status === 'open'
          ? missing > 1
            ? nl
              ? `nog ${missing} kiezen`
              : `pick ${missing} more`
            : nl
              ? 'nog te kiezen'
              : 'to pick'
          : null;
    return (
      <div key={cell.key} className="tk-duty-cell" data-state={status} style={place}>
        <div className="tk-duty-cell-top">
          {slotLine}
          {cell.note ? <span className="tk-duty-note">{cell.note}</span> : null}
          {need ? (
            <span className="tk-duty-need" data-tone={status}>
              {need}
            </span>
          ) : null}
          {edit}
        </div>
        <div className="tk-duty-chips">
          {cell.available.map((userId) => {
            const assigned = cell.assigned.includes(userId);
            const name = names.get(userId) ?? userId;
            const full = people.find((person) => person.id === userId)?.name ?? name;
            const label = assigned
              ? nl
                ? `${full} niet meer indelen: ${blockName(cell)}`
                : `Unassign ${full}: ${blockName(cell)}`
              : nl
                ? `${full} indelen: ${blockName(cell)}`
                : `Assign ${full}: ${blockName(cell)}`;
            const chip = (
              <button
                key={userId}
                type="button"
                className="tk-duty-chip"
                aria-pressed={assigned}
                data-me={userId === meId || undefined}
                aria-label={label}
                title={label}
                onClick={() => toggleAssign(cell, userId)}
              >
                {assigned ? <CheckIcon /> : null}
                {name}
                <small>{yearOf(userId)}</small>
              </button>
            );
            if (userId !== meId) return chip;
            return (
              <span key={userId} className="tk-duty-chip-wrap">
                {chip}
                <button
                  type="button"
                  className="tk-duty-chip-x"
                  aria-label={nl ? `Ik kan toch niet: ${blockName(cell)}` : `I can't after all: ${blockName(cell)}`}
                  title={nl ? 'Ik kan toch niet' : "I can't after all"}
                  onClick={() => setAvailable(cell, false)}
                >
                  <CloseIcon />
                </button>
              </span>
            );
          })}
          {meId && !cell.available.includes(meId) ? (
            <button
              type="button"
              className="tk-duty-add"
              aria-label={nl ? `Ik kan: ${blockName(cell)}` : `I can: ${blockName(cell)}`}
              onClick={() => setAvailable(cell, true)}
            >
              <PlusIcon />
              {nl ? 'Ik kan' : 'I can'}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="tk-duty">
      <div className="tk-sh-toolbar">
        {weekPicker}
        <div className="tk-duty-tools">
          <p className="tk-sh-summary" aria-live="polite">
            <strong>{nl ? `${totals.filled} van ${totals.places}` : `${totals.filled} of ${totals.places}`}</strong>{' '}
            {nl ? 'plaatsen ingedeeld' : 'places assigned'}
            {totals.nobody > 0 ? (
              <>
                {' · '}
                <strong className="tk-duty-danger">
                  {nl
                    ? `${totals.nobody} ${totals.nobody === 1 ? 'blok' : 'blokken'} waar niemand kan`
                    : `${totals.nobody} ${totals.nobody === 1 ? 'block' : 'blocks'} nobody can do`}
                </strong>
              </>
            ) : null}
          </p>
          <button type="button" className="tk-duty-btn" onClick={propose} disabled={proposing || totals.toPick === 0}>
            {proposing ? (nl ? 'Bezig...' : 'Working...') : nl ? 'Eerlijk voorstel' : 'Fair proposal'}
          </button>
        </div>
      </div>

      {meId ? null : (
        <p className="tk-duty-hint">
          {nl
            ? 'Je zit dit werkingsjaar niet in de post Theokot, dus je kan zelf geen blokken aanduiden. Indelen kan wel.'
            : 'You are not in the Theokot post this year, so you cannot mark blocks yourself. You can still assign people.'}
        </p>
      )}

      <h2 className="sr-only">{nl ? 'Rooster' : 'Roster'}</h2>
      <div className="tk-duty-grid">
        <span className="tk-duty-corner" aria-hidden="true" />
        {slots.map((slot, index) => (
          <div key={slot.key} className="tk-duty-slot" style={{ '--row': index + 2 } as React.CSSProperties}>
            <b>{slot.label}</b>
            <span>
              {slot.start}–{slot.end}
            </span>
          </div>
        ))}
        {days.map((day, dayIndex) => {
          const status = dayStatus(day.key);
          return (
            <Fragment key={day.key}>
              <h3 className="tk-duty-day" style={{ '--col': dayIndex + 2 } as React.CSSProperties}>
                <span>{day.short}</span>
                <small data-tone={status.tone}>{status.text}</small>
              </h3>
              {slots.map((slot, slotIndex) => {
                const cell = byKey.get(`${day.key}|${slot.key}`);
                return cell ? renderCell(cell, dayIndex, slotIndex) : null;
              })}
            </Fragment>
          );
        })}
      </div>

      <ul className="tk-sh-legend">
        <li>
          <span className="tk-duty-chip tk-duty-chip-sample" aria-pressed="true">
            <CheckIcon />
            {nl ? 'Naam' : 'Name'}
          </span>
          {nl ? 'ingedeeld' : 'assigned'}
        </li>
        <li>
          <span className="tk-duty-chip tk-duty-chip-sample">
            {nl ? 'Naam' : 'Name'}
            <small>12</small>
          </span>
          {nl ? 'kan, met de telling van het werkingsjaar' : "can, with this year's count"}
        </li>
        <li>
          <span className="tk-sh-swatch" data-fill="empty" aria-hidden="true" />
          {nl ? 'Niemand kan' : 'Nobody can'}
        </li>
      </ul>

      <section className="tk-duty-tally" aria-labelledby="tk-duty-tally-h">
        <div className="tk-duty-tally-head">
          <h2 id="tk-duty-tally-h">
            {nl ? 'Telling' : 'Count'} {yearLabel}
          </h2>
          <button type="button" className="tk-duty-btn" onClick={() => setCarryOpen(true)}>
            {nl ? 'Startstand aanpassen' : 'Edit starting count'}
          </button>
        </div>
        {people.length === 0 ? (
          <p className="tk-duty-hint">
            {nl
              ? 'Er zit nog niemand in de post Theokot voor dit werkingsjaar. Voeg de leden toe in Ledenbeheer.'
              : 'Nobody is in the Theokot post for this working year yet. Add members in member management.'}
          </p>
        ) : (
          <div className="tk-duty-tally-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">{nl ? 'Naam' : 'Name'}</th>
                  <th scope="col">{nl ? 'Startstand' : 'Start'}</th>
                  <th scope="col">{nl ? 'Deze week' : 'This week'}</th>
                  <th scope="col">{nl ? 'Werkingsjaar' : 'Working year'}</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const total = yearOf(person.id);
                  return (
                    <tr key={person.id} data-low={(person.member && total === lowest) || undefined}>
                      <th scope="row">
                        {person.name}
                        {person.id === meId ? <span className="tk-duty-me">{nl ? ' jij' : ' you'}</span> : null}
                        {person.member ? null : (
                          <span className="tk-duty-me">{nl ? ' geen lid meer' : ' no longer a member'}</span>
                        )}
                      </th>
                      <td>{person.carryOver}</td>
                      <td>{weekCount(person.id)}</td>
                      <td className="tk-duty-total">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="tk-duty-fine">
          {nl
            ? 'Werkingsjaar = startstand plus elk blok waarin iemand dit werkingsjaar (sinds 15 juli) ingedeeld is. Groen: het minst ingedeeld.'
            : 'Working year = starting count plus every block someone is assigned to this working year (since 15 July). Green: assigned the fewest.'}
        </p>
      </section>

      <DutyDialog
        open={editing !== null}
        title={editing ? `${nl ? 'Blok' : 'Block'}: ${blockName(editing)}` : ''}
        onClose={() => setEditing(null)}
        nl={nl}
      >
        {editing ? <BlockForm cell={editing} nl={nl} onDone={() => setEditing(null)} /> : null}
      </DutyDialog>

      <DutyDialog
        open={carryOpen}
        title={`${nl ? 'Startstand' : 'Starting count'} ${yearLabel}`}
        onClose={() => setCarryOpen(false)}
        nl={nl}
      >
        <p className="tk-duty-dialog-lead">
          {nl
            ? 'Hoeveel blokken iedereen dit werkingsjaar al openhield voor het rooster op de site stond, bijvoorbeeld de kolom "Totaal aller tijden" uit het rekenblad. Het telt op bij wat hier ingedeeld wordt.'
            : 'How many blocks everyone did this working year before the roster was on the site, for example from the spreadsheet. It adds up with what is assigned here.'}
        </p>
        <SaveForm
          action={saveDutyCarryOverAction}
          className="tk-duty-form"
          resetOnSuccess={false}
          submitLabel={nl ? 'Opslaan' : 'Save'}
          savingLabel={nl ? 'Bezig met opslaan...' : 'Saving...'}
          savedMessage={nl ? 'Startstand opgeslagen' : 'Starting count saved'}
          fallbackErrorMessage={nl ? 'Opslaan van de startstand mislukt.' : 'Saving the starting count failed.'}
          errorMessages={{
            INVALID_COUNT: nl
              ? `Geef per persoon een geheel getal tussen 0 en ${MAX_DUTY_CARRY_OVER} in.`
              : `Enter a whole number between 0 and ${MAX_DUTY_CARRY_OVER} per person.`,
          }}
          onSuccess={() => setCarryOpen(false)}
        >
          <input type="hidden" name="year" value={year} />
          <div className="tk-duty-carry">
            {people.map((person) => (
              <div key={person.id} className="tk-duty-carry-row">
                <Label htmlFor={`carry-${person.id}`}>{person.name}</Label>
                <Input
                  id={`carry-${person.id}`}
                  name={`count:${person.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_DUTY_CARRY_OVER}
                  step={1}
                  defaultValue={person.carryOver || ''}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </SaveForm>
      </DutyDialog>
    </div>
  );
}

function BlockForm({ cell, nl, onDone }: { cell: DutyCell; nl: boolean; onDone: () => void }) {
  return (
    <SaveForm
      action={saveDutyBlockAction}
      className="tk-duty-form"
      resetOnSuccess={false}
      submitLabel={nl ? 'Opslaan' : 'Save'}
      savingLabel={nl ? 'Bezig met opslaan...' : 'Saving...'}
      savedMessage={nl ? 'Blok opgeslagen' : 'Block saved'}
      fallbackErrorMessage={nl ? 'Opslaan van het blok mislukt.' : 'Saving the block failed.'}
      errorMessages={{
        CLOSE_WITH_ASSIGNED: nl
          ? 'Er is al iemand ingedeeld in dit blok. Klik die naam eerst weg voor je het blok weghaalt.'
          : 'Someone is already assigned to this block. Remove them first.',
        CAPACITY_BELOW_ASSIGNED: nl
          ? 'Er zijn meer mensen ingedeeld dan dat aantal. Klik er eerst een weg.'
          : 'More people are assigned than that number. Remove someone first.',
        INVALID_CAPACITY: nl
          ? `Kies tussen 1 en ${MAX_DUTY_CAPACITY} verantwoordelijken.`
          : `Choose between 1 and ${MAX_DUTY_CAPACITY} people.`,
      }}
      onSuccess={onDone}
    >
      <input type="hidden" name="date" value={cell.date} />
      <input type="hidden" name="slot" value={cell.slot} />
      <label className="tk-duty-check">
        <input type="checkbox" name="open" defaultChecked={cell.open} />
        {nl ? 'Dit blok is er die dag' : 'This block exists that day'}
      </label>
      <div className="tk-duty-field">
        <Label htmlFor="duty-capacity">{nl ? 'Aantal verantwoordelijken' : 'Number of people'}</Label>
        <Input
          id="duty-capacity"
          name="capacity"
          type="number"
          min={1}
          max={MAX_DUTY_CAPACITY}
          step={1}
          defaultValue={cell.capacity}
          required
        />
      </div>
      <div className="tk-duty-field">
        <Label htmlFor="duty-note">{nl ? 'Notitie' : 'Note'}</Label>
        <Input
          id="duty-note"
          name="note"
          maxLength={MAX_DUTY_NOTE}
          defaultValue={cell.note ?? ''}
          aria-describedby="duty-note-hint"
        />
        <p id="duty-note-hint" className="tk-duty-fine">
          {nl
            ? 'Bijvoorbeeld "Bureau" of "Broodjes gm". Staat bovenaan in het vak.'
            : 'For example "Meeting". Shown at the top of the block.'}
        </p>
      </div>
    </SaveForm>
  );
}

/** Een kleine modal op de native `<dialog>`: focus blijft erin en Escape sluit. */
function DutyDialog({
  open,
  title,
  onClose,
  nl,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  nl: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="tk-duty-dialog"
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className="tk-duty-dialog-body">
          <div className="tk-duty-dialog-head">
            <h2 id={titleId}>{title}</h2>
            <IconButton label={nl ? 'Sluiten' : 'Close'} onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
