"use client";

import { useMemo, useState } from "react";
import { Input } from "@vtk/ui";
import { NecessityToggle } from "../NecessityToggle";

export type SiteShiftRow = {
  shiftId: string;
  name: string;
  startTime: string;
  post: string | null;
  taken: number;
  max: number;
  past: boolean;
  people: {
    userId: string;
    name: string;
    necessary: boolean;
    /** Uren tussen inschrijven en de start; een late inschrijving is vaak een oproep. */
    hoursBefore: number;
  }[];
};

type Filter = "all" | "past" | "upcoming" | "necessary";

function moment(iso: string, locale: "nl" | "en"): string {
  return new Date(iso).toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  });
}

function lead(hours: number, nl: boolean): string {
  if (hours < 1) return nl ? "minder dan een uur op voorhand ingeschreven" : "registered less than an hour before";
  if (hours < 48) return nl ? `${Math.round(hours)} uur op voorhand ingeschreven` : `registered ${Math.round(hours)} hours before`;
  const days = Math.round(hours / 24);
  return nl ? `${days} dagen op voorhand ingeschreven` : `registered ${days} days before`;
}

export function SiteShiftTable({ locale, rows }: { locale: "nl" | "en"; rows: SiteShiftRow[] }) {
  const nl = locale === "nl";
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "past" && !row.past) return false;
      if (filter === "upcoming" && row.past) return false;
      if (filter === "necessary" && !row.people.some((p) => p.necessary)) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.post ?? "").toLowerCase().includes(q) ||
        row.people.some((p) => p.name.toLowerCase().includes(q))
      );
    });
  }, [rows, filter, query]);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: nl ? "Alles" : "All" },
    { value: "past", label: nl ? "Voorbij" : "Past" },
    { value: "upcoming", label: nl ? "Nog te komen" : "Upcoming" },
    { value: "necessary", label: nl ? "Met noodzaak" : "With necessity" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-vtk-blue/15 bg-white p-0.5" role="group" aria-label={nl ? "Toon" : "Show"}>
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f.value ? "bg-vtk-ink text-white" : "text-vtk-ink hover:bg-vtk-blue-soft/60"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={nl ? "Zoek op shift, post of naam" : "Search shift, post or name"}
          aria-label={nl ? "Zoek op shift, post of naam" : "Search shift, post or name"}
          className="h-9 w-64"
        />
      </div>

      <div className="relative overflow-x-auto rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
            <tr>
              <th className="px-4 py-2.5">{nl ? "Wanneer" : "When"}</th>
              <th className="px-2 py-2.5">{nl ? "Shift" : "Shift"}</th>
              <th className="px-2 py-2.5 text-right!">{nl ? "Bezet" : "Taken"}</th>
              <th className="px-4 py-2.5">{nl ? "Praesidium op deze shift" : "Praesidium on this shift"}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const allNecessary = row.people.every((p) => p.necessary);
              return (
                <tr key={row.shiftId} className="border-b border-vtk-blue/5 last:border-0 align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-vtk-body">{moment(row.startTime, locale)}</td>
                  <td className="px-2 py-2.5">
                    <div className="font-medium">{row.name}</div>
                    {row.post && <div className="text-xs text-vtk-muted">{row.post}</div>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-vtk-body">
                    {row.taken}/{row.max}
                  </td>
                  <td className="px-4 py-2.5">
                    <ul className="flex flex-col gap-1.5">
                      {row.people.map((person) => (
                        <li key={person.userId} className="flex flex-wrap items-center gap-2">
                          <NecessityToggle
                            shiftId={row.shiftId}
                            userIds={[person.userId]}
                            necessary={person.necessary}
                            locale={locale}
                            compact
                            srLabel={`${person.name}: ${person.necessary ? (nl ? "noodzakelijk" : "necessary") : nl ? "vrije wil" : "voluntary"}`}
                          />
                          <span className="text-sm">{person.name}</span>
                          <span className={`text-xs ${person.hoursBefore < 48 ? "text-[var(--low-ink)]" : "text-vtk-muted"}`}>
                            {lead(person.hoursBefore, nl)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {row.people.length > 1 && (
                      <div className="mt-2">
                        <NecessityToggle
                          shiftId={row.shiftId}
                          userIds={row.people.map((p) => p.userId)}
                          necessary={allNecessary}
                          locale={locale}
                          compact
                          label={
                            allNecessary
                              ? nl
                                ? "Allemaal vrije wil maken"
                                : "Make all voluntary"
                              : nl
                                ? "Allemaal noodzakelijk"
                                : "All necessary"
                          }
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-vtk-muted">
                  {nl ? "Geen shiften die hierbij passen." : "No shifts match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
