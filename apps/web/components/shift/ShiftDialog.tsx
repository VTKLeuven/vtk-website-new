'use client';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Globe } from 'lucide-react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canUnregister } from '@/lib/shift';
import { useToast } from '@/components/ui/toast';
import dynamic from 'next/dynamic';

// Via `next/dynamic`: de markdown-renderer (react-markdown, micromark en, via de
// fotogalerij, beide woordenboeken) is ~80 KB gzip. Statisch geïmporteerd kwam
// hij in een chunk die de bundler deelt met `Link` en dus op elke pagina laadde;
// zo komt hij enkel mee waar er echt markdown gerenderd wordt.
const Markdown = dynamic(() => import('@/components/ui/Markdown').then((m) => m.Markdown));
import {
  fill,
  fmtDateTime,
  fmtTime,
  freeSpots,
  postLabel,
  registerShift,
  spotsLabel,
  spotsSpoken,
  spotsVariant,
  takenSpots,
  unregisterShift,
  viewerRewardLabel,
  type MergedShift,
  type PostNames,
} from './shiftData';
import './shift-board.css';

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/**
 * De markering voor shiften die je zonder Nederlands kan doen.
 *
 * De tekst staat er altijd bij. Enkel een wereldbol was een raadsel: wie ze niet
 * herkende, zag geen reden om zich in te schrijven, en net die persoon is hier
 * het publiek. Ze staat ook op de Nederlandse site in het Engels, want ze is aan
 * internationals gericht en niet aan wie de rest van de pagina al leest.
 */
