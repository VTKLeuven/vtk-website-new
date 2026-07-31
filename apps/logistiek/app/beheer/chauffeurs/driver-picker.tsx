'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { addDriverAction, searchDriverCandidatesAction } from '@/app/actions/beheer';
import { SaveForm } from '@/components/ui/save-form';
import type { DriverCandidate } from '@/lib/uitleen-server';

const ADD_ERRORS = {
  USER_REQUIRED: 'Kies eerst een lid uit de zoeklijst.',
  NOT_FOUND: 'Dit lid bestaat niet (meer) op vtk.be.',
  INACTIVE: 'Dit lid is gedeactiveerd op vtk.be en kan geen chauffeur zijn.',
  IN_POST: 'Dit lid zit in de post Logistiek en is daardoor al chauffeur.',
  ALREADY_DRIVER: 'Dit lid staat al in de chauffeurslijst.',
};

const inputClass = 'h-10 w-full rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

/**
 * Chauffeur toevoegen: zoekt leden van vtk.be (naam, e-mail of r-nummer) en
 * bewaart het gekozen lid. De keuze is dus altijd een echte gebruiker, nooit een
 * losse naam; enkel zo weet de app wie er straks "Mijn ritten" te zien krijgt.
 */
export function DriverPicker() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DriverCandidate[]>([]);
  const [selected, setSelected] = useState<DriverCandidate | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, startSearch] = useTransition();
  const noteRef = useRef<HTMLInputElement>(null);

  // Gedebouncede zoekopdracht; de resultaten leegmaken gebeurt in de
  // onChange-handler, niet hier.
  useEffect(() => {
    const q = query.trim();
    if (selected || q.length < 2) return;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await searchDriverCandidatesAction(q);
        setResults(found);
        setOpen(true);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  function reset() {
    setSelected(null);
    setQuery('');
    setResults([]);
    setOpen(false);
    if (noteRef.current) noteRef.current.value = '';
  }

  return (
    <SaveForm
      action={addDriverAction}
      submitLabel="Chauffeur toevoegen"
      savingLabel="Toevoegen..."
      savedMessage="Chauffeur toegevoegd."
      errorMessages={ADD_ERRORS}
      submitDisabled={!selected}
      onSuccess={reset}
      className="grid gap-3"
    >
      <input type="hidden" name="userId" value={selected?.id ?? ''} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Lid zoeken
            <input
              type="text"
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                if (selected) setSelected(null);
                if (value.trim().length < 2) {
                  setResults([]);
                  setOpen(false);
                }
              }}
              onFocus={() => results.length > 0 && setOpen(true)}
              placeholder="Naam, e-mail of r-nummer"
              autoComplete="off"
              className={inputClass}
            />
          </label>
          {open && !selected ? (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-[12px] border border-vtk-navy/15 bg-white shadow-lg">
              {results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-vtk-muted">
                  {searching ? 'Zoeken...' : 'Geen leden gevonden.'}
                </li>
              ) : (
                results.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(candidate);
                        setQuery(candidate.name);
                        setOpen(false);
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-vtk-paper"
                    >
                      <span className="font-medium text-vtk-ink">{candidate.name}</span>
                      <span className="text-xs text-vtk-muted">
                        {candidate.email}
                        {candidate.rNumber ? ` · ${candidate.rNumber}` : ''}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Notitie (optioneel)
          <input
            ref={noteRef}
            type="text"
            name="note"
            placeholder="bv. rijbewijs B, rijdt niet met de kar"
            className={inputClass}
          />
        </label>
      </div>
    </SaveForm>
  );
}
