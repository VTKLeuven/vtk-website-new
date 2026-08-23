"use client";

import { useEffect, useState } from "react";
import { Button, Input, Label, Select } from "@vtk/ui";
import { addKiesploegMemberAction } from "./actions";

type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

/**
 * "Lid toevoegen" voor een kiesploeg: dezelfde gedebouncede zoekbalk als bij de
 * posten (`/api/users/search`), zodat het toevoegen van leden overal hetzelfde
 * aanvoelt.
 *
 * We veronderstellen dat iedereen al een website-account heeft; dat is ook zo,
 * want een kiesploeglid logt sowieso al in met KU Leuven SSO.
 */
export function AddKiesploegMember({
  nl,
  kiesploegId,
  posts,
}: {
  nl: boolean;
  kiesploegId: string;
  posts: { id: string; name: string }[];
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
        const resp = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
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

  const t = nl
    ? { search: "Lid zoeken", post: "Post", noPost: "(nog geen post)", add: "Toevoegen", clear: "Wissen" }
    : { search: "Find member", post: "Post", noPost: "(no post yet)", add: "Add", clear: "Clear" };

  return (
    <form
      action={addKiesploegMemberAction}
      onSubmit={() => {
        setTimeout(() => {
          setSelected(null);
          setQuery("");
          setResults([]);
        }, 0);
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-3"
    >
      <input type="hidden" name="kiesploegId" value={kiesploegId} />
      {selected && <input type="hidden" name="userId" value={selected.id} />}

      <div className="relative w-64">
        <Label>{t.search}</Label>
        <Input
          value={query}
          autoComplete="off"
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

      <div className="w-48">
        <Label>{t.post}</Label>
        <Select name="postId" defaultValue="">
          <option value="">{t.noPost}</option>
          {posts.map((post) => (
            <option key={post.id} value={post.id}>
              {post.name}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" size="sm" disabled={!selected}>
        {t.add}
      </Button>
    </form>
  );
}
