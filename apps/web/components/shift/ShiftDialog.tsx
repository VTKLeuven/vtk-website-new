'use client';
import { useEffect, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canUnregister } from '@/lib/shift';
import { useToast } from '@/components/ui/toast';
import { Markdown } from '@/components/ui/Markdown';
import {
  fill,
  fmtDateTime,
  fmtTime,
  freeSpots,
  registerShift,
  rewardLabel,
  spotsLabel,
  spotsVariant,
  unregisterShift,
  type MergedShift,
} from './shiftData';

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** De markering voor shiften die je zonder Nederlands kan doen. */
export function InternationalsBadge({ locale, compact }: { locale: Locale; compact?: boolean }) {
  const t = getDictionary(locale).shift;
  return (
    <span className={`vtk-shift-intl${compact ? ' vtk-shift-intl-compact' : ''}`} title={t.intl.hint}>
      <Globe aria-hidden="true" />
      <span className={compact ? 'vtk-sr-only' : undefined}>{t.intl.badge}</span>
    </span>
  );
}

const DOW_SHORT: Record<Locale, string[]> = {
  nl: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
};

const MONTH_SHORT: Record<Locale, string[]> = {
  nl: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/**
 * Het detailvenster van één shift volgens Richting A (Kalenderblad):
 * donkere navy kop met het technisch patroon, gele datumpin die eronder hangt,
 * gele onderstreping van de titel, facts-rooster, initialenlijst van ingeschrevenen
 * en instructies met gele ruitjes.
 */
export function ShiftDialog({
  locale,
  entry,
  onClose,
}: {
  locale: Locale;
  entry: MergedShift;
  onClose: () => void;
}) {
  const t = getDictionary(locale).shift;
  const showToast = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  // Klok bij openen: de 24u-grens verschuift niet terwijl het venster openstaat.
  const [now] = useState(() => Date.now());

  const { shift, registered } = entry;
  const isFull = !registered && freeSpots(shift) <= 0;
  const locked = registered && !canUnregister(shift, now);
  const free = freeSpots(shift);
  const taken = shift.takenSpots ?? shift.participants?.length ?? 0;

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dateFmt = new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const sameDay = shift.startTime.toDateString() === shift.endTime.toDateString();
  const when = sameDay
    ? `${dateFmt.format(shift.startTime)}, ${fmtTime(shift.startTime)} ${fill(t.until, {
        time: fmtTime(shift.endTime),
      })}`
    : `${fmtDateTime(shift.startTime)} ${fill(t.until, { time: fmtDateTime(shift.endTime) })}`;

  const dowStr = DOW_SHORT[locale][shift.startTime.getDay()];
  const monthStr = MONTH_SHORT[locale][shift.startTime.getMonth()];

  async function act() {
    setBusy(true);
    const ok = registered
      ? await unregisterShift(shift.id, showToast, t)
      : await registerShift(shift.id, showToast, t);
    setBusy(false);
    if (ok) onClose();
  }

  const freeLabel = free === 1 ? t.spots.one : fill(t.spots.few, { n: free });

  return (
    <div className="vtk-shift-overlay" onClick={onClose}>
      <div
        className="vtk-shift-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vtk-shift-dialog-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vtk-shift-dialog-top">
          {shift.post ? <span className="vtk-shift-dialog-top-post">{shift.post}</span> : null}
          <span className="vtk-shift-dialog-top-when">{when}</span>

          {/* Hangende gele datumpin van Richting A */}
          <span className="vtk-shift-pin vtk-shift-dialog-pin" aria-hidden="true">
            <i>{dowStr}</i>
            <b>{shift.startTime.getDate()}</b>
            <i>{monthStr}</i>
          </span>

          <button
            type="button"
            className="vtk-shift-dialog-close"
            onClick={onClose}
            aria-label={t.dialog.close}
            title={t.dialog.close}
          >
            ✕
          </button>
        </div>

        <div className="vtk-shift-dialog-body">
          <div className="vtk-shift-dialog-tags">
            {registered ? (
              <span className="vtk-shift-spots vtk-shift-spots-mine">
                {t.isRegistered}
              </span>
            ) : (
              <span className={`vtk-shift-spots vtk-shift-spots-${spotsVariant(shift)}`}>
                {spotsLabel(shift, t)}
              </span>
            )}
            {shift.openToInternationals ? <InternationalsBadge locale={locale} /> : null}
          </div>

          <h2 className="vtk-shift-dialog-title" id="vtk-shift-dialog-title">
            {shift.name}
          </h2>

          {shift.description ? (
            <p className="vtk-shift-dialog-lead">{shift.description}</p>
          ) : null}

          <dl className="vtk-shift-facts">
            <Detail k={t.detail.location} v={shift.location} />
            {shift.post ? <Detail k={t.detail.post} v={shift.post} /> : null}
            <Detail k={t.detail.reward} v={rewardLabel(shift.reward, t)} />
            <Detail
              k={t.detail.spots}
              v={fill(t.spots.taken, { taken, max: shift.maxParticipants })}
            />
          </dl>

          {/* Enkel namen, geen profielfoto: zie docs/design-decisions.md */}
          {shift.roster ? (
            <section className="vtk-shift-sec" aria-labelledby="vtk-shift-roster-title">
              <h3 id="vtk-shift-roster-title">{t.roster.title}</h3>
              {shift.roster.length === 0 ? (
                <p className="vtk-shift-roster-empty">{t.roster.empty}</p>
              ) : (
                <ul className="vtk-shift-roster-list">
                  {shift.roster.map((person, index) => (
                    <li
                      key={`${index}-${person.name}`}
                      className="vtk-shift-person"
                      data-self={person.isSelf ? 'true' : undefined}
                    >
                      <span className="vtk-shift-person-initial" aria-hidden="true">
                        {person.name.trim().slice(0, 1).toUpperCase() || '?'}
                      </span>
                      <span>
                        {person.name}
                        {person.isSelf ? (
                          <span className="vtk-shift-person-you"> ({t.roster.you})</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                  {free > 0 && !registered ? (
                    <li className="vtk-shift-person vtk-shift-person-open">
                      {freeLabel}
                    </li>
                  ) : null}
                </ul>
              )}
            </section>
          ) : null}

          {/* Instructies met gele ruitjes */}
          {shift.instructions?.trim() ? (
            <section className="vtk-shift-sec">
              <h3>{t.instructions}</h3>
              <div className="vtk-shift-instructions-prose prose-vtk">
                <Markdown>{shift.instructions}</Markdown>
              </div>
            </section>
          ) : null}
        </div>

        <div className="vtk-shift-dialog-foot">
          {locked ? (
            <span className="vtk-shift-dialog-note">{t.error.tooLateToUnregister}</span>
          ) : (
            <span />
          )}
          <div className="vtk-shift-dialog-actions">
            <button
              type="button"
              className="vtk-shift-btn vtk-shift-btn-ghost"
              onClick={onClose}
            >
              {t.dialog.cancel}
            </button>
            <button
              type="button"
              className={`vtk-shift-btn${registered ? ' vtk-shift-btn-danger' : ''}`}
              disabled={busy || isFull || locked}
              onClick={act}
            >
              {registered ? t.unregister : t.register}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
