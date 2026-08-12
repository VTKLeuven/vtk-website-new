'use client';

import { useId, useMemo, useState } from 'react';

/**
 * Kiest de items die als alternatief bij dit item horen ("geen actieve box meer?
 * de passieve kan ook"). Een datalist en geen keuzelijst: de inventaris telt
 * honderden items, en dan is typen sneller dan scrollen.
 *
 * De koppeling is wederzijds; de server schrijft beide richtingen weg.
 */
export function AlternativesEditor({
  initial,
  options,
}: {
  initial: string[];
  /** Alle andere items om uit te kiezen (id + naam). */
  options: Array<{ id: string; name: string }>;
}) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');
  // Eigen id: het toevoegformulier en een geopende bewerkrij staan tegelijk op
  // de pagina, en twee datalists met dezelfde id laten er één winnen.
  const listId = useId();

  const byName = useMemo(
    () => new Map(options.map((option) => [option.name.toLowerCase(), option])),
    [options]
  );
  const nameOf = (id: string) => options.find((option) => option.id === id)?.name ?? id;

  function add() {
    const match = byName.get(draft.trim().toLowerCase());
    if (!match) return;
    setChosen((current) => (current.includes(match.id) ? current : [...current, match.id]));
    setDraft('');
  }

  return (
    <div className="grid gap-2">
      <input type="hidden" name="alternativeIds" value={JSON.stringify(chosen)} />
      {chosen.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {chosen.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1.5 rounded-full bg-vtk-paper px-3 py-1 text-sm text-vtk-ink"
            >
              {nameOf(id)}
              <button
                type="button"
                onClick={() => setChosen((current) => current.filter((other) => other !== id))}
                aria-label={`Alternatief verwijderen: ${nameOf(id)}`}
                className="text-vtk-muted transition hover:text-red-700"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          type="text"
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter in dit veld voegt toe; zonder dit zou het het hele
            // itemformulier indienen.
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Zoek een item..."
          className="h-10 min-w-0 flex-1 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
        />
        <datalist id={listId}>
          {options
            .filter((option) => !chosen.includes(option.id))
            .map((option) => (
              <option key={option.id} value={option.name} />
            ))}
        </datalist>
        <button
          type="button"
          onClick={add}
          className="rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40"
        >
          Toevoegen
        </button>
      </div>
    </div>
  );
}