export function InternationalsBadge({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).shift;
  return (
    <span className="vtk-shift-intl" title={t.intl.hint}>
      <Globe aria-hidden="true" />
      <span lang={locale === 'nl' ? 'en' : undefined}>{t.intl.badge}</span>
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

function isOutsideDialog(clientX: number, clientY: number, dialog: HTMLDialogElement) {
  const rect = dialog.getBoundingClientRect();
  return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
}

/**
 * Het detailvenster van één shift volgens Richting A (Kalenderblad):
 * donkere navy kop met het technisch patroon, gele datumpin die eronder hangt,
 * gele onderstreping van de titel, facts-rooster, initialenlijst van ingeschrevenen
 * en instructies met gele ruitjes.
 */
export function ShiftDialog({
  locale,
  entry,
  postNames,
  onClose,
  signInHref,
  onSuccess,
}: {
  locale: Locale;
  entry: MergedShift;
  postNames: PostNames;
  onClose: () => void;
  signInHref?: string;
  onSuccess?: (registered: boolean) => void;
}) {
  const t = getDictionary(locale).shift;
  const showToast = useToast();
  const titleId = useId();
  const rosterTitleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const suppressCloseCountRef = useRef(0);
  const pressedOutsideRef = useRef(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [busy, setBusy] = useState(false);
  // Klok bij openen: de 24u-grens verschuift niet terwijl het venster openstaat.
  const [now] = useState(() => Date.now());

  const { shift, registered } = entry;
  const isFull = !registered && freeSpots(shift) <= 0;
  const locked = registered && !canUnregister(shift, now);
  const free = freeSpots(shift);
  const taken = takenSpots(shift);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    closingRef.current = false;
    const activeElement = document.activeElement;
    if (!openerRef.current && activeElement instanceof HTMLElement && !dialog.contains(activeElement)) {
      openerRef.current = activeElement;
    }

    if (!dialog.open) {
      dialog.showModal();
    }
    closeBtnRef.current?.focus({ preventScroll: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) {
        suppressCloseCountRef.current += 1;
        dialog.close();
      }
      const opener = openerRef.current;
      if (opener && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
    }
  }

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
    if (ok) {
      onSuccess?.(!registered);
      requestClose();
    }
  }

  const freeLabel = free === 1 ? t.spots.one : fill(t.spots.few, { n: free });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="vtk-shift-dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      {...({ closedby: 'any' } as Record<string, string>)}
      onKeyDown={handleKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={(event) => {
        if (suppressCloseCountRef.current > 0) {
          suppressCloseCountRef.current -= 1;
          return;
        }
        if (event.currentTarget.open) return;
        requestClose();
      }}
      onPointerDown={(event) => {
        if ('closedBy' in HTMLDialogElement.prototype) {
          pressedOutsideRef.current = false;
          return;
        }
        pressedOutsideRef.current =
          event.target === event.currentTarget &&
          isOutsideDialog(event.clientX, event.clientY, event.currentTarget);
      }}
      onPointerUp={(event) => {
        if ('closedBy' in HTMLDialogElement.prototype) return;
        const wasOutside = pressedOutsideRef.current;
        pressedOutsideRef.current = false;
        if (
          wasOutside &&
          event.target === event.currentTarget &&
          isOutsideDialog(event.clientX, event.clientY, event.currentTarget)
        ) {
          requestClose();
        }
      }}
    >
      <div className="vtk-shift-dialog-top">
        {shift.post ? (
          <span className="vtk-shift-dialog-top-post">{postLabel(shift.post, postNames)}</span>
        ) : null}
        <span className="vtk-shift-dialog-top-when">{when}</span>

        {/* Hangende gele datumpin van Richting A */}
        <span className="vtk-shift-pin vtk-shift-dialog-pin" aria-hidden="true">
          <i>{dowStr}</i>
          <b>{shift.startTime.getDate()}</b>
          <i>{monthStr}</i>
        </span>

        <button
          ref={closeBtnRef}
          type="button"
          className="vtk-shift-dialog-close"
          onClick={requestClose}
          aria-label={t.dialog.close}
          title={t.dialog.close}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="vtk-shift-dialog-body">
        <div className="vtk-shift-dialog-tags">
          {registered ? (
            <span className="vtk-shift-spots vtk-shift-spots-mine">
              {t.isRegistered}
            </span>
          ) : (
            <span
              className={`vtk-shift-spots vtk-shift-spots-${spotsVariant(shift)}`}
              aria-label={spotsSpoken(shift, t)}
            >
              {spotsLabel(shift)}
            </span>
          )}
          {shift.openToInternationals ? <InternationalsBadge locale={locale} /> : null}
        </div>

        <h2 className="vtk-shift-dialog-title" id={titleId}>
          {shift.name}
        </h2>

        {shift.description ? (
          <p className="vtk-shift-dialog-lead">{shift.description}</p>
        ) : null}

        <dl className="vtk-shift-facts">
          <Detail k={t.detail.location} v={shift.location} />
          {shift.post ? <Detail k={t.detail.post} v={postLabel(shift.post, postNames)} /> : null}
          <Detail k={t.detail.reward} v={viewerRewardLabel(shift, t)} />
          <Detail
            k={t.detail.spots}
            v={fill(t.spots.taken, { taken, max: shift.maxParticipants })}
          />
        </dl>

        {/* Enkel namen, geen profielfoto: zie docs/design-decisions.md */}
        {shift.roster ? (
          <section className="vtk-shift-sec" aria-labelledby={rosterTitleId}>
            <h3 id={rosterTitleId}>{t.roster.title}</h3>
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
              <Markdown locale={locale} baseHeadingLevel={4}>
                {shift.instructions}
              </Markdown>
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
            onClick={requestClose}
          >
            {t.dialog.cancel}
          </button>
          {signInHref && !registered ? (
            <a href={signInHref} className="vtk-shift-btn">
              {t.register}
            </a>
          ) : (
            <button
              type="button"
              className={`vtk-shift-btn${registered ? ' vtk-shift-btn-danger' : ''}`}
              disabled={busy || isFull || locked}
              onClick={act}
            >
              {registered ? t.unregister : t.register}
            </button>
          )}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
