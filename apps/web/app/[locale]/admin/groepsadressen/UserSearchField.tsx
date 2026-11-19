"use client";

import { useEffect, useState } from "react";
import { Input, Label } from "@vtk/ui";

type SearchUser = { id: string; name: string; email: string };

/**
 * Een lid van de site zoeken, als veld in een gewoon formulier: het gekozen lid
 * gaat mee als `userId`. Dezelfde gedebouncede zoekopdracht als bij de posten
 * (`/api/users/search`).
 */
export function UserSearchField({
  nl,
  label,
  name = "userId",
}: {
  nl: boolean;
  label: string;
  name?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (selected || q.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (resp.ok) {
          setResults(await resp.json());
          setOpen(true);
        }
      } catch {
        /* stille fout: de gebruiker kan opnieuw typen */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  return (
    <div className="relative w-64">
      <Label>{label}</Label>
      {selected && <input type="hidden" name={name} value={selected.id} />}
      <Input
        value={query}
        autoComplete="off"
        required
        placeholder={nl ? "Zoek op naam of r-nummer" : "Search by name or r-number"}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setResults([]);
        }}
      />
      {open && !selected && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-vtk-blue/15 bg-white text-sm shadow">
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-vtk-blue-soft/50"
                onClick={() => {
                  setSelected(user);
                  setQuery(user.name);
                  setOpen(false);
                }}
              >
                {user.name}
                <span className="block text-xs text-zinc-500">{user.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
