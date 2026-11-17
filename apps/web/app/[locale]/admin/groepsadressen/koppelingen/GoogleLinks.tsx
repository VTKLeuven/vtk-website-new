"use client";

import { useMemo, useState } from "react";
import Link from "@/components/ui/Link";
import { SaveForm } from "@/components/ui/SaveForm";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { SearchPicker } from "@/components/admin/SearchPicker";
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
        unmatched: "Accounts zonder lid",
        unmatchedHelp:
          "Accounts waar geen lid met een post van dit of volgend werkingsjaar bij past: meestal oud-leden en gedeelde adressen. Zoek hier enkel wanneer je een bepaald account zoekt; wie een post heeft en nog niet gekoppeld is, staat hierboven.",
        unmatchedSearch: "Zoek een account, bv. acti of vanweert",
        unmatchedMore: (shown: number, total: number) => `${shown} van ${total} getoond; zoek om de rest te vinden.`,
        choose: "Kies een lid",
        searchMember: "Zoek op naam",
        noMemberMatch: (q: string) => `Geen lid met een post gevonden voor "${q}".`,
        members: "Leden met een post, nog niet gekoppeld",
        membersHelp:
          "Wie dit of volgend werkingsjaar een post of werkgroep heeft, maar nog geen gekoppeld account. Zonder koppeling valt die persoon uit elke lijst. Kies het account, of maak er een aan als het nog niet bestaat.",
        chooseAccount: "Kies een account",
        searchAccount: "Zoek op adres of naam",
        noAccountMatch: (q: string) => `Geen vrij account gevonden voor "${q}".`,
        noAccountYet: "Nog geen account? Maak het aan",
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
        unmatched: "Accounts without a member",
        unmatchedHelp:
          "Accounts with no matching member holding a post this or next working year: mostly former members and shared addresses. Only search here when you look for a specific account; whoever has a post and is not linked yet is listed above.",
        unmatchedSearch: "Search an account, e.g. acti or vanweert",
        unmatchedMore: (shown: number, total: number) => `${shown} of ${total} shown; search to find the rest.`,
        choose: "Choose a member",
        searchMember: "Search by name",
        noMemberMatch: (q: string) => `No member with a post found for "${q}".`,
        members: "Members with a post, not linked yet",
        membersHelp:
          "Whoever has a post or work group this or next working year but no linked account yet. Without a link they drop out of every list. Pick the account, or create one if it does not exist yet.",
        chooseAccount: "Choose an account",
        searchAccount: "Search by address or name",
        noAccountMatch: (q: string) => `No free account found for "${q}".`,
        noAccountYet: "No account yet? Create it",
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

  // Eerst de mensen: wie een post heeft en nog niet gekoppeld is, met de vrije
  // accounts in een zoekbare lijst. Dat zijn er tientallen; de honderden
  // accounts zonder lid (meestal oud-leden) staan dichtgeklapt eronder.
  const matched = new Set(matches.map((m) => m.userId));
  const membersToLink = users.filter((u) => !matched.has(u.id));
  const freeAccounts = [
    ...ambiguous.map((a) => ({ id: a.googleUserId, email: a.googleEmail, label: a.googleEmail })),
    ...unmatched.map((a) => ({ id: a.googleUserId, email: a.googleEmail, label: a.label })),
  ].sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-vtk-ink">{t.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">{t.intro}</p>
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
          t={t}
          errorMessages={errorMessages}
          nl={nl}
        />
      )}

      {membersToLink.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-vtk-ink">
              {t.members} ({membersToLink.length})
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500">
              {t.membersHelp}{" "}
              <Link href={`${backHref}/accounts`} className="vtk-link">
                {t.noAccountYet}
              </Link>
            </p>
          </div>
          <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
            {membersToLink.map((user) => (
              <MemberRow
                key={user.id}
                user={user}
                accounts={freeAccounts}
                t={t}
                errorMessages={errorMessages}
                nl={nl}
              />
            ))}
          </ul>
        </section>
      )}

      {unmatched.length > 0 && (
        <AdminDisclosure
          summary={
            <span>
              <span className="font-semibold text-vtk-ink">
                {t.unmatched} ({unmatched.length})
              </span>
              <span className="block text-sm text-zinc-500">{t.unmatchedHelp}</span>
            </span>
          }
        >
          <UnmatchedAccounts
            rows={unmatched}
            users={users}
            t={t}
            errorMessages={errorMessages}
            nl={nl}
          />
        </AdminDisclosure>
      )}

      {linked.length > 0 && (
        <AdminDisclosure
          summary={
            <span className="font-semibold text-vtk-ink">
              {t.linkedTitle} ({linked.length})
            </span>
          }
        >
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
        </AdminDisclosure>
      )}

      {!error && matches.length === 0 && ambiguous.length === 0 && unmatched.length === 0 && (
        <p className="text-sm text-zinc-500">{t.none}</p>
      )}
    </div>
  );
}

