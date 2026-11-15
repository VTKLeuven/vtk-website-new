"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { useUnsentGuard } from "@/components/ui/unsentGuard";
import { normalizeSearchText } from "../../admin-table";
import { type ImportState, importGroupsAction } from "../actions";

const IDLE: ImportState = { status: "idle" };

/**
 * De lijst met vinkjes. Bewust niets aangevinkt bij het openen: overnemen
 * betekent dat de site de groep voortaan bijhoudt, en dat kies je per groep.
 */
export function ImportGroups({
  nl,
  rows,
}: {
  nl: boolean;
  rows: { email: string; name: string; members: number }[];
}) {
  const unsent = useUnsentGuard();
  const [state, formAction, pending] = useActionState(unsent.state(importGroupsAction), IDLE);
  const showToast = useToast();
  const lastNonce = useRef(0);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = normalizeSearchText(query.trim());
    return q ? rows.filter((r) => normalizeSearchText(`${r.email} ${r.name}`).includes(q)) : rows;
  }, [rows, query]);

  useEffect(() => {
    if (state.status === "idle" || state.nonce === lastNonce.current) return;
    lastNonce.current = state.nonce;
    if (state.status === "error") {
      showToast({
        message:
          state.code === "NOTHING_SELECTED"
            ? nl
              ? "Niets aangevinkt."
              : "Nothing selected."
            : nl
              ? "Google Workspace is nog niet ingesteld."
              : "Google Workspace is not set up yet.",
        variant: "error",
        duration: 0,
      });
      return;
    }
    const failed = state.results.filter((r) => !r.ok);
    showToast({
      message: failed.length
        ? nl
          ? `${state.results.length - failed.length} overgenomen; niet gelukt: ${failed.map((f) => `${f.email} (${f.error})`).join(", ")}`
          : `${state.results.length - failed.length} taken over; failed: ${failed.map((f) => `${f.email} (${f.error})`).join(", ")}`
        : nl
          ? `${state.results.length} groepen overgenomen.`
          : `${state.results.length} groups taken over.`,
      variant: failed.length ? "error" : "success",
      ...(failed.length ? { duration: 0 } : {}),
    });
  }, [state, nl, showToast]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {nl
          ? "Elke groep in Google wordt al vanuit de site beheerd."
          : "Every group in Google is already managed from the site."}
      </p>
    );
  }

  // Wat overgenomen is, verdwijnt uit `rows`; een vinkje daarop telt niet meer.
  const checkedCount = rows.filter((r) => checked.has(r.email)).length;
  const allVisibleChecked = visible.length > 0 && visible.every((r) => checked.has(r.email));
  const toggle = (email: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={nl ? "Zoek, bv. statix of poc" : "Search, e.g. statix or poc"}
          aria-label={nl ? "Zoek een groep" : "Search a group"}
          className="h-9 w-64 rounded-full border border-vtk-blue/15 bg-white px-4 text-sm"
        />
        <span className="text-sm text-zinc-500">
          {nl
            ? `${visible.length} van ${rows.length} groepen, ${checkedCount} aangevinkt`
            : `${visible.length} of ${rows.length} groups, ${checkedCount} selected`}
        </span>
      </div>

      {[...checked].filter((email) => rows.some((r) => r.email === email)).map((email) => (
        <input key={email} type="hidden" name="email" value={email} />
      ))}

      <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  aria-label={nl ? "Alles in deze lijst aanvinken" : "Select everything in this list"}
                  onChange={() =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      for (const r of visible) {
                        if (allVisibleChecked) next.delete(r.email);
                        else next.add(r.email);
                      }
                      return next;
                    })
                  }
                />
              </th>
              <th className="px-4 py-3 font-medium">{nl ? "Adres" : "Address"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Naam" : "Name"}</th>
              <th className="px-4 py-3 text-right font-medium">{nl ? "Leden" : "Members"}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.email}
                className="cursor-pointer border-b border-vtk-blue/5 last:border-0 hover:bg-vtk-blue-soft/30"
                onClick={(e) => {
                  if ((e.target as Element).closest("input")) return;
                  toggle(row.email);
                }}
              >
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={checked.has(row.email)}
                    onChange={() => toggle(row.email)}
                    aria-label={row.email}
                  />
                </td>
                <td className="px-4 py-2 font-medium text-vtk-ink">{row.email}</td>
                <td className="px-4 py-2 text-zinc-600">{row.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.members}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button type="submit" disabled={pending || checkedCount === 0}>
        {pending
          ? nl
            ? "Bezig met overnemen..."
            : "Taking over..."
          : nl
            ? `${checkedCount} ${checkedCount === 1 ? "groep" : "groepen"} overnemen`
            : `Take over ${checkedCount} ${checkedCount === 1 ? "group" : "groups"}`}
      </Button>
    </form>
  );
}
