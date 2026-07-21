'use client';

import { useState } from 'react';
import { Button } from '@vtk/ui';
import { Modal } from '../admin-table';

/**
 * Toont een client secret precies één keer.
 *
 * De database bewaart enkel een hash, dus dit is de enige kans om de waarde te
 * kopiëren; sluiten betekent rotatie als het niet bewaard is. Het secret staat
 * bewust alleen hier en gaat niet in een lijst of in de paginastatus.
 */
export function SecretOnceModal({
  secret,
  clientId,
  nl,
  hideSecret = false,
  onClose,
}: {
  secret: string;
  clientId?: string;
  nl: boolean;
  /** Publieke clients (browser/native) krijgen geen secret; toon dan enkel het id. */
  hideSecret?: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Modal
      title={hideSecret ? (nl ? 'Applicatie aangemaakt' : 'Application created') : 'Client secret'}
      onClose={onClose}
    >
      <div className="space-y-3">
        <p className="text-sm text-amber-800">
          {hideSecret
            ? nl
              ? 'Deze app kan geen geheim bewaren en krijgt er dus geen. Ze beveiligt haar aanmeldingen met PKCE.'
              : 'This app cannot keep a secret and therefore gets none. It secures its sign-ins with PKCE.'
            : nl
              ? 'Kopieer dit nu. Het is hierna niet meer op te vragen; ben je het kwijt, dan moet je een nieuw secret genereren.'
              : 'Copy this now. It cannot be retrieved later; if you lose it you must rotate to a new one.'}
        </p>

        {clientId && (
          <div>
            <div className="text-xs text-zinc-500">Client ID</div>
            <code className="block break-all rounded bg-zinc-100 p-2 text-xs">{clientId}</code>
          </div>
        )}

        <div className={hideSecret ? 'hidden' : undefined}>
          <div className="text-xs text-zinc-500">Client secret</div>
          <code className="block break-all rounded bg-zinc-100 p-2 text-xs">{secret}</code>
        </div>

        {!hideSecret && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(secret);
              setCopied(true);
            }}
          >
            {copied ? (nl ? 'Gekopieerd' : 'Copied') : nl ? 'Kopiëren' : 'Copy'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
