"use client";

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { PencilIcon, UndoIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/toast";
import { SearchPicker } from "@/components/admin/SearchPicker";
import { formatCount } from "@/lib/praesidiumShifts/stats";
import type { OverviewEntry } from "@/lib/praesidiumShifts/overview";
import { setPraesidiumShiftCellAction } from "@/app/actions/praesidiumShifts";

export type EntryPerson = { userId: string; name: string; posts: string[] };

/**
 * Eén vakje in de lade van een praesidiumlid. Een vakje dat zoals de naam
 * telt, krijgt een potlood: daarmee telt het voor iemand anders of voor
 * niemand (de shift ging niet door, of het is een praesidiumshift). Een vakje
 * dat met de hand geregeld is, krijgt een pijl terug. Niets verdwijnt, dus geen
 * bevestiging; wel een toast.
 */
export function EntryRow({
  locale,
  entry,
  when,
  member,
  people,
  errorMessages,
}: {
  locale: "nl" | "en";
  entry: OverviewEntry;
  /** Dag of tabblad, zoals de lade het al toont. */
  when: string;
  member: EntryPerson;
  /** Het praesidium van dat werkingsjaar, om het vakje aan te geven. */
  people: EntryPerson[];
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const struck = entry.state === "excluded" || entry.state === "away";
  const what = [entry.role ?? (nl ? "Dit vakje" : "This cell"), [when, entry.slot].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  function save(target: string) {
    startTransition(async () => {
      const data = new FormData();
      data.set("listId", entry.listId);
      data.set("sheet", entry.sheet);
      data.set("cell", entry.cell);
      data.set("nameKey", entry.nameKey);
      data.set("target", target);
      const result = await unsentGuard.run(() => setPraesidiumShiftCellAction(data));
      if (result === UNSENT) return;
      if (result.status === "error") {
        showToast({
          message: errorMessages[result.code] ?? (nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      setEditing(false);
      const person = people.find((p) => p.userId === target)?.name;
      showToast({
        message:
          target === "follow"
            ? nl
              ? `${what} telt weer zoals de lijst het zegt.`
              : `${what} counts as the list says again.`
            : target === "none"
              ? nl
                ? `${what} telt niet meer mee.`
                : `${what} no longer counts.`
              : nl
                ? `${what} telt nu voor ${person ?? "iemand anders"}.`
                : `${what} now counts for ${person ?? "someone else"}.`,
        variant: "success",
      });
    });
  }

  const note =
    entry.state === "excluded"
      ? nl
        ? "telt niet mee"
        : "does not count"
      : entry.state === "away"
        ? nl
          ? `overgezet naar ${entry.other ?? "iemand anders"}`
          : `moved to ${entry.other ?? "someone else"}`
        : entry.state === "given"
          ? nl
            ? `overgezet van ${entry.other ?? "iemand anders"}`
            : `moved from ${entry.other ?? "someone else"}`
          : null;
  const details = [
    entry.state === "counts" && entry.label !== member.name ? entry.label : null,
    entry.weight !== 1 ? formatCount(entry.weight, locale) : null,
  ].filter(Boolean);

  return (
    <li>
      <div className={`grid grid-cols-[5.5rem_6.5rem_1fr_auto] items-center gap-2 ${struck ? "text-vtk-muted" : ""}`}>
        <span>{when}</span>
        <span className="tabular-nums">{entry.slot ?? ""}</span>
        <span className="min-w-0">
          <span className="block truncate" title={[entry.role, ...details].filter(Boolean).join(" · ")}>
            <span className={struck ? "line-through decoration-vtk-muted/70" : ""}>{entry.role ?? ""}</span>
            {details.length > 0 && <span className="text-vtk-muted"> · {details.join(" · ")}</span>}
          </span>
          {/* Op een eigen regel: de taak wordt afgekapt, en dit is net wat de vice moet zien. */}
          {note && <span className="block text-[11px] text-vtk-muted">{note}</span>}
        </span>
        {entry.state === "counts" ? (
          <IconButton
            label={nl ? "Aanpassen: telt voor iemand anders of niet mee" : "Change: counts for someone else or not at all"}
            srLabel={nl ? `Aanpassen: ${what}` : `Change: ${what}`}
            aria-expanded={editing}
            onClick={() => setEditing((open) => !open)}
            disabled={pending}
            className="size-7!"
          >
            <PencilIcon />
          </IconButton>
        ) : (
          <IconButton
            label={nl ? "Terugzetten zoals de lijst het zegt" : "Reset to what the list says"}
            srLabel={nl ? `Terugzetten: ${what}` : `Reset: ${what}`}
            onClick={() => save("follow")}
            disabled={pending}
            className="size-7!"
          >
            <UndoIcon />
          </IconButton>
        )}
      </div>
      {editing && (
        <div className="mb-2 mt-1 flex items-center gap-2 sm:pl-[6rem]">
          <span className="shrink-0 text-xs text-vtk-muted">{nl ? "Telt voor" : "Counts for"}</span>
          <div className="min-w-0 flex-1 text-sm">
            <SearchPicker
              autoOpen
              value={member.userId}
              onChange={save}
              disabled={pending}
              options={[
                {
                  value: "none",
                  label: nl ? "Telt voor niemand" : "Counts for nobody",
                  hint: nl ? "ging niet door of hoort hier niet" : "did not happen or does not belong here",
                  muted: true,
                },
                ...people.map((p) => ({
                  value: p.userId,
                  label: p.name,
                  hint: p.posts.join(", ") || undefined,
                  group: "Praesidium",
                })),
              ]}
              placeholder={nl ? "Kies wie" : "Choose who"}
              searchPlaceholder={nl ? "Typ een naam of post" : "Type a name or post"}
              ariaLabel={nl ? `Voor wie telt ${what}?` : `Who does ${what} count for?`}
              emptyText={(q) => (nl ? `Niemand past bij "${q}".` : `Nobody matches "${q}".`)}
            />
          </div>
          <IconButton label={nl ? "Niet aanpassen" : "Cancel"} onClick={() => setEditing(false)} className="size-7!">
            <X size={15} aria-hidden />
          </IconButton>
        </div>
      )}
    </li>
  );
}
