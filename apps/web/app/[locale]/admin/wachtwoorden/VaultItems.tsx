"use client";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import { Button, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, InfoIcon, KeyIcon, PencilIcon, UserIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { deleteVaultItemAction, revealVaultItemAction, saveVaultItemAction } from "./actions";

export type ItemRow = {
  id: string;
  name: string;
  username: string | null;
  uri: string | null;
  notes: string | null;
  changedLabel: string | null;
};

/**
 * De wachtwoorden van één post.
 *
 * De lijst bevat bewust géén wachtwoorden: die worden per stuk opgehaald wanneer
 * iemand op kopiëren klikt. Zo staat er niet bij elke paginaweergave een
 * volledige postkluis in de HTML, en levert het logboek een bruikbaar antwoord
 * op "wie heeft dit opgevraagd".
 */
export function VaultItems({
  nl,
  vaultPostId,
  postName,
  items,
}: {
  nl: boolean;
  vaultPostId: string;
  postName: string;
  items: ItemRow[];
}) {
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [openNotes, setOpenNotes] = useState<string | null>(null);

  const t = nl
    ? {
        heading: `Wachtwoorden van ${postName}`,
        add: "Nieuw wachtwoord",
        empty: "Nog geen wachtwoorden voor deze post.",
        emptyHint:
          "Wat je hier toevoegt, staat meteen in de Bitwarden-app en -extensie van iedereen in deze post.",
        name: "Naam",
        username: "Gebruikersnaam",
        address: "Adres",
        changed: "Gewijzigd",
        actions: "Acties",
        copyPassword: "Wachtwoord kopiëren",
        copyUsername: "Gebruikersnaam kopiëren",
        copied: "Gekopieerd",
        info: "Notities tonen",
        infoHide: "Notities verbergen",
        noUsername: "Geen gebruikersnaam bij dit item.",
        edit: "Bewerken",
        remove: "Verwijderen",
        cancel: "Annuleren",
      }
    : {
        heading: `Passwords for ${postName}`,
        add: "New password",
        empty: "No passwords for this post yet.",
        emptyHint:
          "Anything you add here appears straight away in the Bitwarden app and extension of everyone in this post.",
        name: "Name",
        username: "Username",
        address: "Address",
        changed: "Changed",
        actions: "Actions",
        copyPassword: "Copy password",
        copyUsername: "Copy username",
        copied: "Copied",
        info: "Show notes",
        infoHide: "Hide notes",
        noUsername: "This item has no username.",
        edit: "Edit",
        remove: "Delete",
        cancel: "Cancel",
      };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.heading}</h2>
        {!adding && !editing && (
          <Button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditing(null);
            }}
          >
            {t.add}
          </Button>
        )}
      </div>

      {(adding || editing) && (
        <ItemForm
          nl={nl}
          vaultPostId={vaultPostId}
          item={editing}
          onDone={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-vtk-blue/15 bg-white p-6 text-sm text-zinc-600">
          {t.empty} {t.emptyHint}
        </p>
      ) : (
        /* `relative` is verplicht: de `sr-only` kop hieronder is absoluut
           gepositioneerd en ankert zonder dit op de pagina in plaats van op de
           tabel, waarna een telefoon de hele pagina uitzoomt (zie CLAUDE.md). */
        <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
          {/* `table-fixed` met vaste kolombreedtes: anders bepaalt de inhoud de
              breedte en scrolt de ene post wel horizontaal en de andere niet,
              wat bij het wisselen van post aanvoelt als een andere pagina. Nu is
              elke posttabel even breed en gedraagt de scroller zich overal
              hetzelfde; te lange waarden worden afgekapt in plaats van te duwen. */}
          <table className="w-full min-w-[52rem] table-fixed text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[24%]" />
              <col className="w-[24%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t.name}</th>
                <th className="px-4 py-3 font-medium">{t.username}</th>
                <th className="px-4 py-3 font-medium">{t.address}</th>
                <th className="px-4 py-3 font-medium">{t.changed}</th>
                <th className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">{t.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const notesOpen = openNotes === item.id;
                return (
                  <Fragment key={item.id}>
                    <tr className={notesOpen ? "" : "border-b border-vtk-blue/5 last:border-0"}>
                      <td className="truncate px-4 py-3 font-medium text-vtk-ink" title={item.name}>
                        {item.name}
                      </td>
                      <td className="truncate px-4 py-3 text-zinc-600" title={item.username ?? undefined}>
                        {item.username || "\u2014"}
                      </td>
                      <td className="truncate px-4 py-3 text-zinc-600" title={item.uri ?? undefined}>
                        {item.uri || "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{item.changedLabel || "\u2014"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <CopyButton
                            label={t.copyUsername}
                            copiedLabel={t.copied}
                            srSuffix={item.name}
                            disabled={!item.username}
                            disabledMessage={t.noUsername}
                            resolve={async () => item.username}
                            nl={nl}
                          >
                            <UserIcon />
                          </CopyButton>
                          <CopyButton
                            label={t.copyPassword}
                            copiedLabel={t.copied}
                            srSuffix={item.name}
                            resolve={async () => {
                              const result = await revealVaultItemAction(vaultPostId, item.id);
                              return result.ok ? result.password : null;
                            }}
                            nl={nl}
                          >
                            <KeyIcon />
                          </CopyButton>
                          {/* De notitie zelf is het label, dus hoveren toont ze
                              meteen (IconButton maakt van `label` de tooltip).
                              `srLabel` houdt de knop leesbaar voor wie niet kan
                              hoveren; klikken klapt de notitie eronder open. */}
                          <IconButton
                            label={notesOpen ? t.infoHide : (item.notes ?? t.info)}
                            srLabel={`${notesOpen ? t.infoHide : t.info}: ${item.name}`}
                            aria-expanded={notesOpen}
                            disabled={!item.notes}
                            className={notesOpen ? "border-vtk-blue/40 bg-vtk-blue-soft" : undefined}
                            onClick={() => setOpenNotes(notesOpen ? null : item.id)}
                          >
                            <InfoIcon />
                          </IconButton>
                          <IconButton
                            label={t.edit}
                            srLabel={`${t.edit}: ${item.name}`}
                            onClick={() => {
                              setEditing(item);
                              setAdding(false);
                            }}
                          >
                            <PencilIcon />
                          </IconButton>
                          <DeleteIconButton
                            label={t.remove}
                            srLabel={`${t.remove}: ${item.name}`}
                            action={deleteVaultItemAction}
                            fields={{ vaultPostId, itemId: item.id, name: item.name }}
                            title={nl ? "Wachtwoord verwijderen?" : "Delete password?"}
                            description={
                              nl
                                ? `"${item.name}" verdwijnt uit de kluis van ${postName} en dus meteen bij iedereen in deze post, ook in hun browser-extensie en op hun telefoon. Wachtwoorden van andere posten blijven ongewijzigd. Dit kan niet ongedaan gemaakt worden.`
                                : `"${item.name}" is removed from the ${postName} vault and therefore immediately from everyone in this post, including their browser extension and phone. Passwords of other posts are unaffected. This cannot be undone.`
                            }
                            confirmLabel={t.remove}
                            cancelLabel={t.cancel}
                            successMessage={nl ? "Wachtwoord verwijderd." : "Password deleted."}
                          />
                        </div>
                      </td>
                    </tr>
                    {/* De notitie komt als eigen rij eronder en niet als zwevende
                        tooltip: die zou door de `overflow-x-auto` hierboven
                        afgeknipt worden. Zo werkt ze ook op een telefoon, waar
                        hoveren niet bestaat. */}
                    {notesOpen && item.notes && (
                      <tr className="border-b border-vtk-blue/5 last:border-0">
                        <td colSpan={5} className="px-4 pb-3 text-sm text-zinc-600">
                          <p className="whitespace-pre-line rounded-xl bg-vtk-blue-soft/50 px-3 py-2">
                            {item.notes}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Kopieerknop voor één veld.
 *
 * De waarde komt uit `resolve`, zodat de gebruikersnaam (die al in de lijst
 * staat) meteen gekopieerd wordt en het wachtwoord pas bij de klik opgehaald
 * wordt. Zo staat er niet bij elke paginaweergave een volledige postkluis in de
 * HTML, en levert het logboek een bruikbaar antwoord op "wie heeft dit
 * opgevraagd".
 *
 * Het geslaagde kopiëren blijft als vinkje in het icoon zelf zitten, niet enkel
 * in de tooltip (CLAUDE.md).
 */
function CopyButton({
  label,
  copiedLabel,
  srSuffix,
  resolve,
  nl,
  disabled = false,
  disabledMessage,
  children,
}: {
  label: string;
  copiedLabel: string;
  srSuffix: string;
  resolve: () => Promise<string | null>;
  nl: boolean;
  disabled?: boolean;
  disabledMessage?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function fail(message: string) {
    showToast({ message, variant: "error", duration: 0 });
  }

  function onCopy() {
    if (disabled) {
      if (disabledMessage) showToast({ message: disabledMessage, variant: "info" });
      return;
    }
    startTransition(async () => {
      let value: string | null = null;
      try {
        value = await resolve();
      } catch {
        value = null;
      }
      if (!value) {
        fail(nl ? "Kon de waarde niet ophalen. Probeer het opnieuw." : "Could not fetch the value. Please try again.");
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Een browser zonder klembordtoegang (of een pagina zonder https) mag
        // niet stil falen: dan weet de gebruiker niet of er iets gekopieerd is.
        fail(
          nl
            ? "Je browser gaf geen toegang tot het klembord."
            : "Your browser did not allow clipboard access.",
        );
      }
    });
  }

  return (
    <IconButton
      label={copied ? copiedLabel : label}
      srLabel={`${copied ? copiedLabel : label}: ${srSuffix}`}
      onClick={onCopy}
      disabled={pending || disabled}
      className={copied ? "border-emerald-300 bg-emerald-50 text-emerald-700" : undefined}
    >
      {copied ? <CheckIcon /> : children}
    </IconButton>
  );
}

function ItemForm({
  nl,
  vaultPostId,
  item,
  onDone,
}: {
  nl: boolean;
  vaultPostId: string;
  item: ItemRow | null;
  onDone: () => void;
}) {
  const t = nl
    ? {
        name: "Naam",
        username: "Gebruikersnaam",
        password: "Wachtwoord",
        uri: "Adres",
        uriHint: "Een pad op deze site (/theokot) of een volledig adres (https://...).",
        notes: "Notities",
        save: "Opslaan",
        saving: "Bezig met opslaan...",
        saved: "Wachtwoord opgeslagen.",
        cancel: "Annuleren",
        passwordHintEdit: "Laat leeg om het huidige wachtwoord te behouden.",
      }
    : {
        name: "Name",
        username: "Username",
        password: "Password",
        uri: "Address",
        uriHint: "A path on this site (/theokot) or a full address (https://...).",
        notes: "Notes",
        save: "Save",
        saving: "Saving...",
        saved: "Password saved.",
        cancel: "Cancel",
        passwordHintEdit: "Leave empty to keep the current password.",
      };

  const errorMessages = nl
    ? {
        INVALID_INPUT: "Niet opgeslagen: kijk de ingevulde velden na.",
        INVALID_URL:
          "Niet opgeslagen: een adres moet een pad op deze site zijn (/theokot) of een volledig adres (https://...).",
        NOT_CONFIGURED: "Niet opgeslagen: de wachtwoordkluis is nog niet ingesteld. Vraag het aan IT.",
        NOT_SYNCED:
          "Niet opgeslagen: deze post is nog niet gesynchroniseerd met de kluis. Probeer het over enkele minuten opnieuw.",
        FORBIDDEN: "Niet opgeslagen: je hebt geen toegang tot de kluis van deze post.",
        ITEM_GONE: "Niet opgeslagen: dit wachtwoord bestaat niet meer; iemand heeft het ondertussen verwijderd.",
        VAULT_UNREACHABLE: "Niet opgeslagen: de wachtwoordkluis is onbereikbaar.",
      }
    : {
        INVALID_INPUT: "Not saved: please check the fields you entered.",
        INVALID_URL:
          "Not saved: an address must be a path on this site (/theokot) or a full address (https://...).",
        NOT_CONFIGURED: "Not saved: the password vault is not set up yet. Ask IT.",
        NOT_SYNCED:
          "Not saved: this post has not been synchronised with the vault yet. Try again in a few minutes.",
        FORBIDDEN: "Not saved: you do not have access to this post's vault.",
        ITEM_GONE: "Not saved: this password no longer exists; someone deleted it in the meantime.",
        VAULT_UNREACHABLE: "Not saved: the password vault is unreachable.",
      };

  return (
    <div className="rounded-2xl border border-vtk-blue/15 bg-white p-5">
      <SaveForm
        action={saveVaultItemAction}
        submitLabel={t.save}
        savingLabel={t.saving}
        savedMessage={t.saved}
        errorMessages={errorMessages}
        fallbackErrorMessage={
          nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."
        }
        onSuccess={onDone}
        className="space-y-4"
      >
        <input type="hidden" name="vaultPostId" value={vaultPostId} />
        {item && <input type="hidden" name="itemId" value={item.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vault-name">{t.name}</Label>
            <Input id="vault-name" name="name" required defaultValue={item?.name ?? ""} />
          </div>
          <div>
            <Label htmlFor="vault-username">{t.username}</Label>
            <Input id="vault-username" name="username" defaultValue={item?.username ?? ""} />
          </div>
          <div>
            <Label htmlFor="vault-password">{t.password}</Label>
            <Input id="vault-password" name="password" type="password" autoComplete="new-password" />
            {item && <p className="mt-1 text-xs text-zinc-500">{t.passwordHintEdit}</p>}
          </div>
          <div>
            <Label htmlFor="vault-uri">{t.uri}</Label>
            {/* Bewust geen type="url": een pad op deze site is geldig en de
                browser zou dat weigeren voor de server het ziet (CLAUDE.md). */}
            <Input id="vault-uri" name="uri" defaultValue={item?.uri ?? ""} />
            <p className="mt-1 text-xs text-zinc-500">{t.uriHint}</p>
          </div>
        </div>

        <div>
          <Label htmlFor="vault-notes">{t.notes}</Label>
          <Textarea id="vault-notes" name="notes" rows={3} defaultValue={item?.notes ?? ""} />
        </div>

        <Button type="button" variant="ghost" onClick={onDone}>
          {t.cancel}
        </Button>
      </SaveForm>
    </div>
  );
}
