'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { parseShiftArray, type ShiftResponse } from '@/lib/shift';
import { useToast, type ToastInput } from '@/components/ui/toast';
import { format } from 'date-fns';
import '@/app/design/vtk-basic.css';

export type ShowToast = (input: ToastInput) => void;

/**
 * Kleine event-bus zodat een (uit)schrijving in de ene view (tabel of week) de
 * andere views laat herladen, zónder gedeelde wrapper-component.
 */
const shiftsChanged = new EventTarget();
function emitShiftsChanged() {
  shiftsChanged.dispatchEvent(new Event('changed'));
}

// Function declarations (i.p.v. const) zodat ze gehoist zijn en veilig te
// importeren blijven vanuit WeekView (circulaire import is runtime-only).
export function fmtDate(d: Date) {
  return format(d, 'dd/MM/yyyy');
}
export function fmtTime(d: Date) {
  return format(d, 'HH:mm'); // 24u; 'hh' zou 12u zonder AM/PM zijn
}
export function fmtDateTime(d: Date) {
  return format(d, 'dd/MM/yyyy HH:mm');
}

type ErrorBody = { error?: string; conflictShift?: { id: string; name: string } };

/** Leest JSON uit een response, of `null` als de body geen (geldige) JSON is. */
async function safeJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

/** Zet de server-foutcode om in een leesbare (NL) reden voor de statusmelding. */
function registerErrorMessage(body: unknown): string {
  const data = (body ?? {}) as ErrorBody;
  switch (data.error) {
    case 'Shift is full':
      return 'Deze shift zit vol.';
    case 'Already registered for this shift':
      return 'Je bent al ingeschreven voor deze shift.';
    case 'You are already registered for an overlapping shift':
      return data.conflictShift?.name
        ? `Je bent al ingeschreven voor een overlappende shift: ${data.conflictShift.name}.`
        : 'Je bent al ingeschreven voor een overlappende shift.';
    case 'Shift not found':
      return 'Deze shift bestaat niet meer.';
    default:
      return 'Inschrijven mislukt. Probeer later opnieuw.';
  }
}

/**
 * Haalt een shift-lijst op van `url`, herlaadt bij mount en telkens een view
 * een (uit)schrijving signaleert via de event-bus.
 */
export function useShiftList(url: string): ShiftResponse[] {
  const [shifts, setShifts] = useState<ShiftResponse[]>([]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      const resp = await fetch(url);
      const data = parseShiftArray(await resp.json());
      if (!ignore) setShifts(data); // discard if stale
    }

    load();
    shiftsChanged.addEventListener('changed', load);

    return () => {
      ignore = true;
      shiftsChanged.removeEventListener('changed', load);
    };
  }, [url]);

  return shifts;
}

/** Schrijft de huidige user in voor een shift en toont het resultaat als toast. */
export async function registerShift(id: string, showToast: ShowToast): Promise<void> {
  const resp = await fetch('/api/shift/register?id=' + id, { method: 'POST' });
  if (resp.ok) {
    showToast({ variant: 'success', message: 'Je bent ingeschreven voor deze shift.' });
    emitShiftsChanged();
  } else {
    showToast({ variant: 'error', message: registerErrorMessage(await safeJson(resp)) });
  }
}

/** Schrijft de huidige user uit voor een shift en toont het resultaat als toast. */
export async function unregisterShift(id: string, showToast: ShowToast): Promise<void> {
  const resp = await fetch('/api/shift/register?id=' + id, { method: 'DELETE' });
  if (resp.ok) {
    showToast({ variant: 'success', message: 'Je bent uitgeschreven voor deze shift.' });
    emitShiftsChanged();
  } else {
    const data = (await safeJson(resp)) as ErrorBody;
    showToast({
      variant: 'error',
      message:
        data?.error === 'You are not registered for this shift'
          ? 'Je was niet ingeschreven voor deze shift.'
          : 'Uitschrijven mislukt. Probeer later opnieuw.',
    });
  }
}

function Detail({ k, v, full }: { k: string; v: string; full?: boolean }) {
  return (
    <div className={full ? 'vtk-basic-shift-full' : undefined}>
      <span className="vtk-basic-shift-k">{k}</span>
      <span className="vtk-basic-shift-v">{v}</span>
    </div>
  );
}

/** De uitklap-rij met de exacte start/einde (incl. datum) en overige info. */
function ShiftDetailRow({ shift }: { shift: ShiftResponse }) {
  const taken = shift.takenSpots ?? shift.participants?.length;
  return (
    <tr className="vtk-basic-row-detail">
      <td colSpan={5}>
        <div className="vtk-basic-shift-details">
          <Detail k="Start" v={fmtDateTime(shift.startTime)} />
          <Detail k="Einde" v={fmtDateTime(shift.endTime)} />
          <Detail k="Locatie" v={shift.location} />
          {shift.post ? <Detail k="Post" v={shift.post} /> : null}
          <Detail k="Beloning" v={String(shift.reward)} />
          <Detail k="Plaatsen" v={`${taken ?? '?'}/${shift.maxParticipants}`} />
          <Detail k="Beschrijving" v={shift.description} full />
        </div>
      </td>
    </tr>
  );
}

/** Bouwt een lokaal 7-daags venster [startdag, startdag + 7d) uit een `yyyy-MM-dd`-string. */
function dateWindow(startDate: string): { start: Date; end: Date } | null {
  const [y, m, d] = startDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { start: new Date(y, m - 1, d), end: new Date(y, m - 1, d + 7) };
}

