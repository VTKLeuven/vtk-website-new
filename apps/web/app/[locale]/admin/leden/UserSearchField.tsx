"use client";

import { useEffect, useState } from "react";
import { Input, Label } from "@vtk/ui";

export type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

/**
 * Een account zoeken, voor "lid maken" en "erelid maken".
 *
 * Dezelfde gedebouncede zoekbalk als bij de posten en de kiesploeg
 * (`/api/users/search`), zodat iemand toevoegen overal hetzelfde aanvoelt. De
 * keuze zelf leeft bij de ouder; die geeft na het opslaan een nieuwe `key` mee,
 * zodat ook de zoektekst leeg is.
 */
export function UserSearchField({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: SearchUser | null;
  onSelect: (user: SearchUser | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (selected || q.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        if (resp.ok) {
          setResults(await resp.json());
          setOpen(true);
        }
      } catch {
        /* stille fout: de beheerder kan opnieuw typen */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  return (
    <div className="relative w-64">
      <Label>{label}</Label>
      <Input
        value={query}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          onSelect(null);
          setResults([]);
        }}
      />
      {open && !selected && results.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-vtk-blue/15 bg-white text-sm shadow">
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-vtk-blue-soft/50"
                onClick={() => {
                  onSelect(user);
                  setQuery(user.name);
                  setOpen(false);
                }}
              >
                {user.name}
                <span className="block text-xs text-zinc-500">
                  {user.email}
                  {user.rNumber ? ` · ${user.rNumber}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
