"use client";

import { Card } from "@vtk/ui";
import { SearchPicker } from "@/components/admin/SearchPicker";
import { SaveForm } from "@/components/ui/SaveForm";
import { savePocPollChannelsAction } from "@/app/actions/poc-polls";
import { pollAdminErrors } from "@/lib/pocPolls/adminCopy";

/**
 * Welk Discord-kanaal bij welke POC hoort. Daar komen de peilingen van haar
 * RiVers; zij kiezen zelf geen kanaal. Enkel VTK Onderwijs ziet en wijzigt dit.
 */
export function PocChannelsCard({
  nl,
  pocs,
  channels,
}: {
  nl: boolean;
  pocs: Array<{ id: string; name: string; channelId: string }>;
  channels: Array<{ id: string; name: string }>;
}) {
  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="text-base font-semibold">{nl ? "Discord-kanalen per POC" : "Discord channels per POC"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Een peiling van een RiVer komt altijd in het kanaal van zijn POC. Enkel VTK Onderwijs kan bij een peiling een ander kanaal kiezen."
            : "A poll by a student rep always goes to their POC's channel. Only VTK Onderwijs can pick another channel for a poll."}
        </p>
      </div>
      <SaveForm
        action={savePocPollChannelsAction}
        submitLabel={nl ? "Opslaan" : "Save"}
        savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
        savedMessage={nl ? "Kanalen opgeslagen." : "Channels saved."}
        errorMessages={pollAdminErrors(nl)}
        fallbackErrorMessage={nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."}
        resetOnSuccess={false}
        className="space-y-4"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-vtk-muted">
              <th scope="col" className="pb-1.5 pr-3 font-medium">POC</th>
              <th scope="col" className="pb-1.5 font-medium">{nl ? "Kanaal" : "Channel"}</th>
            </tr>
          </thead>
          <tbody>
            {pocs.map((poc) => (
              <tr key={poc.id} className="border-t border-vtk-blue/10">
                <td className="py-2 pr-3 align-middle font-medium">{poc.name}</td>
                <td className="w-1/2 py-2 align-middle">
                  <SearchPicker
                    name={`channel_${poc.id}`}
                    options={[
                      { value: "", label: nl ? "Geen kanaal" : "No channel", muted: true },
                      ...channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` })),
                    ]}
                    defaultValue={poc.channelId}
                    placeholder={nl ? "Geen kanaal" : "No channel"}
                    searchPlaceholder={nl ? "Zoek een kanaal" : "Search a channel"}
                    ariaLabel={nl ? `Discord-kanaal van ${poc.name}` : `Discord channel of ${poc.name}`}
                    emptyText={(query) => (nl ? `Geen kanaal gevonden voor "${query}".` : `No channel found for "${query}".`)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SaveForm>
    </Card>
  );
}
