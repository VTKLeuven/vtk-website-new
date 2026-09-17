"use client";

import { useEffect, useState } from "react";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { grantMembershipAction } from "@/app/actions/membership";

type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

/**
 * Iemand handmatig lid maken, zonder betaling.
 *
 * Dezelfde gedebouncede zoekbalk als bij de posten en de kiesploeg
 * (`/api/users/search`), zodat leden toevoegen overal hetzelfde aanvoelt.
 */
export function GrantMembershipForm({ nl, year }: { nl: boolean; year: number }) {
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
        /* stille fout: de beheerder kan opnieuw typen */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  const t = nl
    ? {
        search: "Lid zoeken",
        note: "Notitie (optioneel)",
        notePlaceholder: "Bv. cash betaald aan de toog",
        submit: "Lid maken",
        saving: "Bezig...",
        saved: "Lidmaatschap toegekend.",
        clear: "Wissen",
      }
    : {
        search: "Find member",
        note: "Note (optional)",
        notePlaceholder: "E.g. paid cash at the bar",
        submit: "Make member",
        saving: "Saving...",
        saved: "Membership granted.",
        clear: "Clear",
      };

  return (
    <SaveForm
      action={grantMembershipAction}
      submitLabel={t.submit}
      savingLabel={t.saving}
      savedMessage={t.saved}
      submitDisabled={!selected}
      errorMessages={{
        INVALID_USER: nl ? "Kies eerst een lid uit de lijst." : "Pick a member from the list first.",
        ALREADY_MEMBER: nl
          ? "Dit lid heeft dit academiejaar al een lidmaatschap."
          : "This member already has a membership this academic year.",
      }}
      fallbackErrorMessage={nl ? "Lid maken is mislukt." : "Granting the membership failed."}
      onSuccess={() => {
        setSelected(null);
        setQuery("");
        setResults([]);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="year" value={year} />
      {selected ? <input type="hidden" name="userId" value={selected.id} /> : null}

      <div className="relative w-64">
        <Label>{t.search}</Label>
        <Input
          value={query}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
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
                    setSelected(user);
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

      <div className="w-72">
        <Label>{t.note}</Label>
        <Input name="note" placeholder={t.notePlaceholder} maxLength={500} />
      </div>
    </SaveForm>
  );
}
