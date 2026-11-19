"use client";

import Link from "@/components/ui/Link";
import { Card } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { ConfirmIconButton, ConfirmTextButton } from "@/components/ui/DeleteIconButton";
import { CheckIcon } from "@/components/ui/icons";
import { createPocListsAction, markPocsElectedAction } from "./mailActions";

type Row = {
  id: string;
  name: string;
  email: string | null;
  /** Het jaar dat het groepsadres volgt. */
  mailYear: number;
  /** Vertegenwoordigers in het gekozen jaar. */
  repsInYear: number;
  /** Heeft de POC een groepsadres met haar als bron? */
  linkedList: { id: string; email: string } | null;
};

const fmt = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;

/**
 * De groepsadressen van de POC's: welk jaar elke lijst volgt, en de knop
 * "verkozen". Staat op het tabje van een werkingsjaar, want "verkozen" geldt
 * voor de vertegenwoordigers van dat jaar.
 */
export function PocMailCard({
  nl,
  year,
  rows,
  canCreateLists,
  groupsBase,
}: {
  nl: boolean;
  year: number;
  rows: Row[];
  canCreateLists: boolean;
  groupsBase: string;
}) {
  const behind = rows.filter((r) => r.linkedList && r.mailYear !== year && r.repsInYear > 0);
  const withoutList = rows.filter((r) => r.email && !r.linkedList).length;
  const errorMessages = nl
    ? {
        NO_REPRESENTATIVES: `Geen enkele POC heeft vertegenwoordigers in ${fmt(year)}.`,
        INVALID_INPUT: "Onbekend werkingsjaar.",
      }
    : {
        NO_REPRESENTATIVES: `No POC has representatives in ${fmt(year)}.`,
        INVALID_INPUT: "Unknown working year.",
      };

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-vtk-ink">{nl ? "Groepsadressen" : "Group addresses"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          {nl
            ? "Elke POC-lijst (ene-poc@vtk.be) bevat de vertegenwoordigers van één werkingsjaar. Wie je vooraf voor een nieuw jaar invoert, komt er pas in wanneer je dat jaar als verkozen aanduidt."
            : "Every POC list (ene-poc@vtk.be) holds the representatives of one working year. Whoever you enter ahead for a new year only joins once you mark that year as elected."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {behind.length > 0 && (
          <ConfirmTextButton
            action={markPocsElectedAction}
            fields={{ year: String(year) }}
            className="inline-flex h-10 items-center rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm text-vtk-surface hover:bg-vtk-navy"
            title={nl ? `Vertegenwoordigers van ${fmt(year)} verkozen?` : `Representatives of ${fmt(year)} elected?`}
            description={
              nl
                ? `De lijsten van ${behind.length} POC's gaan naar de vertegenwoordigers van ${fmt(year)}: wie dat jaar ingevoerd is, komt erin, en wie enkel in het vorige jaar stond, valt eruit. POC's zonder vertegenwoordigers in ${fmt(year)} blijven bij hun huidige jaar.`
                : `The lists of ${behind.length} POCs move to the representatives of ${fmt(year)}: whoever is entered for that year joins, and whoever was only in the previous year drops out. POCs without representatives in ${fmt(year)} keep their current year.`
            }
            confirmLabel={nl ? "Lijsten overzetten" : "Move lists"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Lijsten overgezet." : "Lists moved."}
            errorMessages={errorMessages}
          >
            {nl ? `${fmt(year)} verkozen: ${behind.length} lijsten overzetten` : `${fmt(year)} elected: move ${behind.length} lists`}
          </ConfirmTextButton>
        )}
        {canCreateLists && withoutList > 0 && (
          <SaveForm
            action={createPocListsAction}
            submitLabel={nl ? `Groepsadressen aanmaken of koppelen (${withoutList})` : `Create or link group addresses (${withoutList})`}
            submitVariant="ghost"
            savingLabel={nl ? "Bezig..." : "Working..."}
            savedMessage={nl ? "Groepsadressen klaar." : "Group addresses ready."}
            fallbackErrorMessage={nl ? "Aanmaken is mislukt." : "Creating failed."}
          />
        )}
      </div>

      <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">POC</th>
              <th className="px-4 py-3 font-medium">{nl ? "Adres" : "Address"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Lijst volgt" : "List follows"}</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-vtk-blue/5 last:border-0">
                <td className="px-4 py-2 font-medium text-vtk-ink">{row.name}</td>
                <td className="px-4 py-2 text-zinc-600">
                  {row.linkedList ? (
                    <Link href={`${groupsBase}/${row.linkedList.id}`} className="vtk-link">
                      {row.linkedList.email}
                    </Link>
                  ) : row.email ? (
                    <span>
                      {row.email}
                      <span className="block text-xs text-amber-700">
                        {nl ? "nog geen groepsadres" : "no group address yet"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500">{nl ? "geen adres ingevuld" : "no address set"}</span>
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums text-zinc-600">{row.linkedList ? fmt(row.mailYear) : "-"}</td>
                <td className="px-4 py-2 text-right">
                  {row.linkedList && row.mailYear !== year && row.repsInYear > 0 && (
                    <ConfirmIconButton
                      icon={<CheckIcon />}
                      action={markPocsElectedAction}
                      fields={{ year: String(year), pocId: row.id }}
                      label={nl ? `${fmt(year)} verkozen` : `${fmt(year)} elected`}
                      srLabel={nl ? `${fmt(year)} verkozen: ${row.name}` : `${fmt(year)} elected: ${row.name}`}
                      title={nl ? `${row.name}: ${fmt(year)} verkozen?` : `${row.name}: ${fmt(year)} elected?`}
                      description={
                        nl
                          ? `${row.linkedList.email} gaat naar de ${row.repsInYear} vertegenwoordigers van ${fmt(year)}. Wie enkel in ${fmt(row.mailYear)} stond, valt eruit.`
                          : `${row.linkedList.email} moves to the ${row.repsInYear} representatives of ${fmt(year)}. Whoever was only in ${fmt(row.mailYear)} drops out.`
                      }
                      confirmLabel={nl ? "Lijst overzetten" : "Move list"}
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={nl ? "Lijst overgezet." : "List moved."}
                      errorMessages={errorMessages}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
