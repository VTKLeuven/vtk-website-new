"use client";

import { useEffect, useState, type ReactNode } from "react";
import { STATUS_TONE_CLASS, statusLabel } from "@/lib/google/activityLabels";
import { UNSENT, useUnsentGuard } from "@/components/ui/unsentGuard";
import { type MemberPeek, mailGroupMembersAction } from "./bulkActions";

/**
 * Wie er in een groep zit, met per adres of het nog actief is. Een geneste
 * groep klikt open in hetzelfde blok; de stapel erboven is het pad terug
 * (24urenloop > sport > sport_2627). Gedeeld door het venster op het
 * overzicht en de nakijkmodus.
 *
 * `cache` laat de nakijkmodus de volgende groep vooraf laden.
 */
export function GroupMembers({
  nl,
  rootId,
  rootEmail,
  cache,
  footer,
  className,
  hideRootTitle = false,
}: {
  nl: boolean;
  rootId: string;
  rootEmail: string;
  /** Het adres staat al boven dit blok (de nakijkmodus); toon het pas bij een geneste groep. */
  hideRootTitle?: boolean;
  cache?: Map<string, MemberPeek[]>;
  footer?: (current: { id: string; email: string }) => ReactNode;
  className?: string;
}) {
  const [stack, setStack] = useState<{ id: string; email: string }[]>([{ id: rootId, email: rootEmail }]);
  const current = stack[stack.length - 1];
  const [loaded, setLoaded] = useState<{ id: string; members: MemberPeek[] | null; failed: boolean } | null>(null);
  const cached = cache?.get(current.id) ?? null;
  const members = cached ?? (loaded?.id === current.id ? loaded.members : null);
  const failed = !cached && loaded?.id === current.id && loaded.failed;
  const unsent = useUnsentGuard();

  useEffect(() => {
    if (cache?.has(current.id)) return;
    let cancelled = false;
    unsent
      .run(() => mailGroupMembersAction(current.id))
      .then((result) => {
        if (cancelled) return;
        if (result === UNSENT || result === null) setLoaded({ id: current.id, members: null, failed: true });
        else {
          cache?.set(current.id, result);
          setLoaded({ id: current.id, members: result, failed: false });
        }
      })
      .catch(() => !cancelled && setLoaded({ id: current.id, members: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [current.id, unsent, cache]);

  const activeCount = members?.filter((m) => m.active).length ?? 0;

  return (
    <div className={["flex min-h-0 flex-col", className ?? ""].join(" ")}>
      <div className="border-b border-vtk-blue/10 px-5 py-4">
        {stack.length > 1 && (
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-zinc-500" aria-label={nl ? "Pad" : "Path"}>
            {stack.slice(0, -1).map((g, i) => (
              <span key={g.id} className="inline-flex items-center gap-1">
                <button type="button" className="vtk-link" onClick={() => setStack(stack.slice(0, i + 1))}>
                  {g.email}
                </button>
                <span aria-hidden="true">›</span>
              </span>
            ))}
          </nav>
        )}
        {!(hideRootTitle && stack.length === 1) && (
          <h2 className="break-all font-semibold text-vtk-ink">{current.email}</h2>
        )}
        <p className="mt-1 text-sm text-zinc-500">
          {members === null
            ? nl
              ? "Een post dit werkingsjaar, of hun studie dit academiejaar bevestigd, telt als actief."
              : "A post this working year, or their studies confirmed this academic year, counts as active."
            : nl
              ? `${activeCount} van ${members.length} nog actief: een post dit werkingsjaar, hun studie dit academiejaar bevestigd, of een groep waarin iemand actief is.`
              : `${activeCount} of ${members.length} still active: a post this working year, their studies confirmed this academic year, or a group with someone active in it.`}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
        {failed ? (
          <p className="text-sm text-red-700">
            {nl ? "De leden konden niet geladen worden. Probeer het opnieuw." : "Could not load the members. Try again."}
          </p>
        ) : members === null ? (
          <p className="text-sm text-zinc-500">{nl ? "Bezig met laden..." : "Loading..."}</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-zinc-500">{nl ? "Niemand." : "Nobody."}</p>
        ) : (
          <ul className="divide-y divide-vtk-blue/5">
            {members.map((m) => {
              const l = statusLabel(m, nl);
              return (
                <li key={m.email} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0 text-sm">
                    {m.groupId ? (
                      <button
                        type="button"
                        className="vtk-link block break-all text-left"
                        onClick={() => setStack([...stack, { id: m.groupId!, email: m.email }])}
                        aria-label={nl ? `Wie zit er in ${m.email}` : `Who is in ${m.email}`}
                      >
                        {m.email}
                      </button>
                    ) : (
                      <span className="block break-all text-vtk-ink">{m.email}</span>
                    )}
                    {m.name && <span className="block text-xs text-zinc-500">{m.name}</span>}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_TONE_CLASS[l.tone]}`}>{l.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {footer?.(current)}
    </div>
  );
}
