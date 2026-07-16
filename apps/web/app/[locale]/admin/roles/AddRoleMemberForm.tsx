"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@vtk/ui";
import { assignUserRoleAction } from "@/app/actions/roles";

type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

/**
 * "Lid toevoegen aan een rol"-balk: zoekt actieve gebruikers server-side en
 * kent de gekozen persoon de rol toe voor het huidige werkingsjaar via
 * {@link assignUserRoleAction}. Meerdere personen na elkaar toevoegen kan omdat
 * de picker zichzelf leegmaakt na elke submit.
 */
export function AddRoleMemberForm({
  roleId,
  locale,
}: {
  roleId: string;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
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
        /* stille fout: gebruiker kan opnieuw typen */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  function pick(u: SearchUser) {
    setSelected(u);
    setQuery(u.name);
    setOpen(false);
  }

  function reset() {
    setSelected(null);
    setQuery("");
    setResults([]);
  }

  return (
    <form
      action={assignUserRoleAction}
      onSubmit={() => setTimeout(reset, 0)}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-3"
    >
      <input type="hidden" name="roleId" value={roleId} />
      <input type="hidden" name="userId" value={selected?.id ?? ""} />

      <div className="relative min-w-[220px] flex-1">
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">
          {nl ? "Persoon zoeken" : "Search person"}
        </label>
        <Input
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (selected) setSelected(null);
            if (v.trim().length < 2) {
              setResults([]);
              setOpen(false);
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={nl ? "Naam, e-mail of r-nummer" : "Name, email or r-number"}
          autoComplete="off"
        />
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-vtk-blue/15 bg-white shadow-lg">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => pick(u)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-vtk-blue-soft/50"
                >
                  <span className="font-medium text-vtk-ink">{u.name}</span>
                  <span className="text-xs text-[#5c667f]">
                    {u.email}
                    {u.rNumber ? ` · ${u.rNumber}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button type="submit" disabled={!selected}>
        {nl ? "Toevoegen" : "Add"}
      </Button>
    </form>
  );
}
