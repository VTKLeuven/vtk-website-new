'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input, Label, Select } from '@vtk/ui';
import { IconButton } from '@/components/ui/IconButton';
import { CheckIcon, CloseIcon, LinkIcon } from '@/components/ui/icons';
import { OTHER_SOURCE, useSourceLink } from '@/components/ticketing/admin/useSourceLink';
import { describeSource, SHAREABLE_SOURCES } from '@/lib/ticketing/source';

/**
 * De deelbare link van een bureau, met de herkomst erin (`?via=mail&c=week-3`).
 * Wie via die link inschrijft, staat op de tab Statistieken onder dat kanaal.
 * Dezelfde sleutels als de linkbouwer van de tickets (`useSourceLink`); enkel
 * de opmaak is die van het bureaubeheer.
 *
 * Kopieert enkel: er wordt niets bewaard, de link draagt alles zelf.
 */
export function BureauLinkButton({ nl, url, dateLabel }: { nl: boolean; url: string; dateLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label={nl ? 'Link maken' : 'Create link'}
        srLabel={`${nl ? 'Deelbare link maken' : 'Create a shareable link'}: ${dateLabel}`}
        onClick={() => setOpen(true)}
      >
        <LinkIcon />
      </IconButton>
      {open ? <BureauLinkDialog nl={nl} url={url} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function isOutsideDialog(clientX: number, clientY: number, dialog: HTMLDialogElement) {
  const rect = dialog.getBoundingClientRect();
  return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
}

function BureauLinkDialog({ nl, url: base, onClose }: { nl: boolean; url: string; onClose: () => void }) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pressedOutsideRef = useRef(false);
  const suppressCloseCountRef = useRef(0);
  const { channel, setChannel, custom, setCustom, campaign, setCampaign, url, copied, copy } = useSourceLink(base, '');
  const locale = nl ? 'nl' : 'en';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog.open) {
        suppressCloseCountRef.current += 1;
        dialog.close();
      }
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body)) {
        opener.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-vtk-blue/15 bg-vtk-surface-elevated p-5 text-vtk-ink shadow-lg backdrop:bg-zinc-900/40"
      aria-labelledby={`${id}-title`}
      {...({ closedby: 'any' } as Record<string, string>)}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        if (suppressCloseCountRef.current > 0) {
          suppressCloseCountRef.current -= 1;
          return;
        }
        if (event.currentTarget.open) return;
        onClose();
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
          onClose();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={`${id}-title`} className="font-semibold text-vtk-ink">
          {nl ? 'Deelbare link' : 'Shareable link'}
        </h2>
        <IconButton label={nl ? 'Sluiten' : 'Close'} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>
      <p className="mt-1 text-sm text-vtk-muted">
        {nl
          ? 'Kies waar je de link deelt. Wie ermee inschrijft, staat op de tab Statistieken onder dat kanaal.'
          : 'Pick where you will share the link. Whoever registers with it shows up under that channel on the Statistics tab.'}
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor={`${id}-channel`}>{nl ? 'Waar deel je de link?' : 'Where will you share it?'}</Label>
          <Select id={`${id}-channel`} value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="">{nl ? 'Geen kanaal (gewone link)' : 'No channel (plain link)'}</option>
            {SHAREABLE_SOURCES.map((key) => (
              <option key={key} value={key}>
                {describeSource(key, locale).label}
              </option>
            ))}
            <option value={OTHER_SOURCE}>{nl ? 'Iets anders...' : 'Something else...'}</option>
          </Select>
        </div>
        {channel === OTHER_SOURCE ? (
          <div>
            <Label htmlFor={`${id}-custom`}>{nl ? 'Naam van het kanaal' : 'Channel name'}</Label>
            <Input
              id={`${id}-custom`}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder={nl ? 'bv. toledo' : 'e.g. toledo'}
              maxLength={40}
            />
          </div>
        ) : null}
        {channel ? (
          <div>
            <Label htmlFor={`${id}-campaign`}>{nl ? 'Naam (optioneel)' : 'Name (optional)'}</Label>
            <Input
              id={`${id}-campaign`}
              value={campaign}
              onChange={(event) => setCampaign(event.target.value)}
              placeholder={nl ? 'bv. herinnering of affiche-cw' : 'e.g. reminder or poster-cw'}
              maxLength={40}
            />
            <p className="mt-1 text-xs text-vtk-muted">
              {nl
                ? 'Om twee mails of posts op hetzelfde kanaal uit elkaar te houden.'
                : 'To tell two emails or posts on the same channel apart.'}
            </p>
          </div>
        ) : null}
        <div>
          <Label htmlFor={`${id}-url`}>{nl ? 'Link' : 'Link'}</Label>
          <Input id={`${id}-url`} readOnly value={url} onFocus={(event) => event.target.select()} />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {nl ? 'Sluiten' : 'Close'}
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={copy}>
          {copied ? (
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon /> {nl ? 'Gekopieerd' : 'Copied'}
            </span>
          ) : nl ? (
            'Kopiëren'
          ) : (
            'Copy'
          )}
        </Button>
      </div>
    </dialog>
  );
}
