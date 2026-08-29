'use client';

import { useEffect, useId, useState } from 'react';
import { Input, Label, Select, Textarea } from '@vtk/ui';
import { ElixirIcon } from '@/components/elixir-icon';
import { SaveForm } from '@/components/ui/save-form';
import { submitTakedownAction } from '@/app/actions/takedown';

/**
 * "Deze foto laten verwijderen", vanuit de lightbox.
 *
 * Wie op een foto staat en die weg wil, moet dat kunnen vragen zonder eerst een
 * mailadres op te zoeken. Bewust geen login: wie op een fakbarfoto staat is niet
 * per se lid, en een drempel hoort hier niet.
 *
 * Album en foto staan in verborgen velden; de bezoeker hoeft niet uit te leggen
 * over welke foto het gaat. De server zoekt ze daarna nog eens op in deze
 * galerij, dus een gemanipuleerd formulier levert niets op.
 */

const ERROR_MESSAGES: Record<string, string> = {
  NAME_REQUIRED: 'Vul je naam in.',
  NAME_TOO_LONG: 'Die naam is te lang.',
  EMAIL_REQUIRED: 'Vul je e-mailadres in, anders kunnen we niet antwoorden.',
  EMAIL_INVALID: 'Dat is geen geldig e-mailadres.',
  EMAIL_TOO_LONG: 'Dat e-mailadres is te lang.',
  REASON_INVALID: 'Kies een reden.',
  MESSAGE_TOO_LONG: 'Je toelichting is te lang; vat ze wat korter samen.',
  PHOTO_UNKNOWN: 'Deze foto bestaat niet meer. Herlaad de pagina.',
  RATE_LIMITED: 'Je stuurde net al enkele verzoeken. Probeer het over een kwartier opnieuw.',
  SAVE_FAILED: 'Het verzoek kon niet opgeslagen worden. Probeer het zo meteen opnieuw.',
};

export function TakedownDialog({
  albumSlug,
  assetId,
  photoTitle,
}: {
  albumSlug: string;
  assetId: string;
  photoTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const fieldId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="fakbar-lightbox-button"
        onClick={() => setOpen(true)}
        title="Deze foto laten verwijderen"
      >
        <ElixirIcon name="trash" className="h-4 w-4" />
        <span className="sr-only">Deze foto laten verwijderen</span>
      </button>

      {open ? (
        <div
          className="fakbar-takedown-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Deze foto laten verwijderen"
          onClick={() => setOpen(false)}
        >
          <div className="fakbar-takedown-panel" onClick={(event) => event.stopPropagation()}>
            <div className="fakbar-takedown-head">
              <div>
                <h2>Deze foto laten verwijderen</h2>
                <p>{photoTitle}</p>
              </div>
              <button
                type="button"
                className="fakbar-takedown-close"
                onClick={() => setOpen(false)}
                title="Sluiten"
                aria-label="Sluiten"
              >
                <ElixirIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            {done ? (
              <div className="fakbar-takedown-done">
                <p>
                  Je verzoek is doorgegeven aan de fakbar. Je krijgt antwoord op het adres dat je opgaf; er is geen
                  automatische bevestigingsmail.
                </p>
                <button type="button" className="fakbar-btn fakbar-btn-primary" onClick={() => setOpen(false)}>
                  Sluiten
                </button>
              </div>
            ) : (
              <SaveForm
                action={submitTakedownAction}
                submitLabel="Verzoek versturen"
                savingLabel="Versturen…"
                savedMessage="Je verzoek is doorgegeven."
                errorMessages={ERROR_MESSAGES}
                fallbackErrorMessage="Het verzoek kon niet verstuurd worden. Probeer opnieuw."
                onSuccess={() => setDone(true)}
                className="fakbar-takedown-form"
              >
                <input type="hidden" name="albumSlug" value={albumSlug} />
                <input type="hidden" name="assetId" value={assetId} />
                {/* Honeypot: onzichtbaar voor mensen, onweerstaanbaar voor bots. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="fakbar-visually-hidden"
                />

                <div>
                  <Label htmlFor={`${fieldId}-name`}>Je naam</Label>
                  <Input id={`${fieldId}-name`} name="name" required maxLength={120} autoComplete="name" />
                </div>

                <div>
                  <Label htmlFor={`${fieldId}-email`}>Je e-mailadres</Label>
                  <Input id={`${fieldId}-email`} name="email" type="email" required maxLength={254} autoComplete="email" />
                </div>

                <div>
                  <Label htmlFor={`${fieldId}-reason`}>Waarom</Label>
                  <Select id={`${fieldId}-reason`} name="reason" defaultValue="ON_PHOTO" required>
                    <option value="ON_PHOTO">Ik sta op deze foto</option>
                    <option value="COPYRIGHT">Auteursrecht op het beeld</option>
                    <option value="OTHER">Andere reden</option>
                  </Select>
                </div>

                <div>
                  <Label htmlFor={`${fieldId}-message`}>Toelichting (optioneel)</Label>
                  <Textarea id={`${fieldId}-message`} name="message" rows={3} maxLength={2000} />
                </div>

                <p className="fakbar-takedown-note">
                  De fakbar bekijkt je verzoek en antwoordt je per mail. Je gegevens worden enkel gebruikt om dit
                  verzoek af te handelen.
                </p>
              </SaveForm>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
