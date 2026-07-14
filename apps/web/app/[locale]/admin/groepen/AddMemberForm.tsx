"use client";

import { useEffect, useState } from "react";
import { Button, Input, Select } from "@vtk/ui";
import { addMembershipAction } from "@/app/actions/users-groups";

type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

/**
 * Compacte "lid toevoegen"-balk voor een post in een bepaald werkingsjaar.
 * Zoekt actieve gebruikers server-side (naam/e-mail/r-nummer) en post het
 * gekozen lid via {@link addMembershipAction}.
 */
export function AddMemberForm({
  groupId,
  year,
  locale,
}: {
  groupId: string;
  year: number;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [open, setOpen] = useState(false);

  // Gedebouncede server-side zoekopdracht. Het leegmaken van de resultaten
  // gebeurt in de onChange-handler (niet hier), zodat we geen setState
  // synchroon in de effect-body aanroepen.
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
      action={addMembershipAction}
      onSubmit={() => {
        // Laat de server het werk doen; ruim daarna de picker op.
        setTimeout(reset, 0);
      }}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-3"
    >
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="userId" value={selected?.id ?? ""} />

      <div className="relative min-w-[220px] flex-1">
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">
          {nl ? "Lid zoeken" : "Search member"}
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

      <div>
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">
          {nl ? "Rol" : "Role"}
        </label>
        <Select name="role" defaultValue="MEMBER" className="w-32">
          <option value="MEMBER">{nl ? "Lid" : "Member"}</option>
          <option value="LEAD">{nl ? "Verantwoordelijke" : "Lead"}</option>
        </Select>
      </div>

      <div className="min-w-[160px] flex-1">
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">
          {nl ? "Titel (optioneel)" : "Title (optional)"}
        </label>
        <Input name="titleNl" placeholder={nl ? "bv. Praeses" : "e.g. President"} autoComplete="off" />
      </div>

      <Button type="submit" disabled={!selected}>
        {nl ? "Toevoegen" : "Add"}
      </Button>
    </form>
  );
}
