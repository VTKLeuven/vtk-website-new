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
      <span className="vtk-basic-shift-k">{k}</span>
      <span className="vtk-basic-shift-v">{v}</span>
    </div>
  );
}

/** De markering voor shiften die je zonder Nederlands kan doen. */
export function InternationalsBadge({ locale, compact }: { locale: Locale; compact?: boolean }) {
  const t = getDictionary(locale).shift;
  return (
    <span className="vtk-shift-intl" title={t.intl.hint}>
      <Globe aria-hidden="true" />
      <span className={compact ? 'vtk-sr-only' : undefined}>{t.intl.badge}</span>
    </span>
  );
}

/**
 * Het detailvenster van één shift: alles wat je moet weten voor je intekent
 * (tijden, plaats, beloning, plaatsen, de uitleg) plus de knop zelf. Wordt
 * geopend vanuit het weekrooster, de lijst en de rail.
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
  const taken = shift.takenSpots ?? shift.participants?.length;

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
    ? `${dateFmt.format(shift.startTime)} · ${fmtTime(shift.startTime)} ${fill(t.until, {
        time: fmtTime(shift.endTime),
      })}`
    : `${fmtDateTime(shift.startTime)} ${fill(t.until, { time: fmtDateTime(shift.endTime) })}`;

  async function act() {
    setBusy(true);
    const ok = registered
      ? await unregisterShift(shift.id, showToast, t)
      : await registerShift(shift.id, showToast, t);
    setBusy(false);
    // Enkel sluiten wanneer het lukte; anders blijft de toast bij het venster
    // staan waar de gebruiker net op klikte.
    if (ok) onClose();
  }

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
        <div className="vtk-shift-dialog-head">
          <div>
            <h2 className="vtk-shift-dialog-title" id="vtk-shift-dialog-title">
              {shift.name}
            </h2>
            <p className="vtk-shift-dialog-when">{when}</p>
          </div>
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

        <div className="vtk-shift-dialog-badges">
          {registered ? (
            <span className="vtk-basic-badge vtk-basic-badge-accent">{t.isRegistered}</span>
          ) : (
            <span className={`vtk-basic-badge vtk-basic-badge-${spotsVariant(shift)}`}>
              {spotsLabel(shift, t)}
            </span>
          )}
          {shift.openToInternationals ? <InternationalsBadge locale={locale} /> : null}
        </div>

        <div className="vtk-shift-dialog-body">
          {shift.description ? (
            <p className="vtk-shift-dialog-lead">{shift.description}</p>
          ) : null}

          <div className="vtk-basic-shift-details">
            <Detail k={t.detail.location} v={shift.location} />
            {shift.post ? <Detail k={t.detail.post} v={shift.post} /> : null}
            <Detail k={t.detail.reward} v={rewardLabel(shift.reward, t)} />
            <Detail k={t.detail.spots} v={`${taken ?? '?'}/${shift.maxParticipants}`} />
          </div>

          {/* Niet ingevuld = geen leeg kopje tonen. */}
          {shift.instructions?.trim() ? (
            <section className="vtk-shift-instructions">
              <h3>{t.instructions}</h3>
              <div className="prose-vtk">
                <Markdown>{shift.instructions}</Markdown>
              </div>
            </section>
          ) : null}
        </div>

        <div className="vtk-shift-dialog-foot">
          {locked ? <span className="vtk-shift-note">{t.error.tooLateToUnregister}</span> : null}
          <div className="vtk-shift-dialog-actions">
            <button type="button" className="vtk-basic-action vtk-shift-ghost" onClick={onClose}>
              {t.dialog.cancel}
            </button>
            <button
              type="button"
              className={`vtk-basic-action${registered ? ' vtk-basic-action-danger' : ''}`}
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