type Texts = {
  link: string;
  linking: string;
  done: string;
  choose: string;
  searchMember: string;
  noMemberMatch: (q: string) => string;
  chooseAccount: string;
  searchAccount: string;
  noAccountMatch: (q: string) => string;
  unmatchedSearch: string;
  unmatchedMore: (shown: number, total: number) => string;
};

/** Een rij per account met een zoekbare lijst van leden ernaast. */
function PickerSection({
  title,
  help,
  rows,
  t,
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
  t: Texts;
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
          <AccountRow key={row.googleUserId} row={row} t={t} errorMessages={errorMessages} nl={nl} />
        ))}
      </ul>
    </section>
  );
}

/** Eén account met een zoekbare lijst van leden om het aan te hangen. */
function AccountRow({
  row,
  t,
  errorMessages,
  nl,
}: {
  row: { googleUserId: string; googleEmail: string; label: string; options: WebsiteUser[] };
  t: Texts;
  errorMessages: Record<string, string>;
  nl: boolean;
}) {
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <span className="block font-medium text-vtk-ink">{row.googleEmail}</span>
          {row.label !== row.googleEmail && <span className="block text-xs text-zinc-500">{row.label}</span>}
        </div>
        <SaveForm
          action={linkGoogleAccountAction}
          submitLabel={t.link}
          savingLabel={t.linking}
          savedMessage={t.done}
          errorMessages={errorMessages}
          fallbackErrorMessage={nl ? "Koppelen is mislukt." : "Linking failed."}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="googleUserId" value={row.googleUserId} />
          <input type="hidden" name="googleEmail" value={row.googleEmail} />
          <div className="w-64 max-w-full">
            <SearchPicker
              name="userId"
              options={row.options.map((user) => ({ value: user.id, label: user.name }))}
              placeholder={t.choose}
              searchPlaceholder={t.searchMember}
              ariaLabel={`${t.choose}: ${row.googleEmail}`}
              emptyText={t.noMemberMatch}
            />
          </div>
        </SaveForm>
      </div>
    </li>
  );
}

/** Eén lid met een post, met de vrije accounts in een zoekbare lijst. */
function MemberRow({
  user,
  accounts,
  t,
  errorMessages,
  nl,
}: {
  user: WebsiteUser;
  accounts: { id: string; email: string; label: string }[];
  t: Texts;
  errorMessages: Record<string, string>;
  nl: boolean;
}) {
  const [accountId, setAccountId] = useState("");
  const account = accounts.find((a) => a.id === accountId);
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <span className="min-w-[14rem] flex-1 font-medium text-vtk-ink">{user.name}</span>
        <SaveForm
          action={linkGoogleAccountAction}
          submitLabel={t.link}
          savingLabel={t.linking}
          savedMessage={t.done}
          errorMessages={errorMessages}
          fallbackErrorMessage={nl ? "Koppelen is mislukt." : "Linking failed."}
          submitDisabled={!account}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="googleUserId" value={account?.id ?? ""} />
          <input type="hidden" name="googleEmail" value={account?.email ?? ""} />
          <div className="w-72 max-w-full">
            <SearchPicker
              options={accounts.map((a) => ({
                value: a.id,
                label: a.email,
                hint: a.label !== a.email ? a.label : undefined,
              }))}
              value={accountId}
              onChange={setAccountId}
              placeholder={t.chooseAccount}
              searchPlaceholder={t.searchAccount}
              ariaLabel={`${t.chooseAccount}: ${user.name}`}
              emptyText={t.noAccountMatch}
            />
          </div>
        </SaveForm>
      </div>
    </li>
  );
}

/** Honderden accounts zonder lid: enkel wat bij de zoekterm past, en hoogstens vijftig. */
function UnmatchedAccounts({
  rows,
  users,
  t,
  errorMessages,
  nl,
}: {
  rows: LinkSuggestions["unmatched"];
  users: WebsiteUser[];
  t: Texts;
  errorMessages: Record<string, string>;
  nl: boolean;
}) {
  const [query, setQuery] = useState("");
  const LIMIT = 50;
  const found = useMemo(() => {
    const words = query
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) return rows;
    return rows.filter((r) => {
      const hay = `${r.googleEmail} ${r.label}`.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, query]);
  const shown = found.slice(0, LIMIT);
  return (
    <div className="space-y-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.unmatchedSearch}
        aria-label={t.unmatchedSearch}
        className="h-9 w-72 max-w-full rounded-full border border-vtk-blue/15 bg-white px-4 text-sm"
      />
      <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
        {shown.map((row) => (
          <AccountRow
            key={row.googleUserId}
            row={{ ...row, options: users }}
            t={t}
            errorMessages={errorMessages}
            nl={nl}
          />
        ))}
      </ul>
      {found.length > shown.length && <p className="text-xs text-zinc-500">{t.unmatchedMore(shown.length, found.length)}</p>}
    </div>
  );
}
