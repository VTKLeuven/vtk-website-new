"use client";

import { useState, useTransition } from "react";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import { formatCount } from "@/lib/praesidiumShifts/stats";
import { savePraesidiumShiftNamesAction } from "@/app/actions/praesidiumShifts";

export type NameRowData = {
  nameKey: string;
  label: string;
  status: "MATCHED" | "IGNORED" | "UNRESOLVED";
  source: string;
  userId: string | null;
  /** Shiften die aan deze schrijfwijze hangen, op meetellende tabbladen en kleuren. */
  shifts: number;
  /** Waar ze staan: de eerste paar vakjes. */
  where: string;
  /** Bij twijfel: wie het kan zijn. */
  candidates: string[];
  kring: string | null;
  /** Er bestaat al een bijnaam voor deze schrijfwijze. */
  hasAlias: boolean;
  /** Voornaam van meer dan één praesidiumlid: standaard niet onthouden. */
  ambiguous: boolean;
};

export type RosterOption = { userId: string; name: string; posts: string[] };

function SourceBadge({ row, nl }: { row: NameRowData; nl: boolean }) {
  const check = "bg-[var(--low-bg)] text-[var(--low-ink)]";
  const calm = "bg-[var(--paper-2)] text-vtk-body";
  const [text, tone, title] = ((): [string, string, string] => {
    switch (row.source) {
      case "ALIAS":
        return [nl ? "Bijnaam" : "Nickname", calm, nl ? "Onthouden van een vorige lijst." : "Remembered from an earlier list."];
      case "FULL_NAME":
        return [nl ? "Volledige naam" : "Full name", calm, ""];
      case "INITIAL":
        return [nl ? "Voornaam + letter" : "First name + initial", calm, ""];
      case "FIRST_NAME":
        return [
          nl ? "Enkel voornaam" : "First name only",
          calm,
          nl
            ? "Er is maar één praesidiumlid met deze voornaam. Kijk na of het geen werkgroeplid of iemand van een andere kring is."
            : "Only one praesidium member has this first name. Check it is not a werkgroep member or someone from another association.",
        ];
      case "FUZZY":
        return [nl ? "Lijkt op" : "Looks like", check, nl ? "Gekoppeld ondanks een tikfout; kijk even na." : "Matched despite a typo; please check."];
      case "MANUAL":
        return [nl ? "Met de hand" : "By hand", calm, ""];
      case "OTHER_KRING":
        return [
          nl ? `Andere kring${row.kring ? `: ${row.kring}` : ""}` : `Other association${row.kring ? `: ${row.kring}` : ""}`,
          calm,
          nl ? "Zo staat het in het overzichtstabblad van deze lijst." : "This is what the overview tab of this list says.",
        ];
      case "NOT_PRAESIDIUM":
        return [
          nl ? "Niet in het praesidium" : "Not in the praesidium",
          calm,
          nl
            ? "Een volledige naam die bij niemand van dit werkingsjaar past. Staat iemand ten onrechte hier, kijk dan /admin/groepen na."
            : "A full name that matches nobody this working year. If someone is here by mistake, check /admin/groepen.",
        ];
      default:
        return row.candidates.length > 1
          ? [nl ? `${row.candidates.length} mogelijk` : `${row.candidates.length} possible`, check, ""]
          : [nl ? "Niet herkend" : "Not recognised", check, ""];
    }
  })();
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`} title={title || undefined}>
      {text}
    </span>
  );
}

function pickerOptions(row: NameRowData, roster: RosterOption[], nl: boolean): SearchPickerOption[] {
  const likely = roster.filter((r) => row.candidates.includes(r.userId));
  const rest = roster.filter((r) => !row.candidates.includes(r.userId));
  const person = (r: RosterOption, group: string): SearchPickerOption => ({
    value: r.userId,
    label: r.name,
    hint: r.posts.join(", ") || undefined,
    group,
  });
  return [
    { value: "", label: nl ? "Nog niet gekozen" : "Not chosen yet", muted: true },
    ...likely.map((r) => person(r, nl ? "Waarschijnlijk" : "Likely")),
    ...rest.map((r) => person(r, nl ? "Praesidium" : "Praesidium")),
    { value: "ignore", label: nl ? "Geen praesidium (niet meetellen)" : "Not praesidium (do not count)", group: nl ? "Anders" : "Other", muted: true },
  ];
}

/**
 * Eén schrijfwijze: wie het is, met de waarschijnlijke kandidaten als knopjes
 * eronder. Een keuze slaat meteen op (met een toast die zegt hoeveel er nog
 * open staan); de schakelaar zegt of ze ook voor de volgende lijsten geldt.
 */
function NameRow({
  row,
  roster,
  listId,
  locale,
  errorMessages,
  showBadge,
}: {
  row: NameRowData;
  roster: RosterOption[];
  listId: string;
  locale: "nl" | "en";
  errorMessages: Record<string, string>;
  showBadge: boolean;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const initial = row.status === "MATCHED" ? row.userId ?? "" : row.status === "IGNORED" ? "ignore" : "";
  const [value, setValue] = useState(initial);
  const [remember, setRemember] = useState(row.hasAlias || !row.ambiguous);
  const candidates = roster.filter((r) => row.candidates.includes(r.userId));

  function choose(next: string) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const data = new FormData();
      data.set("listId", listId);
      data.set("locale", locale);
      data.append("nameKey", row.nameKey);
      data.set(`choice:${row.nameKey}`, next);
      if (remember) data.append("remember", row.nameKey);
      const result = await savePraesidiumShiftNamesAction(SAVE_IDLE, data);
      if (result.status === "error") {
        setValue(previous);
        showToast({
          message: errorMessages[result.code] ?? (nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: result.status === "success" && result.detail ? result.detail : nl ? "Bewaard." : "Saved.", variant: "success" });
    });
  }

  return (
    <li className="grid gap-x-4 gap-y-2 border-t border-[var(--rule-soft)] px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-semibold text-vtk-ink">{row.label}</span>
          {showBadge && <SourceBadge row={row} nl={nl} />}
        </div>
        <div className="truncate text-xs text-vtk-muted" title={row.where}>
          {nl
            ? `${formatCount(row.shifts)} ${row.shifts === 1 ? "shift" : "shiften"}`
            : `${formatCount(row.shifts, "en")} ${row.shifts === 1 ? "shift" : "shifts"}`}
          {row.where ? ` · ${row.where}` : ""}
        </div>
      </div>
      <div className="min-w-0">
        <SearchPicker
          value={value}
          onChange={choose}
          disabled={pending}
          options={pickerOptions(row, roster, nl)}
          placeholder={
            candidates.length > 1
              ? nl
                ? `${candidates.length} mogelijk: kies wie`
                : `${candidates.length} possible: choose who`
              : nl
                ? "Typ een naam of kies"
                : "Type a name or choose"
          }
          searchPlaceholder={nl ? "Typ een naam of post" : "Type a name or post"}
          ariaLabel={nl ? `Wie is ${row.label}?` : `Who is ${row.label}?`}
          emptyText={(q) => (nl ? `Niemand in het praesidium past bij "${q}".` : `Nobody in the praesidium matches "${q}".`)}
          attention={row.status === "UNRESOLVED"}
        />
        {value === "" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {candidates.map((c) => (
              <button
                key={c.userId}
                type="button"
                onClick={() => choose(c.userId)}
                disabled={pending}
                className="rounded-full border border-vtk-navy/20 bg-white px-2.5 py-0.5 text-xs text-vtk-ink hover:border-vtk-navy/40 hover:bg-vtk-blue-soft/50"
              >
                {c.name} <span className="text-vtk-muted">{c.posts.join(", ")}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => choose("ignore")}
              disabled={pending}
              className="rounded-full border border-vtk-navy/20 bg-white px-2.5 py-0.5 text-xs text-vtk-muted hover:border-vtk-navy/40 hover:text-vtk-ink"
            >
              {nl ? "Geen praesidium" : "Not praesidium"}
            </button>
          </div>
        )}
      </div>
      <label
        className="vtk-psl-switch sm:pt-2"
        title={
          row.ambiguous
            ? nl
              ? "Meer dan één praesidiumlid heeft deze voornaam: standaard geldt je keuze enkel voor deze lijst."
              : "More than one praesidium member has this first name: by default your choice only applies to this list."
            : nl
              ? "Aan: de volgende lijsten koppelen deze naam vanzelf, en lijsten waar ze nog open stond ook."
              : "On: the next lists link this name by themselves, and so do lists where it was still open."
        }
      >
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
        <span className="vtk-psl-switch-track" aria-hidden />
        <span className="w-[8.5rem]">{remember ? (nl ? "Ook volgende lijsten" : "Next lists too") : nl ? "Enkel hier" : "Only here"}</span>
      </label>
    </li>
  );
}

function Collapsed({
  title,
  hint,
  rows,
  children,
  nl,
}: {
  title: string;
  hint?: string;
  rows: number;
  children: React.ReactNode;
  nl: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (rows === 0) return null;
  return (
    <section className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm">
          <span className="font-semibold text-vtk-ink">{title}</span>
          {hint && <span className="ml-2 text-xs text-vtk-muted">{hint}</span>}
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="rounded-full border border-vtk-navy/20 px-3 py-1 text-xs font-semibold text-vtk-ink hover:bg-vtk-blue-soft/60"
        >
          {open ? (nl ? "Verbergen" : "Hide") : nl ? "Bekijken" : "Show"}
        </button>
      </div>
      {open && <ul className="border-t border-vtk-blue/10">{children}</ul>}
    </section>
  );
}

const CHECK_FIRST = ["FUZZY"];

/**
 * De namen van een lijst: eerst wat op een keuze wacht, daaronder dichtgeklapt
 * wat al gekoppeld is en wat geen praesidium is. Een keuze slaat meteen op.
 */
export function NamesPanel({
  locale,
  listId,
  rows,
  roster,
  hiddenNames,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  rows: NameRowData[];
  roster: RosterOption[];
  /** Namen op tabbladen of in kleuren die niet meetellen: die staan hier niet. */
  hiddenNames: number;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const open = rows.filter((r) => r.status === "UNRESOLVED");
  const matched = rows
    .filter((r) => r.status === "MATCHED")
    .sort(
      (a, b) =>
        Number(CHECK_FIRST.includes(b.source)) - Number(CHECK_FIRST.includes(a.source)) || a.label.localeCompare(b.label, "nl"),
    );
  const ignored = rows.filter((r) => r.status === "IGNORED");
  const fuzzy = matched.filter((r) => CHECK_FIRST.includes(r.source)).length;
  const rowProps = { roster, listId, locale, errorMessages };

  return (
    <div className="space-y-3">
      {open.length > 0 ? (
        <section className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5 pb-2">
            <h2 className="text-[15px] font-semibold">{nl ? "Wacht op een keuze" : "Waiting for a choice"}</h2>
            <span className="text-xs text-vtk-muted">
              {nl
                ? `${rows.length - open.length} namen herkend · ${open.length} open`
                : `${rows.length - open.length} names recognised · ${open.length} open`}
            </span>
          </div>
          <ul>
            {open.map((row) => (
              <NameRow key={row.nameKey} row={row} showBadge {...rowProps} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated px-4 py-3 text-sm">
          <span className="font-semibold text-[var(--ok-ink)]">{nl ? "Elke naam heeft een keuze." : "Every name has a choice."}</span>{" "}
          <span className="text-vtk-muted">
            {nl ? "Een fout rechtzetten kan hieronder of bij de bijnamen." : "Fix a mistake below or under nicknames."}
          </span>
        </p>
      )}

      <Collapsed
        nl={nl}
        rows={matched.length}
        title={nl ? `${matched.length} namen gekoppeld` : `${matched.length} names linked`}
        hint={
          fuzzy > 0
            ? nl
              ? `waarvan ${fuzzy} met een tikfout, die staan bovenaan`
              : `${fuzzy} of them despite a typo, at the top`
            : undefined
        }
      >
        {matched.map((row) => (
          <NameRow key={row.nameKey} row={row} showBadge {...rowProps} />
        ))}
      </Collapsed>

      <Collapsed
        nl={nl}
        rows={ignored.length}
        title={nl ? `${ignored.length} geen praesidium` : `${ignored.length} not praesidium`}
        hint={nl ? "werkgroepen, andere kringen, genegeerd" : "werkgroepen, other associations, ignored"}
      >
        {ignored.map((row) => (
          <NameRow key={row.nameKey} row={row} showBadge {...rowProps} />
        ))}
      </Collapsed>

      {hiddenNames > 0 && (
        <p className="text-xs text-vtk-muted">
          {nl
            ? `${hiddenNames} ${hiddenNames === 1 ? "naam staat" : "namen staan"} enkel op tabbladen of in kleuren die niet meetellen en ${hiddenNames === 1 ? "staat" : "staan"} hier niet.`
            : `${hiddenNames} names only appear on tabs or in colours that do not count and are not shown.`}
        </p>
      )}
    </div>
  );
}
