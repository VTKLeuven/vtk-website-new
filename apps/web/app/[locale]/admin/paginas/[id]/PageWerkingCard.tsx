"use client";

import { Card, Label, Select } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { savePageGroupAction } from "@/app/actions/pages";
import { saveErrorMessages } from "@/lib/saveMessages";

export type WerkingOption = { id: string; name: string };

/**
 * De post achter deze pagina.
 *
 * Staat er een post ingevuld, dan toont de pagina wat die werking doet: haar
 * eerstvolgende activiteiten, haar ploeg van dit werkingsjaar en een blok in de
 * kolom ernaast. Leeg laten is een volwaardige keuze en niet een half ingevulde
 * pagina; daarom zegt de tekst hier wat er gebeurt in beide gevallen.
 */
export function PageWerkingCard({
  locale,
  pageId,
  groupId,
  groups,
}: {
  locale: Locale;
  pageId: string;
  groupId: string | null;
  groups: WerkingOption[];
}) {
  const nl = locale === "nl";

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-vtk-ink">{nl ? "Werking" : "Team"}</h2>
      <p className="mt-1 text-xs text-[#5c667f]">
        {nl
          ? "Hoort deze pagina bij een post? Dan toont ze onderaan de eerstvolgende activiteiten van die post en haar ploeg van dit werkingsjaar, en staat er een blok in de kolom naast de tekst."
          : "Does this page belong to a team? Then it shows that team's next activities and this year's members at the bottom, plus a block in the column beside the text."}
      </p>
      <p className="mt-1 text-xs text-[#5c667f]">
        {nl
          ? "Geen post kiezen mag: een FAQ of een woordenlijst hoort bij niemand in het bijzonder en blijft gewoon een tekstpagina."
          : "Leaving it empty is fine: an FAQ or a glossary belongs to no one in particular and stays a plain text page."}
      </p>

      <SaveForm
        action={savePageGroupAction}
        className="mt-4 space-y-3"
        submitLabel={nl ? "Werking opslaan" : "Save team"}
        savingLabel={nl ? "Opslaan…" : "Saving…"}
        savedMessage={nl ? "Werking opgeslagen" : "Team saved"}
        errorMessages={saveErrorMessages(locale)}
        fallbackErrorMessage={
          nl ? "De werking kon niet worden opgeslagen." : "The team could not be saved."
        }
        resetOnSuccess={false}
      >
        <input type="hidden" name="id" value={pageId} />
        <div className="max-w-sm">
          <Label htmlFor={`werking-${pageId}`}>{nl ? "Post" : "Team"}</Label>
          <Select id={`werking-${pageId}`} name="groupId" defaultValue={groupId ?? ""}>
            <option value="">{nl ? "Geen post" : "No team"}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </div>
      </SaveForm>
    </Card>
  );
}
