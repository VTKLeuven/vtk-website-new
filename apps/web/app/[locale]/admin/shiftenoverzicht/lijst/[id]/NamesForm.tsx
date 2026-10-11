"use client";

import type { ReactNode } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
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

function SourceBadge({ row, nl, roster }: { row: NameRowData; nl: boolean; roster: RosterOption[] }) {
  const check = "bg-[var(--low-bg)] text-[var(--low-ink)]";
  const calm = "bg-vtk-blue-soft/70 text-vtk-body";
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
      default: {
        if (row.candidates.length > 1) {
          const names = row.candidates.map((id) => roster.find((r) => r.userId === id)?.name).filter(Boolean);
          return [nl ? "Meerdere mogelijk" : "Several possible", check, names.join(nl ? " of " : " or ")];
        }
        return [nl ? "Niet herkend" : "Not recognised", check, ""];
      }
    }
  })();
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`} title={title || undefined}>
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
    {
      value: "ignore",
      label: nl ? "Geen praesidium (niet meetellen)" : "Not praesidium (do not count)",
      group: nl ? "Anders" : "Other",
      muted: true,
    },
  ];
}

const GRID = "grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_8.5rem_5.5rem] sm:items-center";

function Row({ row, nl, roster }: { row: NameRowData; nl: boolean; roster: RosterOption[] }) {
  const value = row.status === "MATCHED" ? row.userId ?? "" : row.status === "IGNORED" ? "ignore" : "";
  return (
    <li className={`${GRID} border-b border-vtk-blue/5 px-4 py-3 last:border-0`}>
      <div className="min-w-0">
        <input type="hidden" name="nameKey" value={row.nameKey} />
        <div className="font-medium text-vtk-ink">{row.label}</div>
        <div className="truncate text-xs text-vtk-muted" title={row.where}>
          {nl
            ? `${formatCount(row.shifts)} ${row.shifts === 1 ? "shift" : "shiften"}`
            : `${formatCount(row.shifts, "en")} ${row.shifts === 1 ? "shift" : "shifts"}`}
          {row.where ? ` · ${row.where}` : ""}
        </div>
      </div>
      <SearchPicker
        name={`choice:${row.nameKey}`}
        defaultValue={value}
        options={pickerOptions(row, roster, nl)}
        placeholder={nl ? "Kies wie dit is" : "Choose who this is"}
        searchPlaceholder={nl ? "Typ een naam of post" : "Type a name or post"}
        ariaLabel={nl ? `Wie is ${row.label}?` : `Who is ${row.label}?`}
        emptyText={(q) => (nl ? `Niemand in het praesidium past bij "${q}".` : `Nobody in the praesidium matches "${q}".`)}
        attention={row.status === "UNRESOLVED"}
      />
      <div>
        <SourceBadge row={row} nl={nl} roster={roster} />
      </div>
      <label className="flex items-center gap-2 text-xs text-vtk-muted sm:justify-center">
        <input
          type="checkbox"
          name="remember"
          value={row.nameKey}
          defaultChecked={row.hasAlias || !row.ambiguous}
          className="size-4 accent-vtk-ink"
          title={
            row.ambiguous
              ? nl
                ? "Meer dan één praesidiumlid heeft deze voornaam: standaard geldt je keuze enkel voor deze lijst."
                : "More than one praesidium member has this first name: by default your choice only applies to this list."
              : nl
                ? "Wijzig je de keuze, dan geldt ze ook voor de volgende lijsten."
                : "If you change the choice, it also applies to the next lists."
          }
        />
        <span className="sm:sr-only">{nl ? "Onthouden" : "Remember"}</span>
      </label>
    </li>
  );
}

function Group({ title, rows, nl, roster, children }: { title: string; rows: NameRowData[]; nl: boolean; roster: RosterOption[]; children?: ReactNode }) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
      <div className="px-4 pt-3 pb-2">
        <h3 className="text-sm font-semibold text-vtk-ink">
          {title} <span className="font-normal text-vtk-muted">({rows.length})</span>
        </h3>
        {children}
      </div>
      <div
        className={`${GRID} hidden border-y border-vtk-blue/10 bg-[var(--paper-2)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-vtk-muted sm:grid`}
        aria-hidden
      >
        <span>{nl ? "Op de lijst" : "On the list"}</span>
        <span>{nl ? "Is" : "Is"}</span>
        <span>{nl ? "Herkend als" : "Recognised as"}</span>
        <span className="text-center">{nl ? "Onthouden" : "Remember"}</span>
      </div>
      <ul>
        {rows.map((row) => (
          <Row key={row.nameKey} row={row} nl={nl} roster={roster} />
        ))}
      </ul>
    </section>
  );
}

const CHECK_FIRST = ["FUZZY"];

export function NamesForm({
  locale,
  listId,
  draft,
  rows,
  roster,
  hiddenNames,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  draft: boolean;
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
        Number(CHECK_FIRST.includes(b.source)) - Number(CHECK_FIRST.includes(a.source)) ||
        a.label.localeCompare(b.label, "nl"),
    );
  const ignored = rows.filter((r) => r.status === "IGNORED");

  return (
    <SaveForm
      action={savePraesidiumShiftNamesAction}
      submitLabel={nl ? "Namen bewaren" : "Save names"}
      savingLabel={nl ? "Bezig met bewaren..." : "Saving..."}
      savedMessage={nl ? "Namen bewaard." : "Names saved."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Niet opgeslagen: er ging iets mis bij het bewaren van de namen." : "Not saved: saving the names failed."}
      resetOnSuccess={false}
      // Geen bevestigingsvraag over open namen: die zou tellen wat er bij het
      // laden open stond, niet wat je net koos. De toast zegt na het bewaren
      // hoeveel er nog open staan.
      secondarySubmit={
        draft
          ? { name: "intent", value: "confirm", label: nl ? "Bewaren en lijst bevestigen" : "Save and confirm list" }
          : undefined
      }
      className="space-y-4"
    >
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sm text-vtk-body">
        {nl
          ? "Elke schrijfwijze op de lijst hoort bij één praesidiumlid, of bij niemand van het praesidium. Een keuze die je wijzigt met \"Onthouden\" aan, wordt een bijnaam: de volgende lijst koppelt die naam vanzelf, en lijsten waar ze nog open stond ook."
          : "Every spelling on the list belongs to one praesidium member, or to nobody in the praesidium. A choice you change with \"Remember\" on becomes a nickname: the next list links that name by itself, and so do lists where it was still open."}
        {hiddenNames > 0 && (
          <span className="text-vtk-muted">
            {" "}
            {nl
              ? `${hiddenNames} ${hiddenNames === 1 ? "naam staat" : "namen staan"} enkel op tabbladen of in kleuren die niet meetellen en ${hiddenNames === 1 ? "staat" : "staan"} hier niet.`
              : `${hiddenNames} names only appear on tabs or in colours that do not count and are not shown.`}
          </span>
        )}
      </p>
      {open.length === 0 && (
        <p className="text-sm font-medium text-[var(--ok-ink)]">
          {nl ? "Elke naam heeft een keuze." : "Every name has a choice."}
        </p>
      )}
      <Group title={nl ? "Wacht op een keuze" : "Waiting for a choice"} rows={open} nl={nl} roster={roster} />
      <Group title={nl ? "Gekoppeld" : "Linked"} rows={matched} nl={nl} roster={roster}>
        {matched.some((r) => CHECK_FIRST.includes(r.source)) && (
          <span className="block text-xs font-normal text-vtk-muted">
            {nl
              ? "Wat ondanks een tikfout gekoppeld is, staat bovenaan: kijk die even na."
              : "What was linked despite a typo is at the top: give those a look."}
          </span>
        )}
      </Group>
      {ignored.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-vtk-ink">
            {nl ? `Geen praesidium (${ignored.length})` : `Not praesidium (${ignored.length})`}
            <span className="ml-2 font-normal text-vtk-muted">
              {nl ? "werkgroepen, andere kringen, genegeerd" : "werkgroepen, other associations, ignored"}
            </span>
          </summary>
          <div className="mt-3">
            <Group title={nl ? "Geen praesidium" : "Not praesidium"} rows={ignored} nl={nl} roster={roster} />
          </div>
        </details>
      )}
    </SaveForm>
  );
}
