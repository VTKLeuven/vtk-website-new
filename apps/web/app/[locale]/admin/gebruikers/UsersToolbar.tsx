"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveUserAction } from "@/app/actions/users-groups";
import { Modal, SearchBar } from "../admin-table";
import { BulkImport } from "./BulkImport";

export type NewUserLabels = {
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  fallbackErrorMessage: string;
  errorMessages: Record<string, string>;
};

/**
 * Toolbar boven de gebruikerstabel: doorzoeken (server-side, via de URL) plus de
 * knoppen die "nieuwe gebruiker" en "CSV import" in een modal openen. Zoeken werkt
 * op de volledige DB, niet op een reeds geladen lijst: de term komt in `?q=` en de
 * server-pagina query't ermee (met paginatie), zodat 24k+ gebruikers schaalbaar blijven.
 */
export function UsersToolbar({
  locale,
  canEdit,
  canBulkImport,
  initialQuery,
  newUserLabels,
}: {
  locale: "nl" | "en";
  canEdit: boolean;
  canBulkImport: boolean;
  initialQuery: string;
  newUserLabels: NewUserLabels;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const firstRender = useRef(true);

  // Gedebouncede URL-sync: een nieuwe zoekterm zet `?q=` en gaat terug naar pagina 1.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      const q = query.trim();
      if (q) sp.set("q", q);
      else sp.delete("q");
      sp.delete("page");
      router.replace(`${pathname}?${sp.toString()}`);
    }, 300);
    return () => clearTimeout(timer);
    // Enkel op wijziging van de zoekterm; params/pathname zijn stabiel per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={nl ? "Zoek op naam, e-mail of r-nummer" : "Search by name, email or r-number"}
        ariaLabel={nl ? "Gebruikers zoeken" : "Search users"}
      />
      {canEdit && (
        <button type="button" className="vtk-tile-btn vtk-tile-btn-primary" onClick={() => setNewOpen(true)}>
          {nl ? "Nieuwe gebruiker" : "New user"}
        </button>
      )}
      {canBulkImport && (
        <button type="button" className="vtk-tile-btn" onClick={() => setImportOpen(true)}>
          {nl ? "CSV import" : "CSV import"}
        </button>
      )}

      {newOpen && (
        <Modal title={nl ? "Nieuwe gebruiker" : "New user"} onClose={() => setNewOpen(false)}>
          <SaveForm
            action={saveUserAction}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>button]:md:col-span-2 [&>button]:justify-self-start"
            {...newUserLabels}
            onSuccess={() => setNewOpen(false)}
          >
            <div><Label>{nl ? "Voornaam" : "First name"}</Label><Input name="firstName" required /></div>
            <div><Label>{nl ? "Achternaam" : "Last name"}</Label><Input name="lastName" required /></div>
            <div><Label>Email</Label><Input name="email" type="email" required /></div>
            <div><Label>{nl ? "R-nummer" : "R-number"}</Label><Input name="rNumber" placeholder="r0123456" /></div>
            <div><Label>{nl ? "Wachtwoord" : "Password"}</Label><Input name="password" type="text" required /></div>
            <div>
              <Label>Locale</Label>
              <Select name="locale" defaultValue="NL">
                <option value="NL">NL</option>
                <option value="EN">EN</option>
              </Select>
            </div>
            <div className="flex items-center gap-4 md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked className="size-4 rounded border-zinc-400" />
                {nl ? "Actief" : "Active"}
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" name="isSuperAdmin" className="size-4 rounded border-zinc-400" />
                Superadmin
              </label>
            </div>
          </SaveForm>
        </Modal>
      )}

      {importOpen && (
        <Modal title={nl ? "CSV bulk import" : "Bulk CSV import"} onClose={() => setImportOpen(false)}>
          <p className="mb-3 text-sm text-[#5c667f]">
            {nl
              ? "Kolommen: email, name, password, groupCode, role (MEMBER|LEAD), year, rNumber. Eerste rij mag een header zijn."
              : "Columns: email, name, password, groupCode, role (MEMBER|LEAD), year, rNumber. First row may be a header."}
          </p>
          <BulkImport locale={locale} />
        </Modal>
      )}
    </div>
  );
}
