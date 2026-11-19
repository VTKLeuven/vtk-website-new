'use client';

import { useState } from 'react';
import { Input, Label } from '@vtk/ui';
import { AdminDisclosure } from '@/components/admin/AdminDisclosure';
import { ImageFocusField } from '@/components/admin/ImageFocusField';
import { StorageImageField } from '@/components/admin/StorageImageField';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { focusPosition } from '@/lib/imageFocus';
import type { MomentDraft } from '@/lib/calendar/momentDraft';
import { storageKeyPath } from '@/lib/storageKeyPath';
import { LangTabs, type Lang } from './LangTabs';

/** Dezelfde grens als in `momentForm.ts`; dat bestand mag niet in de browser (zod). */
const DESCRIPTION_MAX = 20_000;

/**
 * Wat enkel voor dit ene moment geldt: een andere locatie, een eigen tekst, een
 * eigen affiche. Alles is optioneel en leeg volgt het evenement.
 *
 * Dicht tot je het nodig hebt: een reeks heeft al snel tien rijen, en bij de
 * meeste staat hier niets. De kop zegt wat er ingevuld is, zodat je het moment
 * met de andere startplaats terugvindt zonder elke rij open te klikken.
 *
 * De waarden zitten in de rij van `EventWhenField` en gaan mee in het verborgen
 * `moments`-veld. De `name` van de twee fotovelden is dus enkel om hun verborgen
 * velden uit de weg te houden: met de standaardnaam zou de upload van een moment
 * als affiche van het hele evenement opgeslagen worden.
 */
export function EventMomentDetails({
  rowKey,
  draft,
  locale,
  onChange,
}: {
  rowKey: string;
  draft: MomentDraft;
  locale: 'nl' | 'en';
  onChange: (changes: Partial<MomentDraft>) => void;
}) {
  const nl = locale === 'nl';
  const [lang, setLang] = useState<Lang>('nl');
  const imageUrl = draft.imageKey ? `/api/media/${storageKeyPath(draft.imageKey)}` : null;
  const focus = { x: draft.imageFocusX, y: draft.imageFocusY };
  const locationId = `moment-location-${rowKey}`;
  const descriptionId = `moment-description-${rowKey}`;
  const descriptionField = lang === 'nl' ? 'descriptionNl' : 'descriptionEn';

  const filled = [
    draft.location.trim() ? `${nl ? 'locatie' : 'location'}: ${draft.location.trim()}` : null,
    draft.descriptionNl.trim() || draft.descriptionEn.trim() ? (nl ? 'eigen tekst' : 'own text') : null,
    draft.imageKey ? (nl ? 'eigen affiche' : 'own poster') : null,
  ].filter(Boolean);

  return (
    <AdminDisclosure
      variant="row"
      summary={
        <>
          <span className="block text-sm font-medium text-vtk-ink">
            {nl ? 'Eigen locatie, tekst en affiche' : 'Own location, text and poster'}
          </span>
          <span className="block text-xs text-vtk-muted">
            {filled.length > 0
              ? filled.join(', ')
              : nl
                ? 'Niets ingevuld: dit moment volgt het evenement'
                : 'Nothing filled in: this moment follows the event'}
          </span>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor={locationId}>{nl ? 'Locatie' : 'Location'}</Label>
          <Input
            id={locationId}
            value={draft.location}
            maxLength={300}
            placeholder={nl ? 'Leeg = de locatie van het evenement' : 'Empty = the location of the event'}
            onChange={(e) => onChange({ location: e.target.value })}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <Label htmlFor={descriptionId}>
              {lang === 'nl' ? (nl ? 'Eigen tekst (NL)' : 'Own text (NL)') : nl ? 'Eigen tekst (EN)' : 'Own text (EN)'}
            </Label>
            <LangTabs value={lang} onChange={setLang} nl={nl} />
          </div>
          <MarkdownEditor
            key={lang}
            value={draft[descriptionField]}
            onChange={(value) => onChange({ [descriptionField]: value })}
            locale={locale}
            rows={4}
            allowImages={false}
            maxLength={DESCRIPTION_MAX}
            textareaId={descriptionId}
          />
          <p className="mt-1 text-xs text-vtk-muted">
            {nl
              ? 'Staat op de eventpagina zolang dit het eerstvolgende moment is, boven de algemene tekst van het evenement.'
              : 'Shown on the event page while this is the next moment, above the general text of the event.'}
          </p>
        </div>

        <StorageImageField
          name={`momentImage-${rowKey}`}
          defaultKey={draft.imageKey}
          locale={locale}
          label={nl ? 'Eigen affiche' : 'Own poster'}
          helpText={
            nl
              ? 'Neemt de plaats van de affiche van het evenement in, op de eventpagina, de kaarten en de homepage, zolang dit het eerstvolgende moment is.'
              : 'Replaces the poster of the event, on the event page, the cards and the home page, while this is the next moment.'
          }
          minWidth={1600}
          previewPosition={focusPosition(focus)}
          srContext={draft.date}
          onChange={(key) => onChange({ imageKey: key })}
        />
        {imageUrl ? (
          <ImageFocusField
            name={`momentImageFocus-${rowKey}`}
            imageUrl={imageUrl}
            defaultFocus={focus}
            locale={locale}
            label={nl ? 'Deel van de foto dat in beeld blijft' : 'Part of the photo that stays in view'}
            previews={[
              { label: nl ? 'Homepagekaart' : 'Home page card', ratio: '16 / 9' },
              { label: nl ? 'Eventpagina' : 'Event page', ratio: '16 / 10' },
              { label: nl ? 'Telefoon' : 'Phone', ratio: '4 / 3' },
            ]}
            onChange={(next) => onChange({ imageFocusX: next.x, imageFocusY: next.y })}
          />
        ) : null}
      </div>
    </AdminDisclosure>
  );
}
