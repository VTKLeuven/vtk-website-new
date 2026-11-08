'use client';

export type Lang = 'nl' | 'en';

/**
 * De NL/EN-schakelaar naast het opschrift van een tweetalig veld.
 *
 * In het evenementformulier één schakelaar per veld, maar allemaal op dezelfde
 * toestand: wie het Engels invult, doet dat meestal voor het hele formulier in
 * één keer.
 */
export function LangTabs({
  value,
  onChange,
  nl,
}: {
  value: Lang;
  onChange: (lang: Lang) => void;
  nl: boolean;
}) {
  return (
    <span className="vtk-ef-langtabs" role="group" aria-label={nl ? 'Taal van dit veld' : 'Language of this field'}>
      <button
        type="button"
        aria-pressed={value === 'nl'}
        title={nl ? 'Nederlands' : 'Dutch'}
        onClick={() => onChange('nl')}
      >
        NL
      </button>
      <button
        type="button"
        aria-pressed={value === 'en'}
        title={nl ? 'Engels' : 'English'}
        onClick={() => onChange('en')}
      >
        EN
      </button>
    </span>
  );
}
