"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { PROVISION_IDLE, createGoogleAccountsAction } from "./actions";

export type ProvisionRow = {
  userId: string;
  name: string;
  email: string;
  alias: string | null;
  blocked: string | null;
};

/**
 * Het voorbeeld en de uitvoering in één scherm.
 *
 * Geen `SaveForm`: die meldt enkel of het gelukt is, en hier komt er meer uit.
 * De wachtwoorden zijn eenmalig; ze staan nergens in de database en zijn na een
 * herlaadbeurt weg. Dat staat er ook zo bij, want anders sluit iemand het scherm
 * en is de ploeg buitengesloten.
 */
export function ProvisionAccounts({
  nl,
  sources,
  selectedSource,
  basePath,
  planLabel,
  isKiesploeg,
  rows,
  disabled,
}: {
  nl: boolean;
  sources: { value: string; label: string }[];
  selectedSource: string;
  basePath: string;
  planLabel: string | null;
  isKiesploeg: boolean;
  rows: ProvisionRow[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createGoogleAccountsAction, PROVISION_IDLE);
  const showToast = useToast();
  const lastNonce = useRef(0);

  const t = nl
    ? {
        source: "Voor wie",
        choose: "Kies een post of kiesploeg",
        plan: (label: string) => `Voorstel voor ${label}`,
        member: "Lid",
        address: "Adres",
        alias: "Alias",
        create: "Geselecteerde accounts aanmaken",
        creating: "Bezig met aanmaken...",
        nothing: "Niemand die een account nodig heeft.",
        results: "Aangemaakt",
        password: "Wachtwoord",
        passwordHelp:
          "Deze wachtwoorden staan nergens bewaard en zijn na het verlaten van dit scherm weg. Geef ze door; bij de eerste aanmelding moet het lid zelf een nieuw wachtwoord kiezen.",
        error: "Fout",
        restrictedNote:
          "Kiesploegaccounts komen meteen in de beperkte organisatie-eenheid terecht, met de alias als afzender en met doorsturen aan waar een adres ingevuld is.",
      }
    : {
        source: "For whom",
        choose: "Pick a post or kiesploeg",
        plan: (label: string) => `Proposal for ${label}`,
        member: "Member",
        address: "Address",
        alias: "Alias",
        create: "Create selected accounts",
        creating: "Creating...",
        nothing: "Nobody needs an account.",
        results: "Created",
        password: "Password",
        passwordHelp:
          "These passwords are stored nowhere and are gone once you leave this screen. Pass them on; the member has to pick a new one at first sign-in.",
        error: "Error",
        restrictedNote:
          "Kiesploeg accounts land in the restricted organisational unit right away, with the alias as sender and forwarding on where an address is filled in.",
      };

  useEffect(() => {
    if (state.status === "idle" || state.nonce === lastNonce.current) return;
    lastNonce.current = state.nonce;
    if (state.status === "error") {
      showToast({
        message: errorMessage(state.code, nl),
        variant: "error",
        duration: 0,
      });
      return;
    }
    const failed = state.created.filter((c) => c.error).length;
    showToast({
      message: nl
        ? `${state.created.length - failed} accounts aangemaakt${failed ? `, ${failed} mislukt` : ""}.`
        : `${state.created.length - failed} accounts created${failed ? `, ${failed} failed` : ""}.`,
      variant: failed ? "error" : "success",
      ...(failed ? { duration: 0 } : {}),
    });
  }, [state, nl, showToast]);

  const creatable = rows.filter((row) => row.blocked === null);

  return (
    <div className="space-y-6">
      <div className="w-80">
        <label className="mb-1 block text-sm font-medium text-vtk-ink" htmlFor="provision-source">
          {t.source}
        </label>
        <Select
          id="provision-source"
          value={selectedSource}
          onChange={(e) => router.push(`${basePath}?bron=${encodeURIComponent(e.target.value)}`)}
        >
          <option value="">{t.choose}</option>
          {sources.map((source) => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </Select>
      </div>

      {planLabel && (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="bron" value={selectedSource} />
          <h2 className="text-base font-semibold text-vtk-ink">{t.plan(planLabel)}</h2>
          {isKiesploeg && <p className="text-xs text-zinc-500">{t.restrictedNote}</p>}

          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.nothing}</p>
          ) : (
            <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">{t.create}</span>
                    </th>
                    <th className="px-4 py-3 font-medium">{t.member}</th>
                    <th className="px-4 py-3 font-medium">{t.address}</th>
                    <th className="px-4 py-3 font-medium">{t.alias}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.userId} className="border-b border-vtk-blue/5 last:border-0">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          name="userId"
                          value={row.userId}
                          defaultChecked={row.blocked === null}
                          disabled={row.blocked !== null}
                          aria-label={row.name}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-vtk-ink">{row.name}</td>
                      <td className="px-4 py-3 text-zinc-600">
                        {row.email || "-"}
                        {row.blocked && (
                          <span className="block text-xs text-amber-700">{row.blocked}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{row.alias ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Button type="submit" disabled={pending || disabled || creatable.length === 0}>
            {pending ? t.creating : t.create}
          </Button>
        </form>
      )}

      {state.status === "done" && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-vtk-ink">{t.results}</h2>
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t.passwordHelp}
          </p>
          <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.member}</th>
                  <th className="px-4 py-3 font-medium">{t.address}</th>
                  <th className="px-4 py-3 font-medium">{t.password}</th>
                </tr>
              </thead>
              <tbody>
                {state.created.map((account) => (
                  <tr key={account.userId} className="border-b border-vtk-blue/5 last:border-0">
                    <td className="px-4 py-3 font-medium text-vtk-ink">{account.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{account.email}</td>
                    <td className="px-4 py-3">
                      {account.password ? (
                        <code className="rounded bg-vtk-blue-soft/60 px-2 py-1">
                          {account.password}
                        </code>
                      ) : (
                        <span className="text-xs text-red-700">
                          {t.error}: {account.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/** Foutcode uit de action naar een vertaalde melding. */
function errorMessage(code: string, nl: boolean): string {
  const messages: Record<string, { nl: string; en: string }> = {
    NOT_CONFIGURED: {
      nl: "Google Workspace is nog niet ingesteld.",
      en: "Google Workspace is not set up yet.",
    },
    GOOGLE_UNREACHABLE: {
      nl: "Google is niet bereikbaar; probeer het straks opnieuw.",
      en: "Google is unreachable; try again later.",
    },
    NOTHING_SELECTED: { nl: "Niets aangevinkt.", en: "Nothing selected." },
    INVALID_INPUT: { nl: "Onbekende bron.", en: "Unknown source." },
  };
  const entry = messages[code];
  if (!entry) return nl ? "Aanmaken is mislukt." : "Creating failed.";
  return nl ? entry.nl : entry.en;
}
