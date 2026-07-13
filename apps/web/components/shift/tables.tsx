'use client';
import { Fragment, useEffect, useState } from 'react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { parseShiftArray, type ShiftResponse } from '@/lib/shift';
import { useToast } from '@/components/ui/toast';
import { format } from 'date-fns';
import '@/app/design/vtk-basic.css';

/**
 * Kleine event-bus zodat een (uit)schrijving in de ene tabel de andere laat
 * herladen, zónder gedeelde wrapper-component. Zo houdt page.tsx volledige
 * controle over waar elke tabel staat.
 */
const shiftsChanged = new EventTarget();
function emitShiftsChanged() {
  shiftsChanged.dispatchEvent(new Event('changed'));
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

const fmtDate = (d: Date) => format(d, 'dd/MM/yyyy');
const fmtTime = (d: Date) => format(d, 'HH:mm'); // 24-uursnotatie (niet 'hh', dat is 12u zonder AM/PM)
const fmtDateTime = (d: Date) => format(d, 'dd/MM/yyyy HH:mm');

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

/**
 * Haalt een shift-lijst op van `url`, herlaadt bij mount en telkens een andere
 * tabel een (uit)schrijving signaleert via de event-bus.
 */
function useShiftList(url: string): ShiftResponse[] {
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

export function AvailableShiftsTable({ locale, userId }: { locale: Locale; userId: string }) {
  const dict = getDictionary(locale);

  const showToast = useToast();
  const shifts = useShiftList('/api/shift');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  async function registerForShift(id: string) {
    const resp = await fetch('/api/shift/register?id=' + id, { method: 'POST' });

    if (resp.ok) {
      showToast({ variant: 'success', message: 'Je bent ingeschreven voor deze shift.' });
      emitShiftsChanged(); // ververst deze tabel én de geregistreerde tabel
    } else {
      showToast({ variant: 'error', message: registerErrorMessage(await safeJson(resp)) });
    }
  }

  return (
    <div className="vtk-basic-table-section">
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
            {shifts.map((shift) => {
              if (shift.isRegistered) return null; // return no row if person is registered

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
                          registerForShift(shift.id);
                        }}
                        disabled={isFull}
                        style={{ cursor: isFull ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                      >
                        Registreer ({shift.takenSpots}/{shift.maxParticipants})
                      </button>
                    </td>
                  </tr>
                  {expandedId === shift.id ? <ShiftDetailRow shift={shift} /> : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RegisteredShiftsTable({ locale, userId }: { locale: Locale; userId: string }) {
  const dict = getDictionary(locale);

  const showToast = useToast();
  const shifts = useShiftList('/api/shift/register');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  async function unregisterForShift(id: string) {
    const resp = await fetch('/api/shift/register?id=' + id, { method: 'DELETE' });

    if (resp.ok) {
      showToast({ variant: 'success', message: 'Je bent uitgeschreven voor deze shift.' });
      emitShiftsChanged(); // ververst deze tabel én de beschikbare tabel
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

  return (
    <div className="vtk-basic-table-section">
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
            {shifts.map((shift) => (
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
                        unregisterForShift(shift.id);
                      }}
                      style={{ cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Uitschrijven
                    </button>
                  </td>
                </tr>
                {expandedId === shift.id ? <ShiftDetailRow shift={shift} /> : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
