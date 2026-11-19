"use client";

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useEffect, useState, useTransition } from "react";
import { Button, Input, Select } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { addMembershipAction } from "@/app/actions/users-groups";

type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

/**
 * Compacte "lid toevoegen"-balk voor een post in een bepaald werkingsjaar.
 * Zoekt actieve gebruikers server-side (naam/e-mail/r-nummer) en post het
 * gekozen lid via {@link addMembershipAction}.
 *
 * `leadLabel` overschrijft hoe de LEAD-rol heet: een werkgroep kiest daar zelf
 * een naam voor (meestal G3 of G4), een praesidiumpost houdt het bij
 * "Verantwoordelijke".
 *
 * `allowLead={false}` voor de G3/G4 die enkel gewone leden mag toevoegen
 * (`werkgroepen.manageOwnMembers`): de rolkeuze verdwijnt dan.
 */
export function AddMemberForm({
  groupId,
  year,
  locale,
  leadLabel,
  allowLead = true,
}: {
  groupId: string;
  year: number;
  locale: "nl" | "en";
  leadLabel?: string;
  allowLead?: boolean;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [open, setOpen] = useState(false);
  // Het zoekveld vraagt `users.search`, los van het recht om leden te beheren
  // (docs/permissions.md). Zonder dat recht bleef de lijst gewoon leeg.
  const [searchForbidden, setSearchForbidden] = useState(false);

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
        } else if (resp.status === 403) {
          setSearchForbidden(true);
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

  // Wie al verantwoordelijke is, kan de G3/G4 niet als gewoon lid toevoegen: dat
  // zou die persoon terugzetten. Dat is een verwachte fout, dus een toast.
  const errorMessages: Record<string, string> = {
    MEMBERSHIP_LEAD_LOCKED: nl
      ? `Niet toegevoegd: die persoon is al ${leadLabel ?? "verantwoordelijke"}. Een verantwoordelijke aanduiden of terugzetten naar lid vraag je aan IT.`
      : `Not added: this person is already ${leadLabel ?? "a lead"}. Ask IT to appoint a lead or turn one back into a member.`,
    MEMBERSHIP_YEAR_LOCKED: nl
      ? "Niet toegevoegd: je kan enkel leden voor het huidige werkingsjaar toevoegen."
      : "Not added: you can only add members for the current working year.",
  };

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await unsentGuard.run(() => addMembershipAction(formData));
      if (result === UNSENT) return;
      if (result.status === "error") {
        showToast({
          message: errorMessages[result.code] ?? (nl ? "Toevoegen mislukt." : "Could not add."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      reset();
      showToast({ message: nl ? "Lid toegevoegd" : "Member added", variant: "success" });
    });
  }

  return (
    <form
      action={submit}
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
        {searchForbidden && (
          // Een div en geen p: vtk-admin.css kleurt elke p in de admin muted.
          <div className="mt-1 text-xs text-vtk-danger" role="alert">
            {nl
              ? "Je mag geen gebruikers opzoeken. Vraag IT om het recht 'Gebruikers opzoeken' aan je rol te hangen."
              : "You cannot search users. Ask IT to add the 'Search users' permission to your role."}
          </div>
        )}
      </div>

      {allowLead ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-[#5c667f]">
            {nl ? "Rol" : "Role"}
          </label>
          {/* Breedte volgt de langste optie: de titel van de verantwoordelijke van
              een werkgroep is vrije tekst en kan langer zijn dan "G4". */}
          <Select name="role" defaultValue="MEMBER" className="w-auto min-w-32 max-w-60">
            <option value="MEMBER">{nl ? "Lid" : "Member"}</option>
            <option value="LEAD">{leadLabel ?? (nl ? "Verantwoordelijke" : "Lead")}</option>
          </Select>
        </div>
      ) : (
        <input type="hidden" name="role" value="MEMBER" />
      )}

      <div className="min-w-[160px] flex-1">
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">
          {nl ? "Titel (optioneel)" : "Title (optional)"}
        </label>
        <Input name="titleNl" placeholder={nl ? "bv. Praeses" : "e.g. President"} autoComplete="off" />
      </div>

      <Button type="submit" disabled={!selected || pending}>
        {pending ? (nl ? "Bezig..." : "Adding...") : nl ? "Toevoegen" : "Add"}
      </Button>
    </form>
  );
}
