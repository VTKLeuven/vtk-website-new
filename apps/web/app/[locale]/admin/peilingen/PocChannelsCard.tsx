"use client";

import { useEffect, useState } from "react";
import { Button } from "@vtk/ui";
import Link from "@/components/ui/Link";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { SearchPicker } from "@/components/admin/SearchPicker";
import { SaveForm } from "@/components/ui/SaveForm";
import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { listPocPollChannelsAction, savePocPollChannelsAction } from "@/app/actions/poc-polls";
import { pollAdminErrors } from "@/lib/pocPolls/adminCopy";

type Poc = { id: string; name: string; channelId: string; hasRole: boolean };
type Channel = { id: string; name: string };

/**
 * Welk Discord-kanaal bij welke POC hoort. Daar komen de peilingen van haar
 * RiVers; zij kiezen zelf geen kanaal. Enkel VTK Onderwijs ziet en wijzigt dit.
 *
 * Dicht bij het laden, en de kanalen komen pas van Discord wanneer iemand de
 * kaart openklapt: Discord antwoordt soms traag, en de lijst met peilingen
 * erboven hoort daar niet op te wachten. `AdminDisclosure` mount de inhoud pas
 * bij de eerste klik, dus de vraag aan Discord vertrekt ook pas dan.
 *
 * Het kanaal zegt enkel waar de peilingen komen. Wie het kanaal ziet, bepaalt de
 * rol van de POC, en die staat bij POC's. Een kanaal zonder rol is voor geen
 * enkele student open; daarom staat dat hier naast het kanaal, en niet enkel in
 * het antwoord van de bot aan een student die op de knop drukt.
 */
export function PocChannelsCard({
  nl,
  pocs,
  preview,
  rolesHref,
}: {
  nl: boolean;
  pocs: Poc[];
  preview: boolean;
  rolesHref: string;
}) {
  const linked = pocs.filter((poc) => poc.channelId).length;
  const closed = pocs.filter((poc) => poc.channelId && !poc.hasRole).map((poc) => poc.name);
  return (
    <AdminDisclosure
      summary={
        <>
          <span className="block text-base font-semibold">{nl ? "Discord-kanalen per POC" : "Discord channels per POC"}</span>
          <span className="mt-1 block max-w-3xl text-sm text-vtk-muted">
            {nl
              ? `${linked} van ${pocs.length} POC's hebben een kanaal. Een peiling van een RiVer komt altijd in het kanaal van zijn POC; enkel VTK Onderwijs kan bij een peiling een ander kanaal kiezen.`
              : `${linked} of ${pocs.length} POCs have a channel. A poll by a student rep always goes to their POC's channel; only VTK Onderwijs can pick another channel for a poll.`}
          </span>
          {closed.length > 0 ? (
            <span className="mt-1 block max-w-3xl text-sm text-vtk-danger">
              {nl
                ? `Zonder Discord-rol, dus voor geen enkele student open: ${closed.join(", ")}.`
                : `No Discord role, so closed to every student: ${closed.join(", ")}.`}
            </span>
          ) : null}
        </>
      }
    >
      {/* Een autorisatievoorbeeld is alleen-lezen: proxy.ts weigert elke POST,
          ook de server action die de kanalen ophaalt. */}
      {preview ? (
        <div className="text-sm text-vtk-muted">
          {nl
            ? "In een autorisatievoorbeeld worden de kanalen niet opgehaald: het voorbeeld is alleen-lezen."
            : "The channels are not fetched in an authorization preview: the preview is read-only."}
        </div>
      ) : (
        <PocChannelsForm nl={nl} pocs={pocs} rolesHref={rolesHref} />
      )}
    </AdminDisclosure>
  );
}

function PocChannelsForm({ nl, pocs, rolesHref }: { nl: boolean; pocs: Poc[]; rolesHref: string }) {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Elke klik op "Opnieuw proberen" verhoogt dit, en dat start het effect opnieuw.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchChannels(nl).then((outcome) => {
      if (cancelled) return;
      if ("channels" in outcome) setChannels(outcome.channels);
      else setFailed(outcome.error);
    });
    return () => {
      cancelled = true;
    };
  }, [nl, attempt]);

  if (failed) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {/* Geen <p>: vtk-admin.css zet elke <p> in de admin in --muted. */}
        <div role="alert" className="text-sm text-vtk-danger">
          {failed}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setFailed(null);
            setAttempt((count) => count + 1);
          }}
        >
          {nl ? "Opnieuw proberen" : "Try again"}
        </Button>
      </div>
    );
  }

  if (!channels) {
    return (
      <p className="text-sm text-vtk-muted" role="status">
        {nl ? "Kanalen ophalen bij Discord..." : "Fetching channels from Discord..."}
      </p>
    );
  }

  return (
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
            <th scope="col" className="pb-1.5 pr-3 font-medium">{nl ? "Kanaal" : "Channel"}</th>
            <th scope="col" className="pb-1.5 font-medium">{nl ? "Wie het ziet" : "Who sees it"}</th>
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
              <td className="py-2 pl-3 align-middle">
                {poc.hasRole ? (
                  <span className="text-vtk-muted">{nl ? "Wie de rol van de POC heeft" : "Holders of the POC role"}</span>
                ) : (
                  <Link href={rolesHref} className="font-medium text-vtk-danger underline underline-offset-2">
                    {nl ? "Niemand: kies een rol bij POC's" : "Nobody: pick a role under POCs"}
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SaveForm>
  );
}

/** Vraagt de kanalen op; een fout komt terug als de melding die de kaart toont. */
async function fetchChannels(nl: boolean): Promise<{ channels: Channel[] } | { error: string }> {
  const result = await unsentGuard.run(() => listPocPollChannelsAction());
  if (result === UNSENT) {
    return {
      error: nl
        ? "De kanalen konden niet opgehaald worden: geen verbinding met de site."
        : "Could not fetch the channels: no connection to the site.",
    };
  }
  if (result.ok) return { channels: result.channels };
  return {
    error:
      result.code === "POLL_DISCORD_DOWN"
        ? nl
          ? "Discord antwoordde niet, dus de kanalen zijn niet te kiezen. Probeer het straks opnieuw."
          : "Discord did not answer, so no channel can be picked. Please try again later."
        : nl
          ? "Enkel VTK Onderwijs stelt de kanalen in."
          : "Only VTK Onderwijs sets the channels.",
  };
}
