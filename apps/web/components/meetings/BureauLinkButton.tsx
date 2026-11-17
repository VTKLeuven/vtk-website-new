'use client';

import { useEffect, useId, useState } from 'react';
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

function BureauLinkDialog({ nl, url: base, onClose }: { nl: boolean; url: string; onClose: () => void }) {
  const id = useId();
  const { channel, setChannel, custom, setCustom, campaign, setCampaign, url, copied, copy } = useSourceLink(base, '');
  const locale = nl ? 'nl' : 'en';

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-vtk-blue/15 bg-vtk-surface-elevated p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
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
      </div>
    </div>
  );
}
