'use client';

import { useState } from 'react';
import Link from '@/components/ui/Link';
import { SaveForm } from '@/components/ui/SaveForm';
import { createBoBudgetAction } from '@/app/actions/boBudgets';
import { percent } from './format';

/*
 * Een budget starten: post, naam, sjabloon en BO. Na het aanmaken opent de
 * editor; die navigatie is de bevestiging.
 */

type PostChoice = { key: string; name: string; vat: number | null };

const TEMPLATES = {
  nl: [
    {
      id: 'standaard',
      name: 'Standaard',
      text: 'Inkomsten, vaste kosten (aantal × prijs) en variabele kosten per deelnemer, zoals het blad van de penning.',
    },
    {
      id: 'cantus',
      name: 'Cantus',
      text: 'Zaal, vaten en sangria uit de locatie, drank als verdeling met water als rest, en inkom per doelgroep: leden, niet-leden, ereleden en genodigden.',
    },
  ],
  en: [
    {
      id: 'standaard',
      name: 'Standard',
      text: "Income, fixed costs (quantity × price) and variable costs per participant, like the treasurer's sheet.",
    },
    {
      id: 'cantus',
      name: 'Cantus',
      text: 'Venue, kegs and sangria from the venue list, drinks as a split with water as the rest, and entrance per audience.',
    },
  ],
};

export function NewBudgetForm({
  posts,
  locale,
  cancelHref,
}: {
  posts: PostChoice[];
  locale: 'nl' | 'en';
  cancelHref: string;
}) {
  const nl = locale === 'nl';
  const [post, setPost] = useState(posts[0].key);
  const [template, setTemplate] = useState('standaard');
  const chosen = posts.find((p) => p.key === post) ?? posts[0];

  return (
    <SaveForm
      action={createBoBudgetAction}
      submitLabel={nl ? 'Budget aanmaken' : 'Create budget'}
      savingLabel={nl ? 'Aanmaken…' : 'Creating…'}
      savedMessage={nl ? 'Budget aangemaakt' : 'Budget created'}
      resetOnSuccess={false}
      fallbackErrorMessage={nl ? 'Aanmaken lukte niet. Probeer het opnieuw.' : 'Creating failed. Try again.'}
      errorMessages={{
        NOT_YOUR_POST: nl ? 'Je zit niet in die post.' : 'You are not in that post.',
        TITLE_REQUIRED: nl ? 'Geef de activiteit een naam.' : 'Give the activity a name.',
        TITLE_TOO_LONG: nl
          ? 'De naam is te lang (hoogstens 200 tekens).'
          : 'The name is too long (at most 200 characters).',
        INVALID_DATE: nl ? 'Die datum klopt niet.' : 'That date is not valid.',
      }}
      className="vtk-bud-card vtk-bud-newform"
      footer={({ submitButton }) => (
        <div className="vtk-bud-formbar">
          {submitButton}
          <Link href={cancelHref} className="vtk-bud-link">
            {nl ? 'Annuleren' : 'Cancel'}
          </Link>
        </div>
      )}
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="vtk-bud-grid">
        <label className="vtk-bud-field">
          <span className="vtk-bud-label">{nl ? 'Post' : 'Post'}</span>
          {posts.length === 1 ? (
            <>
              <input type="hidden" name="post" value={post} />
              <span className="vtk-bud-static">{chosen.name}</span>
            </>
          ) : (
            <select name="post" className="vtk-bud-input" value={post} onChange={(e) => setPost(e.target.value)}>
              {posts.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="vtk-bud-field">
          <span className="vtk-bud-label">{nl ? 'Activiteit' : 'Activity'}</span>
          <input
            name="title"
            className="vtk-bud-input"
            required
            maxLength={200}
            placeholder={nl ? 'Bv. Live Cantus' : 'E.g. Live Cantus'}
          />
        </label>
        <label className="vtk-bud-field">
          <span className="vtk-bud-label">{nl ? 'Voor het BO van' : 'For the meeting of'}</span>
          <input name="targetDate" type="date" className="vtk-bud-input" />
          <span className="vtk-bud-hint">
            {nl ? 'Mag ook later, maar wel voor je indient.' : 'Can wait, but not past submitting.'}
          </span>
        </label>
      </div>

      <fieldset className="vtk-bud-templates">
        <legend className="vtk-bud-label">{nl ? 'Sjabloon' : 'Template'}</legend>
        {TEMPLATES[locale].map((t) => (
          <label key={t.id} className="vtk-bud-template" data-on={template === t.id ? '1' : undefined}>
            <input
              type="radio"
              name="template"
              value={t.id}
              checked={template === t.id}
              onChange={() => setTemplate(t.id)}
            />
            <span>
              <b>{t.name}</b>
              <span>{t.text}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="vtk-bud-fine">
        {chosen.vat == null
          ? nl
            ? `Beheer vulde het BTW-tarief van ${chosen.name} nog niet in. Tot dan telt elke prijs zoals ingetypt.`
            : `Finance has not set ${chosen.name}'s VAT rate yet. Until then every price counts as typed.`
          : nl
            ? `${chosen.name} rekent met ${percent(chosen.vat)} BTW. Je typt prijzen zoals ze in de winkel of op de offerte staan; de site rekent om.`
            : `${chosen.name} uses ${percent(chosen.vat, false)} VAT. Type prices as they appear in the shop or on the quote; the site converts them.`}
      </p>
    </SaveForm>
  );
}
