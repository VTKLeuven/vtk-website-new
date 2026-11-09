"use client";

import { Card, Label } from "@vtk/ui";
import { SearchPicker } from "@/components/admin/SearchPicker";
import { SaveForm } from "@/components/ui/SaveForm";
import { placeDiscordLinkPanelAction } from "@/app/actions/pocs-partners";
import type { DiscordAccessStatus } from "@/lib/discord/pocAccess";

export type DiscordOption = { id: string; name: string };

/** Het koppelbericht op Discord, en hoe de rollen ervoor staan. */
export function PocDiscordCard({
  locale,
  status,
  channels,
}: {
  locale: "nl" | "en";
  status: DiscordAccessStatus;
  channels: DiscordOption[];
}) {
  const nl = locale === "nl";
  const placed = status.panelChannelId !== null;
  const linked = nl
    ? `${status.linked} ${status.linked === 1 ? "account" : "accounts"} gekoppeld.`
    : `${status.linked} ${status.linked === 1 ? "account" : "accounts"} linked.`;
  const waiting =
    status.waiting > 0
      ? nl
        ? ` Bij ${status.waiting} moeten de rollen nog bijgewerkt worden.`
        : ` ${status.waiting} still waiting for a role update.`
      : "";

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-base font-semibold">Discord</h2>
      <p className="text-sm text-vtk-body">
        {nl
          ? "Studenten koppelen hun account met de knop onder het koppelbericht. Daarna geeft de bot hen de rol van hun POC, en die volgt de richting op hun account. De rol en het kanaal per POC stel je in onder POC-instellingen."
          : "Students link their account with the button under the link message. The bot then gives them the role of their POC, which follows the programme on their account. Set the role and channel per POC under POC settings."}
      </p>
      <p className="text-sm tabular-nums text-vtk-muted">
        {linked}
        {waiting}
      </p>
      {status.error ? (
        <p className="text-sm text-vtk-danger">
          {nl ? "Rollen geven lukt niet: " : "Assigning roles fails: "}
          {status.error}
        </p>
      ) : null}
      <SaveForm
        action={placeDiscordLinkPanelAction}
        submitLabel={placed ? (nl ? "Koppelbericht bijwerken" : "Update link message") : nl ? "Koppelbericht plaatsen" : "Post link message"}
        savingLabel={nl ? "Bezig met plaatsen..." : "Posting..."}
        savedMessage={nl ? "Het koppelbericht staat op Discord." : "The link message is on Discord."}
        errorMessages={{ INVALID_INPUT: nl ? "Niet geplaatst: kies eerst een kanaal." : "Not posted: choose a channel first." }}
        fallbackErrorMessage={nl ? "Niet geplaatst: er ging iets mis." : "Not posted: something went wrong."}
        resetOnSuccess={false}
        className="space-y-3"
      >
        <div className="max-w-md">
          <Label htmlFor="discord-panel-channel">{nl ? "Publiek kanaal voor het koppelbericht" : "Public channel for the link message"}</Label>
          <SearchPicker
            id="discord-panel-channel"
            name="channelId"
            options={channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))}
            defaultValue={status.panelChannelId ?? ""}
            placeholder={nl ? "Kies een kanaal" : "Choose a channel"}
            searchPlaceholder={nl ? "Zoek een kanaal" : "Search a channel"}
            ariaLabel={nl ? "Publiek kanaal voor het koppelbericht" : "Public channel for the link message"}
            emptyText={(query) => (nl ? `Geen kanaal gevonden voor "${query}".` : `No channel found for "${query}".`)}
          />
        </div>
      </SaveForm>
    </Card>
  );
}
