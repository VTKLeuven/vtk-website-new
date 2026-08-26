"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Card } from "@vtk/ui";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton, RowActions } from "@/components/ui/IconButton";
import { PencilIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import {
  deleteAlumniContactAction,
  sendAlumniAccessLinkAction,
  toggleAlumniAccountOptInAction,
  toggleAlumniSubscriptionAction,
} from "@/app/actions/alumni";
import type { AlumniAccount } from "@/lib/alumni";
import { SAVE_IDLE } from "@/lib/saveState";
import { AlumniContactForm } from "./AlumniContactForm";

export type AlumniRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  graduationYear: number | null;
  wasInVtk: boolean;
  note: string | null;
  unsubscribedAt: Date | null;
};

type CombinedRow =
  | { source: "contact"; name: string; year: number | null; contact: AlumniRow }
  | { source: "account"; name: string; year: number | null; account: AlumniAccount };

/**
 * Alle alumni in één lijst. De bronbadge maakt het onderscheid zichtbaar zonder
 * de beheerder eerst twee tabellen en twee verschillende verklaringen te laten
 * doorzoeken. Rijacties blijven bronafhankelijk: handmatige contacten zijn hier
 * bewerkbaar, accountgegevens beheert het lid zelf.
 */
export function AlumniTable({
  contacts,
  accounts,
  locale,
}: {
  contacts: AlumniRow[];
  accounts: AlumniAccount[];
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const [editing, setEditing] = useState<string | null>(null);
  const rows: CombinedRow[] = [
    ...contacts.map(
      (contact): CombinedRow => ({
        source: "contact",
        name: `${contact.firstName} ${contact.lastName}`,
        year: contact.graduationYear,
        contact,
      }),
    ),
    ...accounts.map(
      (account): CombinedRow => ({
        source: "account",
        name: account.name,
        year: account.graduationYear,
        account,
      }),
    ),
  ].sort(
    (a, b) =>
      (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name, locale, { sensitivity: "base" }),
  );

  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[#5c667f]">
          {nl
            ? "Nog geen alumni. Voeg er hierboven een toe, of plak een lijst."
            : "No alumni yet. Add one above, or paste a list."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="relative overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
              <th className="px-4 py-3 font-medium">{nl ? "Naam" : "Name"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "E-mail" : "Email"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Lichting" : "Year"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "In VTK" : "In VTK"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Mailinglijst" : "Mailing list"}</th>
              <th className="min-w-64 px-4 py-3 font-medium">{nl ? "Accounttoegang" : "Account access"}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (row.source === "account") {
                const account = row.account;
                return (
                  <tr key={`account:${account.id}`} className="border-b border-vtk-blue/10 last:border-0">
                    <td className="px-4 py-3 font-medium text-vtk-ink">
                      {account.name}
                      <SourceBadge source="account" locale={locale} />
                      {!account.active ? (
                        <span className="ml-2 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600">
                          {nl ? "Gedeactiveerd" : "Deactivated"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[#34405e]">{account.email}</td>
                    <td className="px-4 py-3 text-[#34405e]">{account.graduationYear ?? "-"}</td>
                    <td className="px-4 py-3 text-[#34405e]">
                      {account.wasInVtk ? (nl ? "Ja" : "Yes") : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <MailStatus enabled={account.optedIn} locale={locale} />
                    </td>
                    <td className="px-4 py-3">
                      <AlumniAccessForm account={account} locale={locale} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={toggleAlumniAccountOptInAction}>
                        <input type="hidden" name="id" value={account.id} />
                        <button
                          type="submit"
                          className="whitespace-nowrap rounded-full border border-vtk-blue/15 px-3 py-1 text-xs text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70 active:translate-y-px"
                        >
                          {account.optedIn
                            ? nl
                              ? "Uitschrijven"
                              : "Unsubscribe"
                            : nl
                              ? "Inschrijven"
                              : "Subscribe"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              }

              const contact = row.contact;
              const name = `${contact.firstName} ${contact.lastName}`;
              return (
                <tr key={`contact:${contact.id}`} className="border-b border-vtk-blue/10 last:border-0">
                  <td className="px-4 py-3 font-medium text-vtk-ink">
                    {name}
                    <SourceBadge source="contact" locale={locale} />
                    {contact.note ? (
                      <span className="block text-xs font-normal text-[#5c667f]">{contact.note}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[#34405e]">{contact.email}</td>
                  <td className="px-4 py-3 text-[#34405e]">{contact.graduationYear ?? "-"}</td>
                  <td className="px-4 py-3 text-[#34405e]">
                    {contact.wasInVtk ? (nl ? "Ja" : "Yes") : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <MailStatus enabled={!contact.unsubscribedAt} locale={locale} />
                  </td>
                  <td className="px-4 py-3 text-xs text-[#5c667f]">
                    {nl ? "Geen account" : "No account"}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions>
                      <IconButton
                        label={nl ? "Bewerken" : "Edit"}
                        srLabel={`${nl ? "Bewerken" : "Edit"}: ${name}`}
                        onClick={() => setEditing(editing === contact.id ? null : contact.id)}
                      >
                        <PencilIcon />
                      </IconButton>
                      <form action={toggleAlumniSubscriptionAction}>
                        <input type="hidden" name="id" value={contact.id} />
                        <button
                          type="submit"
                          className="whitespace-nowrap rounded-full border border-vtk-blue/15 px-3 py-1 text-xs text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70 active:translate-y-px"
                        >
                          {contact.unsubscribedAt
                            ? nl
                              ? "Opnieuw inschrijven"
                              : "Resubscribe"
                            : nl
                              ? "Uitschrijven"
                              : "Unsubscribe"}
                        </button>
                      </form>
                      <DeleteIconButton
                        action={deleteAlumniContactAction}
                        fields={{ id: contact.id }}
                        label={nl ? "Verwijderen" : "Delete"}
                        srLabel={`${nl ? "Verwijderen" : "Delete"}: ${name}`}
                        title={nl ? "Alumnus verwijderen?" : "Delete alumnus?"}
                        description={
                          nl
                            ? `${name} (${contact.email}) verdwijnt uit de lijst en uit elke export. Gebruik "Uitschrijven" als alleen de mails moeten stoppen.`
                            : `${name} (${contact.email}) disappears from the list and every export. Use "Unsubscribe" if only the emails should stop.`
                        }
                        confirmLabel={nl ? "Verwijderen" : "Delete"}
                        cancelLabel={nl ? "Annuleren" : "Cancel"}
                        successMessage={nl ? "Alumnus verwijderd" : "Alumnus deleted"}
                      />
                    </RowActions>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {editing
        ? contacts
            .filter((contact) => contact.id === editing)
            .map((contact) => (
              <AlumniContactForm
                key={contact.id}
                locale={locale}
                contact={contact}
                onSaved={() => setEditing(null)}
              />
            ))
        : null}
    </div>
  );
}

function SourceBadge({
  source,
  locale,
}: {
  source: "account" | "contact";
  locale: "nl" | "en";
}) {
  return (
    <span className="ml-2 inline-flex rounded-md border border-vtk-blue/10 bg-vtk-blue-soft/55 px-2 py-0.5 text-[11px] font-normal text-[#43506d]">
      {source === "account"
        ? "Account"
        : locale === "nl"
          ? "Handmatig"
          : "Manual"}
    </span>
  );
}

function MailStatus({ enabled, locale }: { enabled: boolean; locale: "nl" | "en" }) {
  return enabled ? (
    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
      {locale === "nl" ? "Krijgt mails" : "Receives mail"}
    </span>
  ) : (
    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
      {locale === "nl" ? "Uitgeschreven" : "Unsubscribed"}
    </span>
  );
}

/** Verstuurt de eenmalige wachtwoordlink en houdt alle feedback in dezelfde rij. */
function AlumniAccessForm({
  account,
  locale,
}: {
  account: AlumniAccount;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const [state, formAction, pending] = useActionState(sendAlumniAccessLinkAction, SAVE_IDLE);
  const handled = useRef<number | null>(null);
  const showToast = useToast();

  useEffect(() => {
    if (state.status === "idle" || handled.current === state.nonce) return;
    handled.current = state.nonce;
    if (state.status === "success") {
      showToast({
        message: nl ? "Wachtwoordlink verstuurd" : "Password link sent",
        variant: "success",
      });
      return;
    }
    const message =
      state.code === "EMAIL_TAKEN"
        ? nl
          ? "Dit privéadres hoort al bij een ander account."
          : "This private address already belongs to another account."
        : state.code === "NO_PERSONAL_EMAIL"
          ? nl
            ? "Vul een niet-KU-Leuven-adres in."
            : "Enter a non-KU-Leuven address."
          : state.code === "MAIL_FAILED"
            ? nl
              ? "De mail kon niet worden verstuurd."
              : "The email could not be sent."
            : nl
              ? "De toegangslink kon niet worden verstuurd."
              : "The access link could not be sent.";
    showToast({ message, variant: "error", duration: 0 });
  }, [state, showToast, nl]);

  return (
    <form action={formAction} className="flex min-w-56 flex-col items-start gap-1.5">
      <input type="hidden" name="id" value={account.id} />
      {account.accessEmail ? (
        <>
          <input type="hidden" name="email" value={account.accessEmail} />
          <span className="max-w-64 truncate text-xs text-[#5c667f]" title={account.accessEmail}>
            {account.accessEmail}
          </span>
        </>
      ) : (
        <input
          name="email"
          type="email"
          required
          placeholder={nl ? "Privé-e-mailadres" : "Private email address"}
          aria-label={nl ? `Privé-e-mailadres van ${account.name}` : `Private email address for ${account.name}`}
          className="w-full rounded-lg border border-vtk-blue/15 bg-white px-2.5 py-1.5 text-xs text-vtk-ink outline-none transition-colors focus:border-vtk-blue"
        />
      )}
      <button
        type="submit"
        disabled={pending || !account.active}
        className="whitespace-nowrap rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? nl
            ? "Versturen..."
            : "Sending..."
          : account.hasPassword
            ? nl
              ? "Herstellink sturen"
              : "Send reset link"
            : nl
              ? "Toegangslink sturen"
              : "Send access link"}
      </button>
    </form>
  );
}
