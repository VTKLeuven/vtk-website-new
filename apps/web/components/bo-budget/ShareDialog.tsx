'use client';

import { useState } from 'react';
import { Button, ConfirmDialog } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
import { UNSENT, unsentGuard } from '@/components/ui/unsentGuard';
import { setBudgetShareAction } from '@/app/actions/boBudgets';

/*
 * Een budget delen met een link: één om te bekijken (voor in de slides van het
 * BO, of voor wie mee wil lezen) en één om aan te passen (voor een kring
 * waarmee je samenwerkt en die niet in de admin kan). Wie de link heeft, heeft
 * toegang; daarom staat erbij wat dat betekent en kan je hem intrekken.
 */

type Links = { viewToken: string | null; editToken: string | null; origin: string };

export function ShareDialog({
  budgetId,
  initial,
  locale,
  onClose,
}: {
  budgetId: string;
  initial: Links;
  locale: 'nl' | 'en';
  onClose: () => void;
}) {
  const nl = locale === 'nl';
  const showToast = useToast();
  const [links, setLinks] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<'view' | 'edit' | null>(null);
  const [copied, setCopied] = useState<'view' | 'edit' | null>(null);
  const url = (token: string) => `${links.origin}${nl ? '' : '/en'}/budget/${token}`;

  async function set(kind: 'view' | 'edit', on: boolean) {
    setBusy(true);
    const result = await unsentGuard.run(() => setBudgetShareAction({ id: budgetId, kind, on }));
    setBusy(false);
    if (result === UNSENT) return;
    if (result.status === 'success' && result.links) {
      setLinks((l) => ({ ...l, ...result.links }));
      showToast({
        message: on
          ? nl
            ? 'Link gemaakt. Een vorige link van deze soort werkt niet meer.'
            : 'Link created. A previous link of this kind no longer works.'
          : nl
            ? 'Link ingetrokken: wie hem had, kan er niet meer mee binnen.'
            : 'Link revoked.',
        variant: 'success',
      });
    } else
      showToast({
        message: nl ? 'Dat lukte niet. Probeer het opnieuw.' : 'That failed. Try again.',
        variant: 'error',
        duration: 0,
      });
  }

  async function copy(kind: 'view' | 'edit', token: string) {
    try {
      await navigator.clipboard.writeText(url(token));
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      showToast({
        message: nl ? 'Kopiëren lukte niet; selecteer de link en kopieer hem zelf.' : 'Copying failed.',
        variant: 'error',
        duration: 0,
      });
    }
  }

  const rows: { kind: 'view' | 'edit'; token: string | null; title: string; text: string }[] = [
    {
      kind: 'view',
      token: links.viewToken,
      title: nl ? 'Link om te bekijken' : 'Link to view',
      text: nl
        ? 'Opent de nakijkweergave, zonder inloggen en zonder iets te kunnen wijzigen. Voor in de slides van het BO.'
        : 'Opens the review view, without logging in and without being able to change anything.',
    },
    {
      kind: 'edit',
      token: links.editToken,
      title: nl ? 'Link om aan te passen' : 'Link to edit',
      text: nl
        ? 'Wie deze link heeft, kan het budget wijzigen zonder account. Voor een kring waarmee je samenwerkt. Verwijderen en delen kan enkel je eigen post.'
        : 'Anyone with this link can change the budget without an account. Deleting and sharing stay with your own post.',
    },
  ];

  return (
    <div className="vtk-bud-share-root" role="dialog" aria-modal="true" aria-labelledby="bud-share-h">
      <button type="button" className="vtk-bud-panel-bg" aria-label={nl ? 'Sluiten' : 'Close'} onClick={onClose} />
      <div className="vtk-bud-share">
        <h2 id="bud-share-h" className="vtk-bud-h2">
          {nl ? 'Dit budget delen' : 'Share this budget'}
        </h2>
        {rows.map((row) => (
          <section key={row.kind} className="vtk-bud-share-row">
            <h3>{row.title}</h3>
            <p className="vtk-bud-fine">{row.text}</p>
            {row.token ? (
              <>
                <input
                  className="vtk-bud-input"
                  readOnly
                  value={url(row.token)}
                  aria-label={row.title}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="vtk-bud-inline">
                  <Button size="sm" onClick={() => void copy(row.kind, row.token!)}>
                    {copied === row.kind ? (nl ? 'Gekopieerd' : 'Copied') : nl ? 'Kopieer link' : 'Copy link'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRevoking(row.kind)}>
                    {nl ? 'Intrekken' : 'Revoke'}
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void set(row.kind, true)}>
                {nl ? 'Link maken' : 'Create link'}
              </Button>
            )}
          </section>
        ))}
        <div className="vtk-bud-share-foot">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {nl ? 'Sluiten' : 'Close'}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={revoking !== null}
        title={nl ? 'Deze link intrekken?' : 'Revoke this link?'}
        description={
          nl
            ? `De link om te ${revoking === 'edit' ? 'bewerken' : 'bekijken'} werkt meteen niet meer, ook niet in slides of mails waar hij al in staat. Het budget zelf en de andere link blijven zoals ze zijn; je kan later een nieuwe link maken.`
            : 'The link stops working immediately, also where it was already pasted. The budget itself and the other link stay as they are.'
        }
        confirmLabel={nl ? 'Link intrekken' : 'Revoke link'}
        cancelLabel={nl ? 'Annuleren' : 'Cancel'}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          const kind = revoking;
          setRevoking(null);
          if (kind) void set(kind, false);
        }}
      />
    </div>
  );
}