export function AvailableShiftsTable({ locale }: { locale: Locale; userId: string }) {
  const dict = getDictionary(locale);

  const showToast = useToast();
  const shifts = useShiftList('/api/shift');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter/sorteer-instellingen voor de beschikbare shiften.
  const [postFilter, setPostFilter] = useState<string>('ALL');
  // Startdatum: toont shiften van deze dag tot maximaal 6 dagen verder.
  const [startDate, setStartDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Enkel de posten die effectief voorkomen tonen in de filter.
  const availablePosts = useMemo(() => {
    const set = new Set<string>();
    for (const s of shifts) if (s.post) set.add(s.post);
    return [...set].sort();
  }, [shifts]);

  const visibleShifts = useMemo(() => {
    const window = dateWindow(startDate);
    const list = shifts.filter((s) => {
      if (s.isRegistered) return false;
      if (postFilter !== 'ALL' && (s.post ?? '') !== postFilter) return false;
      if (window && (s.startTime < window.start || s.startTime >= window.end)) return false;
      return true;
    });
    list.sort((a, b) => {
      const cmp = a.startTime.getTime() - b.startTime.getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [shifts, postFilter, startDate, sortDir]);

  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className="vtk-basic-table-section">
      <h2 className="vtk-basic-table-title">Beschikbare shiften</h2>

      <div className="vtk-basic-toolbar">
        <label className="vtk-basic-field">
          <span className="vtk-basic-label">Post</span>
          <select
            className="vtk-basic-select"
            value={postFilter}
            onChange={(e) => setPostFilter(e.target.value)}
          >
            <option value="ALL">Alle posten</option>
            {availablePosts.map((post) => (
              <option key={post} value={post}>
                {post}
              </option>
            ))}
          </select>
        </label>

        <label className="vtk-basic-field">
          <span className="vtk-basic-label">Vanaf</span>
          <input
            type="date"
            className="vtk-basic-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="vtk-basic-badge"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          style={{ cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {sortDir === 'asc' ? '↑ Oplopend' : '↓ Aflopend'}
        </button>
      </div>

      <div className="vtk-basic-table-wrap">
        <table className="vtk-basic-table">
          <thead>
            <tr>
              <th>Shift</th>
              <th>Date</th>
              <th>Time</th>
              <th>Where</th>
              <th>Register</th>
            </tr>
          </thead>
          <tbody>
            {visibleShifts.length === 0 ? (
              <tr>
                <td colSpan={5} className="vtk-basic-table-empty">
                  Er zijn geen beschikbare shiften in deze periode.
                </td>
              </tr>
            ) : (
              visibleShifts.map((shift) => {
                const availableSpots =
                  shift.availableSpots ?? shift.maxParticipants - (shift.takenSpots ?? 0);
                const isFull = availableSpots <= 0;
                // Groen = ruim plaats, geel = nog 2 of minder vrij, rood = vol.
                const badgeVariant = isFull
                  ? 'vtk-basic-badge-danger'
                  : availableSpots <= 2
                    ? 'vtk-basic-badge-accent'
                    : 'vtk-basic-badge-success';

                return (
                  <Fragment key={shift.id}>
                    <tr className="vtk-basic-row-click" onClick={() => toggle(shift.id)}>
                      <td>{shift.name}</td>
                      <td>{fmtDate(shift.startTime)}</td>
                      <td>
                        {fmtTime(shift.startTime)}-{fmtTime(shift.endTime)}
                      </td>
                      <td>{shift.location}</td>
                      <td>
                        <button
                          type="button"
                          className={`vtk-basic-badge ${badgeVariant}`}
                          onClick={(e) => {
                            e.stopPropagation(); // niet de rij uitklappen bij registreren
                            registerShift(shift.id, showToast);
                          }}
                          disabled={isFull}
                          style={{
                            cursor: isFull ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Registreer ({shift.takenSpots}/{shift.maxParticipants})
                        </button>
                      </td>
                    </tr>
                    {expandedId === shift.id ? <ShiftDetailRow shift={shift} /> : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RegisteredShiftsTable({ locale }: { locale: Locale; userId: string }) {
  const dict = getDictionary(locale);

  const showToast = useToast();
  const shifts = useShiftList('/api/shift/register');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className="vtk-basic-table-section">
      <h2 className="vtk-basic-table-title">Mijn shiften</h2>
      <div className="vtk-basic-table-wrap">
        <table className="vtk-basic-table">
          <thead>
            <tr>
              <th>Shift</th>
              <th>Date</th>
              <th>Time</th>
              <th>Where</th>
              <th>Register</th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr>
                <td colSpan={5} className="vtk-basic-table-empty">
                  Je bent nog niet ingeschreven voor een shift.
                </td>
              </tr>
            ) : (
              shifts.map((shift) => (
                <Fragment key={shift.id}>
                  <tr className="vtk-basic-row-click" onClick={() => toggle(shift.id)}>
                    <td>{shift.name}</td>
                    <td>{fmtDate(shift.startTime)}</td>
                    <td>
                      {fmtTime(shift.startTime)}-{fmtTime(shift.endTime)}
                    </td>
                    <td>{shift.location}</td>
                    <td>
                      <button
                        type="button"
                        className="vtk-basic-badge vtk-basic-badge-danger"
                        onClick={(e) => {
                          e.stopPropagation(); // niet de rij uitklappen bij uitschrijven
                          unregisterShift(shift.id, showToast);
                        }}
                        style={{ cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Uitschrijven
                      </button>
                    </td>
                  </tr>
                  {expandedId === shift.id ? <ShiftDetailRow shift={shift} /> : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
