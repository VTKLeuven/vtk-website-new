"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, CopyIcon, PencilIcon } from "@/components/ui/icons";
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
        copy: "Wachtwoord kopiëren",
        copied: "Gekopieerd",
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
        copy: "Copy password",
        copied: "Copied",
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
        /* `relative` is verplicht: de `sr-only` koppen hieronder zijn absoluut
           gepositioneerd en ankeren zonder dit op de pagina in plaats van op de
           tabel, waarna een telefoon de hele pagina uitzoomt (zie CLAUDE.md). */
        <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
          <table className="w-full min-w-[40rem] text-sm">
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
              {items.map((item) => (
                <tr key={item.id} className="border-b border-vtk-blue/5 last:border-0">
                  <td className="px-4 py-3 font-medium text-vtk-ink">{item.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{item.username || "—"}</td>
                  <td className="max-w-[16rem] truncate px-4 py-3 text-zinc-600">
                    {item.uri || "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{item.changedLabel || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <CopyPasswordButton
                        nl={nl}
                        vaultPostId={vaultPostId}
                        item={item}
                        labels={{ copy: t.copy, copied: t.copied }}
                      />
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Haalt het wachtwoord pas op wanneer erop geklikt wordt, en houdt de gelukte
 * kopie als vinkje in het icoon zelf vast; niet enkel in de tooltip (CLAUDE.md).
 */
function CopyPasswordButton({
  nl,
  vaultPostId,
  item,
  labels,
}: {
  nl: boolean;
  vaultPostId: string;
  item: ItemRow;
  labels: { copy: string; copied: string };
}) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function onCopy() {
    startTransition(async () => {
      const result = await revealVaultItemAction(vaultPostId, item.id);
      if (!result.ok || !result.password) {
        showToast({
          message: nl
            ? "Wachtwoord kon niet opgehaald worden. Probeer het opnieuw."
            : "Could not fetch the password. Please try again.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(result.password);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Een browser zonder klembordtoegang (of een pagina zonder https) mag
        // niet stil falen: dan weet de gebruiker niet of er iets gekopieerd is.
        showToast({
          message: nl
            ? "Je browser gaf geen toegang tot het klembord."
            : "Your browser did not allow clipboard access.",
          variant: "error",
          duration: 0,
        });
      }
    });
  }

  return (
    <IconButton
      label={copied ? labels.copied : labels.copy}
      srLabel={`${copied ? labels.copied : labels.copy}: ${item.name}`}
      onClick={onCopy}
      disabled={pending}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
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
