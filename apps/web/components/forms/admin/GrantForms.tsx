"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { addFormGroupGrantAction, addFormUserGrantAction } from "@/app/actions/forms";
import { SaveForm } from "@/components/ui/SaveForm";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { grantRoleHelp, grantRoleLabel, type AdminLocale } from "./format";

const ROLES = ["VIEWER", "EDITOR", "MANAGER"] as const;
type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

function roleOptions(locale: AdminLocale) {
  return ROLES.map((role) => ({ value: role, label: grantRoleLabel(role, locale) }));
}

function errorMessages(locale: AdminLocale) {
  const nl = locale === "nl";
  return {
    USER_REQUIRED: nl ? "Zoek en kies eerst een persoon." : "Search for and pick a person first.",
    USER_NOT_FOUND: nl
      ? "Deze persoon bestaat niet meer of heeft geen actief account."
      : "This person no longer exists or has no active account.",
    INVALID_EMAIL: nl ? "Dat is geen geldig e-mailadres." : "That is not a valid e-mail address.",
    GROUP_REQUIRED: nl ? "Kies een post." : "Pick a post.",
    FORBIDDEN: nl
      ? "Je mag de toegang van deze form niet wijzigen."
      : "You cannot change this form's access.",
  };
}

export function AddUserGrantForm({ locale, formId }: { locale: AdminLocale; formId: string }) {
  const nl = locale === "nl";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (selected || value.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/forms/${encodeURIComponent(formId)}/users/search?q=${encodeURIComponent(value)}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) return;
        setResults((await response.json()) as SearchUser[]);
        setOpen(true);
      } catch {
        // Een volgende tekenreeks probeert vanzelf opnieuw.
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [formId, query, selected]);

  function reset() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setOpen(false);
    setSearching(false);
  }

  return (
    <SaveForm
      action={addFormUserGrantAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Toegang opslaan" : "Save access"}
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Toegang toegekend" : "Access granted"}
      fallbackErrorMessage={nl ? "Toegang toekennen is niet gelukt." : "Granting access failed."}
      errorMessages={errorMessages(locale)}
      submitDisabled={!selected}
      onSuccess={reset}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="formId" value={formId} />
      <input type="hidden" name="userId" value={selected?.id ?? ""} />
      <div className="ticket-admin-field form-admin-person-picker">
        <label htmlFor="grant-user-search">{nl ? "Persoon zoeken" : "Search person"}</label>
        <div className="ticket-admin-input-icon">
          <Search aria-hidden="true" size={16} />
          <input
            id="grant-user-search"
            type="search"
            value={query}
            autoComplete="off"
            placeholder={nl ? "Naam, e-mail of r-nummer" : "Name, email or r-number"}
            onFocus={() => setOpen(results.length > 0)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selected) setSelected(null);
              if (event.target.value.trim().length < 2) {
                setSearching(false);
                setResults([]);
                setOpen(false);
              }
            }}
          />
        </div>
        {searching ? (
          <span className="ticket-admin-help">{nl ? "Zoeken..." : "Searching..."}</span>
        ) : null}
        {open ? (
          <ul className="form-admin-person-results">
            {results.length > 0 ? (
              results.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelected(user);
                      setQuery(user.name);
                      setOpen(false);
                      setSearching(false);
                    }}
                  >
                    <strong>{user.name}</strong>
                    <span>
                      {user.email}
                      {user.rNumber ? ` · ${user.rNumber}` : ""}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="form-admin-person-empty">
                {nl ? "Geen personen gevonden" : "No people found"}
              </li>
            )}
          </ul>
        ) : null}
      </div>
      {selected ? (
        <p className="form-admin-selected-person">
          <strong>{selected.name}</strong>
          <span>{selected.email}</span>
        </p>
      ) : null}
      <div className="ticket-admin-field">
        <label htmlFor="grant-user-role">{nl ? "Rol" : "Role"}</label>
        <ThemedSelect
          id="grant-user-role"
          name="role"
          defaultValue="EDITOR"
          options={roleOptions(locale)}
        />
      </div>
      <ul className="form-admin-hint">
        {ROLES.map((role) => (
          <li key={role}>
            <strong>{grantRoleLabel(role, locale)}</strong>: {grantRoleHelp(role, locale)}
          </li>
        ))}
      </ul>
    </SaveForm>
  );
}

export function AddGroupGrantForm({
  locale,
  formId,
  groups,
}: {
  locale: AdminLocale;
  formId: string;
  groups: Array<{ id: string; name: string }>;
}) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={addFormGroupGrantAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Posttoegang opslaan" : "Save post access"}
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Toegang toegekend" : "Access granted"}
      fallbackErrorMessage={nl ? "Toegang toekennen is niet gelukt." : "Granting access failed."}
      errorMessages={errorMessages(locale)}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="formId" value={formId} />
      <div className="ticket-admin-form-grid">
        <div className="ticket-admin-field" data-span="2">
          <label htmlFor="grant-group">{nl ? "Post" : "Post"}</label>
          <ThemedSelect
            id="grant-group"
            name="groupId"
            required
            options={groups.map((group) => ({ value: group.id, label: group.name }))}
          />
        </div>
        <div className="ticket-admin-field">
          <label htmlFor="grant-group-role">{nl ? "Rol" : "Role"}</label>
          <ThemedSelect
            id="grant-group-role"
            name="role"
            defaultValue="EDITOR"
            options={roleOptions(locale)}
          />
        </div>
        <div className="ticket-admin-field">
          <label htmlFor="grant-group-scope">{nl ? "Voor wie" : "Scope"}</label>
          <ThemedSelect
            id="grant-group-scope"
            name="scope"
            defaultValue="LEADS_ONLY"
            options={[
              {
                value: "LEADS_ONLY",
                label: nl ? "Alleen de verantwoordelijken" : "Post leads only",
              },
              { value: "ALL_MEMBERS", label: nl ? "Alle leden van de post" : "All post members" },
            ]}
          />
        </div>
      </div>
    </SaveForm>
  );
}
