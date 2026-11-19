"use client";

import { useEffect, useState } from "react";
import { Button, Label } from "@vtk/ui";
import { SearchPicker } from "@/components/admin/SearchPicker";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { loadDiscordRolesAction } from "@/app/actions/pocs-partners";
import { pollPhaseLabel } from "@/lib/pocPolls/copy";

export type PocDiscordRole = { roleId: string; studyYears: string[] };

type DiscordRoleOption = { id: string; name: string };

const PHASES = ["BACHELOR_1", "BACHELOR_2", "BACHELOR_3", "MASTER_1", "MASTER_2"] as const;

/**
 * Eén aanroep naar Discord per bezoek aan de pagina, ook wanneer je meerdere
 * POC's na elkaar openklapt. Een mislukte poging wordt niet onthouden, zodat de
 * volgende POC het opnieuw probeert.
 */
let rolesRequest: Promise<DiscordRoleOption[] | null> | null = null;

function loadRoles(): Promise<DiscordRoleOption[] | null> {
  rolesRequest ??= unsentGuard
    .run(() => loadDiscordRolesAction())
    .then((result) => (result === UNSENT ? null : result))
    .catch(() => null)
    .then((roles) => {
      if (!roles) rolesRequest = null;
      return roles;
    });
  return rolesRequest;
}

type Row = PocDiscordRole & { key: number };

/**
 * De rollen die de bot aan de studenten van deze POC geeft. Per rol optioneel de
 * fases: bij de BPOC krijgt een eerstejaars dan enkel "1ste bachelor". Zonder
 * fases krijgt iedereen van de POC de rol.
 *
 * De lijst met rollen komt pas van Discord wanneer dit veld verschijnt, dus
 * wanneer iemand een POC openklapt. Tot ze er is (of als Discord niet
 * antwoordt) staat het veld er niet in het formulier, en blijft bij opslaan
 * staan wat er was.
 */
export function PocDiscordRolesField({ initial, nl }: { initial: PocDiscordRole[]; nl: boolean }) {
  const [roles, setRoles] = useState<DiscordRoleOption[] | null | "loading">("loading");
  const [rows, setRows] = useState<Row[]>(() => initial.map((role, index) => ({ ...role, key: index })));
  const [nextKey, setNextKey] = useState(initial.length);

  useEffect(() => {
    let active = true;
    loadRoles().then((result) => {
      if (active) setRoles(result);
    });
    return () => {
      active = false;
    };
  }, []);

  if (roles === "loading") {
    return (
      <div>
        <Label>{nl ? "Discord-rollen" : "Discord roles"}</Label>
        <p className="text-sm text-vtk-muted">{nl ? "Rollen ophalen bij Discord..." : "Fetching roles from Discord..."}</p>
      </div>
    );
  }
  if (roles === null) {
    return (
      <div>
        <Label>{nl ? "Discord-rollen" : "Discord roles"}</Label>
        <p className="text-sm text-vtk-muted">
          {nl
            ? "Discord antwoordde niet, of de bot is niet ingesteld. De rollen blijven bij opslaan zoals ze waren."
            : "Discord did not answer, or the bot is not set up. Saving keeps the roles as they were."}
        </p>
      </div>
    );
  }

  const update = (key: number, patch: Partial<PocDiscordRole>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const toggleYear = (row: Row, year: string) =>
    update(row.key, {
      studyYears: row.studyYears.includes(year) ? row.studyYears.filter((y) => y !== year) : [...row.studyYears, year],
    });
  const chosen = rows.filter((row) => row.roleId);
  const nameOf = (roleId: string) => roles.find((role) => role.id === roleId)?.name ?? roleId;

  return (
    <div className="space-y-2">
      <input
        type="hidden"
        name="discordRoles"
        value={JSON.stringify(chosen.map(({ roleId, studyYears }) => ({ roleId, studyYears })))}
      />
      <div>
        <Label>{nl ? "Discord-rollen" : "Discord roles"}</Label>
        <p className="text-xs text-vtk-muted">
          {nl
            ? "De bot geeft deze rollen aan de studenten van deze POC die hun account koppelden. Met fases enkel aan wie in die fase zit; zonder fases aan iedereen van de POC. Een rol die een student zelf koos op Discord, neemt de site nooit af."
            : "The bot gives these roles to the students of this POC who linked their account. With phases only to those in that phase; without phases to everyone of the POC. A role a student picked on Discord themselves is never taken away by the site."}
        </p>
      </div>
      {rows.length > 0 ? (
        <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/12">
          {rows.map((row) => (
            <li key={row.key} className="space-y-2 p-3">
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <SearchPicker
                    options={roles.map((role) => ({ value: role.id, label: role.name }))}
                    value={row.roleId}
                    onChange={(roleId) => update(row.key, { roleId })}
                    placeholder={nl ? "Kies een rol" : "Choose a role"}
                    searchPlaceholder={nl ? "Zoek een rol" : "Search a role"}
                    ariaLabel={nl ? "Discord-rol" : "Discord role"}
                    emptyText={(query) => (nl ? `Geen rol gevonden voor "${query}".` : `No role found for "${query}".`)}
                    attention={!row.roleId}
                    autoOpen={!row.roleId}
                  />
                </div>
                <IconButton
                  type="button"
                  label={nl ? "Rol weghalen" : "Remove role"}
                  srLabel={`${nl ? "Rol weghalen" : "Remove role"}: ${row.roleId ? nameOf(row.roleId) : "?"}`}
                  onClick={() => setRows((current) => current.filter((other) => other.key !== row.key))}
                >
                  <TrashIcon />
                </IconButton>
              </div>
              <div role="group" aria-label={nl ? "Fases" : "Phases"} className="flex flex-wrap items-center gap-1.5">
                {PHASES.map((year) => (
                  <label
                    key={year}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 px-3 py-1.5 text-[13px]"
                  >
                    <input type="checkbox" checked={row.studyYears.includes(year)} onChange={() => toggleYear(row, year)} />
                    {pollPhaseLabel(year, nl ? "nl" : "en")}
                  </label>
                ))}
                <span className="text-xs text-vtk-muted">
                  {row.studyYears.length === 0
                    ? nl
                      ? "Geen fase aangevinkt: iedereen van de POC."
                      : "No phase ticked: everyone of the POC."
                    : null}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-vtk-muted">
          {nl ? "Nog geen rol: deze POC krijgt niemand op Discord." : "No role yet: this POC gives nobody a role on Discord."}
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setRows((current) => [...current, { key: nextKey, roleId: "", studyYears: [] }]);
          setNextKey((key) => key + 1);
        }}
      >
        {nl ? "Rol toevoegen" : "Add role"}
      </Button>
    </div>
  );
}
