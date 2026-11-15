"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Input, Label } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { useUnsentGuard } from "@/components/ui/unsentGuard";
import { type DecideState, decideAccountsAction } from "./actions";

const IDLE: DecideState = { status: "idle" };

type Row = {
  id: string;
  name: string;
  werkgroep: string;
  email: string;
  personal: string | null;
  requested: string;
};

/**
 * Open aanvragen goedkeuren of weigeren. Goedkeuren maakt het account meteen
 * aan; de wachtwoorden staan daarna één keer op het scherm, zoals bij
 * "Accounts aanmaken", en nergens anders.
 */
export function DecideRequests({ nl, rows, disabled }: { nl: boolean; rows: Row[]; disabled: boolean }) {
  const unsent = useUnsentGuard();
  const [state, formAction, pending] = useActionState(unsent.state(decideAccountsAction), IDLE);
  const showToast = useToast();
  const lastNonce = useRef(0);
  const [selected, setSelected] = useState<Set<string>>(new Set(rows.map((r) => r.id)));

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
    if (state.status === "rejected") {
      showToast({
        message: nl ? `${state.count} aanvragen geweigerd.` : `${state.count} requests rejected.`,
        variant: "success",
      });
      return;
    }
    const failed = state.results.filter((r) => !r.ok);
    showToast({
      message: nl
        ? `${state.results.length - failed.length} accounts aangemaakt${failed.length ? `, ${failed.length} mislukt` : ""}.`
        : `${state.results.length - failed.length} accounts created${failed.length ? `, ${failed.length} failed` : ""}.`,
      variant: failed.length ? "error" : "success",
      ...(failed.length ? { duration: 0 } : {}),
    });
  }, [state, nl, showToast]);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="id" value={id} />
        ))}
        <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <span className="sr-only">{nl ? "Kiezen" : "Select"}</span>
                </th>
                <th className="px-4 py-3 font-medium">{nl ? "Lid" : "Member"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Werkgroep" : "Work group"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Nieuw adres" : "New address"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Aangevraagd" : "Requested"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-vtk-blue/5 last:border-0">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      aria-label={row.name}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-vtk-ink">
                    {row.name}
                    {row.personal && <span className="block text-xs font-normal text-zinc-500">{row.personal}</span>}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{row.werkgroep}</td>
                  <td className="px-4 py-2 text-zinc-600">{row.email}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{row.requested}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending || disabled || selected.size === 0}
          >
            {pending
              ? nl
                ? "Bezig..."
                : "Working..."
              : nl
                ? `${selected.size} goedkeuren en aanmaken`
                : `Approve and create ${selected.size}`}
          </Button>
          <div className="w-64">
            <Label>{nl ? "Reden bij weigeren" : "Reason when rejecting"}</Label>
            <Input name="reason" placeholder={nl ? "bv. geen lid meer" : "e.g. no longer a member"} />
          </div>
          <Button
            type="submit"
            name="decision"
            value="reject"
            variant="ghost"
            disabled={pending || selected.size === 0}
          >
            {nl ? `${selected.size} weigeren` : `Reject ${selected.size}`}
          </Button>
        </div>
      </form>

      {state.status === "approved" && (
        <section className="space-y-2">
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {nl
              ? "Deze wachtwoorden staan nergens bewaard en zijn na het verlaten van dit scherm weg. Geef ze door aan de werkgroep; bij de eerste aanmelding kiest het lid zelf een nieuw wachtwoord."
              : "These passwords are stored nowhere and are gone once you leave this screen. Pass them on to the work group; the member picks a new one at first sign-in."}
          </p>
          <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
            {state.results.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-vtk-ink">{r.name}</span>
                {r.ok ? (
                  <span>
                    {r.email} <code className="ml-2 rounded bg-vtk-blue-soft/60 px-2 py-1">{r.password}</code>
                  </span>
                ) : (
                  <span className="text-xs text-red-700">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
