"use client";

import Link from "next/link";
import { Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import type { LinkSuggestions, WebsiteUser } from "@/lib/google/linking";
import {
  linkAllSuggestionsAction,
  linkGoogleAccountAction,
  unlinkGoogleAccountAction,
} from "../actions";

/**
 * Koppelscherm: welk `@vtk.be`-account hoort bij welk lid.
 *
 * Voorstellen zijn enkel de eenduidige gevallen. Naamgenoten staan apart, met
 * een keuzelijst, want een verkeerde koppeling zet iemand in de mailinglijsten
 * van een ander en dat valt lang niet op.
 */
export function GoogleLinks({
  nl,
  backHref,
  domain,
  error,
  matches,
  ambiguous,
  unmatched,
  users,
  linked,
}: {
  nl: boolean;
  backHref: string;
  domain: string;
  error: string | null;
  matches: LinkSuggestions["matches"];
  ambiguous: LinkSuggestions["ambiguous"];
  unmatched: LinkSuggestions["unmatched"];
  users: WebsiteUser[];
  linked: { id: string; name: string; email: string }[];
}) {
  const t = nl
    ? {
        title: "Accounts koppelen",
        intro: `Welk ${domain}-account hoort bij welk lid. Zonder koppeling weet de synchronisatie geen adres en valt iemand uit elke lijst.`,
        back: "Terug naar groepsadressen",
        suggestions: "Voorstellen",
        suggestionsHelp:
          "Eenduidige naamovereenkomsten: precies één lid en precies één account.",
        linkAll: "Alle voorstellen koppelen",
        linkingAll: "Bezig met koppelen...",
        linkedAll: "Voorstellen gekoppeld.",
        link: "Koppelen",
        linking: "Bezig met koppelen...",
        done: "Gekoppeld.",
        ambiguous: "Naamgenoten",
        ambiguousHelp:
          "Meer dan één lid past bij deze naam. Kies zelf, of laat staan tot het lid zichzelf koppelt.",
        unmatched: "Geen lid gevonden",
        unmatchedHelp:
          "Accounts waar geen lid met een post van dit of volgend werkingsjaar bij past: oud-leden, gedeelde adressen, of iemand wiens naam anders geschreven staat.",
        choose: "Kies een lid",
        linkedTitle: "Al gekoppeld",
        unlink: "Koppeling verwijderen",
        unlinkTitle: "Koppeling verwijderen?",
        unlinkDescription: (name: string, email: string) =>
          `${name} valt uit elke groepsadres-lijst tot het account opnieuw gekoppeld is. Het account ${email} zelf blijft bestaan.`,
        cancel: "Annuleren",
        unlinked: "Koppeling verwijderd.",
        none: "Niets te koppelen.",
        errorTitle: "De directory kon niet gelezen worden",
      }
    : {
        title: "Link accounts",
        intro: `Which ${domain} account belongs to which member. Without a link the synchronisation has no address and someone drops out of every list.`,
        back: "Back to group addresses",
        suggestions: "Suggestions",
        suggestionsHelp: "Unambiguous name matches: exactly one member and exactly one account.",
        linkAll: "Link all suggestions",
        linkingAll: "Linking...",
        linkedAll: "Suggestions linked.",
        link: "Link",
        linking: "Linking...",
        done: "Linked.",
        ambiguous: "Same name",
        ambiguousHelp:
          "More than one member matches this name. Pick one, or leave it until the member links themselves.",
        unmatched: "No member found",
        unmatchedHelp:
          "Accounts with no matching member holding a post this or next working year: former members, shared addresses, or someone whose name is spelled differently.",
        choose: "Choose a member",
        linkedTitle: "Already linked",
        unlink: "Remove link",
        unlinkTitle: "Remove link?",
        unlinkDescription: (name: string, email: string) =>
          `${name} drops out of every group address until the account is linked again. The account ${email} itself keeps existing.`,
        cancel: "Cancel",
        unlinked: "Link removed.",
        none: "Nothing to link.",
        errorTitle: "The directory could not be read",
      };

  const errorMessages = nl
    ? {
        NOT_CONFIGURED: "Google Workspace is nog niet ingesteld.",
        GOOGLE_UNREACHABLE: "Google is niet bereikbaar; probeer het straks opnieuw.",
        WRONG_DOMAIN: `Niet gekoppeld: enkel adressen op ${domain} kunnen gekoppeld worden.`,
        ALREADY_LINKED: "Niet gekoppeld: dat account hangt al aan een ander lid.",
        INVALID_INPUT: "Niet gekoppeld: controleer de keuze.",
      }
    : {
        NOT_CONFIGURED: "Google Workspace is not set up yet.",
        GOOGLE_UNREACHABLE: "Google is unreachable; try again later.",
        WRONG_DOMAIN: `Not linked: only addresses on ${domain} can be linked.`,
        ALREADY_LINKED: "Not linked: that account already belongs to another member.",
        INVALID_INPUT: "Not linked: check the selection.",
      };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-vtk-ink">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">{t.intro}</p>
        <Link href={backHref} className="vtk-link mt-2 inline-block text-sm">
          {t.back}
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-medium">{t.errorTitle}</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {matches.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-vtk-ink">
              {t.suggestions} ({matches.length})
            </h2>
            <p className="mt-1 text-sm text-zinc-500">{t.suggestionsHelp}</p>
          </div>
          <SaveForm
            action={linkAllSuggestionsAction}
            submitLabel={t.linkAll}
            savingLabel={t.linkingAll}
            savedMessage={t.linkedAll}
            errorMessages={errorMessages}
            fallbackErrorMessage={nl ? "Koppelen is mislukt." : "Linking failed."}
          />
          <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
            {matches.map((match) => (
              <li
                key={match.googleUserId}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="font-medium text-vtk-ink">{match.userName}</span>
                <span className="text-zinc-600">{match.googleEmail}</span>
                <SaveForm
                  action={linkGoogleAccountAction}
                  submitLabel={t.link}
                  savingLabel={t.linking}
                  savedMessage={t.done}
                  errorMessages={errorMessages}
                  fallbackErrorMessage={nl ? "Koppelen is mislukt." : "Linking failed."}
                >
                  <input type="hidden" name="userId" value={match.userId} />
                  <input type="hidden" name="googleUserId" value={match.googleUserId} />
                  <input type="hidden" name="googleEmail" value={match.googleEmail} />
                </SaveForm>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ambiguous.length > 0 && (
        <PickerSection
          title={`${t.ambiguous} (${ambiguous.length})`}
          help={t.ambiguousHelp}
          rows={ambiguous.map((row) => ({
            googleUserId: row.googleUserId,
            googleEmail: row.googleEmail,
            label: row.googleEmail,
            options: row.candidates,
          }))}
          chooseLabel={t.choose}
          linkLabel={t.link}
          linkingLabel={t.linking}
          doneLabel={t.done}
          errorMessages={errorMessages}
          nl={nl}
        />
      )}

      {unmatched.length > 0 && (
        <PickerSection
          title={`${t.unmatched} (${unmatched.length})`}
          help={t.unmatchedHelp}
          rows={unmatched.map((row) => ({
            googleUserId: row.googleUserId,
            googleEmail: row.googleEmail,
            label: row.label,
            options: users,
          }))}
          chooseLabel={t.choose}
          linkLabel={t.link}
          linkingLabel={t.linking}
          doneLabel={t.done}
          errorMessages={errorMessages}
          nl={nl}
        />
      )}

      {linked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-vtk-ink">
            {t.linkedTitle} ({linked.length})
          </h2>
          <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
            {linked.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="font-medium text-vtk-ink">{row.name}</span>
                <span className="text-zinc-600">{row.email}</span>
                <DeleteIconButton
                  action={unlinkGoogleAccountAction}
                  fields={{ userId: row.id }}
                  label={t.unlink}
                  srLabel={`${t.unlink}: ${row.name}`}
                  title={t.unlinkTitle}
                  description={t.unlinkDescription(row.name, row.email)}
                  confirmLabel={t.unlink}
                  cancelLabel={t.cancel}
                  successMessage={t.unlinked}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!error && matches.length === 0 && ambiguous.length === 0 && unmatched.length === 0 && (
        <p className="text-sm text-zinc-500">{t.none}</p>
      )}
    </div>
  );
}

/** Een rij per account met een keuzelijst van leden ernaast. */
function PickerSection({
  title,
  help,
  rows,
  chooseLabel,
  linkLabel,
  linkingLabel,
  doneLabel,
  errorMessages,
  nl,
}: {
  title: string;
  help: string;
  rows: {
    googleUserId: string;
    googleEmail: string;
    label: string;
    options: WebsiteUser[];
  }[];
  chooseLabel: string;
  linkLabel: string;
  linkingLabel: string;
  doneLabel: string;
  errorMessages: Record<string, string>;
  nl: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-vtk-ink">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">{help}</p>
      </div>
      <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
        {rows.map((row) => (
          <li key={row.googleUserId} className="px-3 py-2 text-sm">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem]">
                <span className="block font-medium text-vtk-ink">{row.googleEmail}</span>
                {row.label !== row.googleEmail && (
                  <span className="block text-xs text-zinc-500">{row.label}</span>
                )}
              </div>
              <SaveForm
                action={linkGoogleAccountAction}
                submitLabel={linkLabel}
                savingLabel={linkingLabel}
                savedMessage={doneLabel}
                errorMessages={errorMessages}
                fallbackErrorMessage={nl ? "Koppelen is mislukt." : "Linking failed."}
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="googleUserId" value={row.googleUserId} />
                <input type="hidden" name="googleEmail" value={row.googleEmail} />
                <div className="w-64">
                  <Select name="userId" required defaultValue="" aria-label={chooseLabel}>
                    <option value="" disabled>
                      {chooseLabel}
                    </option>
                    {row.options.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </SaveForm>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
