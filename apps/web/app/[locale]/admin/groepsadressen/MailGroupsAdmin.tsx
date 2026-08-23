"use client";

import Link from "next/link";
import { Input, Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import {
  addExtraAction,
  addSourceAction,
  deleteMailGroupAction,
  removeExtraAction,
  removeSourceAction,
  saveMailGroupAction,
  syncMailGroupsAction,
} from "./actions";

/** Eén groep in de bronkeuzelijst: "Posten", "Werkgroepen" of een kiesploeg. */
export type SourceGroup = {
  label: string;
  options: { value: string; label: string }[];
};

export type MailGroupRow = {
  id: string;
  email: string;
  name: string;
  description: string | null;
  enabled: boolean;
  allowExternalSenders: boolean;
  existsInGoogle: boolean;
  lastSyncLabel: string | null;
  lastError: string | null;
  sources: { id: string; onlyLead: boolean; name: string }[];
  extras: { id: string; email: string; kind: "INCLUDE" | "EXCLUDE"; note: string | null }[];
  /** Door ons berekend, niet uit Google gelezen. */
  memberCount: number;
  /** Leden die erin horen maar nog geen gekoppeld @vtk.be-adres hebben. */
  unlinked: string[];
};

export function MailGroupsAdmin({
  nl,
  rows,
  sourceOptions,
  configured,
  domain,
  linkedCount,
  unlinkedInPosts,
  koppelingenHref,
}: {
  nl: boolean;
  rows: MailGroupRow[];
  sourceOptions: SourceGroup[];
  configured: boolean;
  domain: string | null;
  linkedCount: number;
  unlinkedInPosts: number;
  koppelingenHref: string;
}) {
  const t = nl
    ? {
        title: "Groepsadressen",
        intro:
          "De eigen adressen van de kring in Google Workspace. Een adres beschrijft wie erin hoort (posten plus losse adressen); de leden worden bij elke synchronisatie herberekend uit de posten van dit werkingsjaar. Dit staat los van de mailinglijsten voor studenten.",
        notConfigured:
          "Google Workspace is nog niet ingesteld (Admin > IT). Je kan de lijsten hier al opbouwen; er wordt nog niets naar Google geschreven.",
        sync: "Nu synchroniseren",
        syncing: "Bezig met synchroniseren...",
        synced: "Synchronisatie afgerond.",
        links: "Accounts koppelen",
        linkStatus: (linked: number, missing: number) =>
          `${linked} leden gekoppeld aan een @vtk.be-account; ${missing} leden met een post dit jaar nog niet.`,
        address: "Adres",
        members: "Leden",
        sources: "Bronnen",
        lastSync: "Laatste sync",
        never: "nog niet",
        notInGoogle: "nog niet in Google",
        edit: "Bewerken",
        settings: "Instellingen",
        name: "Naam",
        description: "Omschrijving",
        externalSenders: "Mail van buiten vtk.be toelaten",
        externalHelp:
          "Aan voor elk adres waar iemand van buiten naar kan mailen. Staat dit uit, dan weigert Google mail van externe afzenders.",
        save: "Opslaan",
        saving: "Bezig met opslaan...",
        saved: "Opgeslagen.",
        addSource: "Bron toevoegen",
        onlyLead: "Enkel de verantwoordelijke",
        add: "Toevoegen",
        adding: "Bezig met toevoegen...",
        added: "Toegevoegd.",
        extras: "Losse adressen",
        extrasHelp:
          "Een adres dat er sowieso bij hoort, of net niet. Een uitsluiting wint van de posten.",
        include: "Erbij",
        exclude: "Eruit",
        note: "Notitie",
        remove: "Verwijderen",
        unlinkedTitle: (n: number) =>
          `${n} ${n === 1 ? "lid zit" : "leden zitten"} in een bronpost maar heeft nog geen gekoppeld @vtk.be-adres`,
        unlinkedHelp:
          "Zij staan niet in de groep. Koppel hun account, of voeg hun adres hieronder toe als los adres.",
        newTitle: "Nieuw groepsadres",
        newHelp:
          "Maak eerst het adres aan, voeg daarna de posten toe waaruit de leden komen.",
        create: "Aanmaken",
        creating: "Bezig met aanmaken...",
        created: "Groepsadres aangemaakt.",
        deleteTitle: "Groepsadres loskoppelen?",
        deleteDescription: (email: string) =>
          `De regel voor ${email} verdwijnt hier, met haar bronnen en losse adressen. De groep in Google blijft bestaan met haar huidige leden en haar archief; wij beheren ze enkel niet meer.`,
        deleteConfirm: "Loskoppelen",
        cancel: "Annuleren",
        deleted: "Groepsadres losgekoppeld.",
        removeSourceTitle: "Bron verwijderen?",
        removeSourceDescription: (name: string, email: string) =>
          `De leden van ${name} vallen bij de volgende synchronisatie uit ${email}. Andere bronnen blijven.`,
        removeExtraTitle: "Adres verwijderen?",
        removeExtraDescription: (email: string) =>
          `${email} verdwijnt bij de volgende synchronisatie uit deze lijst.`,
        empty: "Nog geen groepsadressen.",
      }
    : {
        title: "Group addresses",
        intro:
          "The association's own addresses in Google Workspace. An address describes who belongs in it (posts plus loose addresses); members are recalculated from this working year's posts on every synchronisation. This is separate from the student mailing lists.",
        notConfigured:
          "Google Workspace is not set up yet (Admin > IT). You can already build the lists here; nothing is written to Google yet.",
        sync: "Synchronise now",
        syncing: "Synchronising...",
        synced: "Synchronisation finished.",
        links: "Link accounts",
        linkStatus: (linked: number, missing: number) =>
          `${linked} members linked to a @vtk.be account; ${missing} members with a post this year are not.`,
        address: "Address",
        members: "Members",
        sources: "Sources",
        lastSync: "Last sync",
        never: "not yet",
        notInGoogle: "not in Google yet",
        edit: "Edit",
        settings: "Settings",
        name: "Name",
        description: "Description",
        externalSenders: "Allow mail from outside vtk.be",
        externalHelp:
          "On for every address people outside can mail. With this off, Google refuses external senders.",
        save: "Save",
        saving: "Saving...",
        saved: "Saved.",
        addSource: "Add source",
        onlyLead: "Only the lead",
        add: "Add",
        adding: "Adding...",
        added: "Added.",
        extras: "Loose addresses",
        extrasHelp:
          "An address that belongs in it regardless, or exactly not. An exclusion beats the posts.",
        include: "Include",
        exclude: "Exclude",
        note: "Note",
        remove: "Remove",
        unlinkedTitle: (n: number) =>
          `${n} ${n === 1 ? "member is" : "members are"} in a source post without a linked @vtk.be address`,
        unlinkedHelp:
          "They are not in the group. Link their account, or add their address below as a loose address.",
        newTitle: "New group address",
        newHelp: "Create the address first, then add the posts the members come from.",
        create: "Create",
        creating: "Creating...",
        created: "Group address created.",
        deleteTitle: "Unlink group address?",
        deleteDescription: (email: string) =>
          `The rule for ${email} disappears here, with its sources and loose addresses. The group in Google keeps existing with its current members and its archive; we simply stop managing it.`,
        deleteConfirm: "Unlink",
        cancel: "Cancel",
        deleted: "Group address unlinked.",
        removeSourceTitle: "Remove source?",
        removeSourceDescription: (name: string, email: string) =>
          `The members of ${name} drop out of ${email} on the next synchronisation. Other sources stay.`,
        removeExtraTitle: "Remove address?",
        removeExtraDescription: (email: string) =>
          `${email} drops out of this list on the next synchronisation.`,
        empty: "No group addresses yet.",
      };

  const errorMessages = nl
    ? {
        NOT_CONFIGURED: "Google Workspace is nog niet ingesteld; vul eerst de configuratie in bij Admin > IT.",
        SYNC_PARTIAL:
          "Niet alles is gelukt. Kijk de foutmelding per adres na; de volgende ronde probeert het opnieuw.",
        DUPLICATE_EMAIL: "Niet opgeslagen: dat adres bestaat al.",
        DUPLICATE_SOURCE: "Niet toegevoegd: die post staat er al in.",
        INVALID_EMAIL: "Niet toegevoegd: dat is geen geldig mailadres.",
        INVALID_INPUT: "Niet opgeslagen: controleer de velden.",
      }
    : {
        NOT_CONFIGURED: "Google Workspace is not set up yet; fill in the configuration under Admin > IT first.",
        SYNC_PARTIAL:
          "Not everything succeeded. Check the error per address; the next round will try again.",
        DUPLICATE_EMAIL: "Not saved: that address already exists.",
        DUPLICATE_SOURCE: "Not added: that post is already a source.",
        INVALID_EMAIL: "Not added: that is not a valid email address.",
        INVALID_INPUT: "Not saved: check the fields.",
      };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-vtk-ink">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">{t.intro}</p>
        {!configured && (
          <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t.notConfigured}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SaveForm
          action={syncMailGroupsAction}
          submitLabel={t.sync}
          savingLabel={t.syncing}
          savedMessage={t.synced}
          errorMessages={errorMessages}
          fallbackErrorMessage={nl ? "Synchroniseren is mislukt." : "Synchronisation failed."}
        />
        <Link href={koppelingenHref} className="vtk-link text-sm">
          {t.links}
        </Link>
        <span className="text-sm text-zinc-500">{t.linkStatus(linkedCount, unlinkedInPosts)}</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.empty}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <details
              key={row.id}
              className="rounded-2xl border border-vtk-blue/15 bg-white px-4 py-3"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium text-vtk-ink">{row.email}</span>
                  <span className="text-sm text-zinc-500">
                    {row.memberCount} {t.members.toLowerCase()}
                    {row.sources.length > 0 && (
                      <> · {row.sources.map((s) => s.name).join(", ")}</>
                    )}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {t.lastSync}: {row.lastSyncLabel ?? t.never}
                    {!row.existsInGoogle && <> · {t.notInGoogle}</>}
                  </span>
                </div>
                {row.lastError && (
                  <span className="mt-1 block text-xs text-red-700">{row.lastError}</span>
                )}
              </summary>

              <div className="mt-4 space-y-6 border-t border-vtk-blue/10 pt-4">
                {row.unlinked.length > 0 && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-medium">{t.unlinkedTitle(row.unlinked.length)}</p>
                    <p className="mt-1">{t.unlinkedHelp}</p>
                    <p className="mt-1 text-xs">{row.unlinked.join(", ")}</p>
                  </div>
                )}

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-vtk-ink">{t.settings}</h3>
                  <SaveForm
                    action={saveMailGroupAction}
                    submitLabel={t.save}
                    savingLabel={t.saving}
                    savedMessage={t.saved}
                    errorMessages={errorMessages}
                    fallbackErrorMessage={nl ? "Opslaan is mislukt." : "Saving failed."}
                    resetOnSuccess={false}
                    className="space-y-3"
                  >
                    <input type="hidden" name="id" value={row.id} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label>{t.address}</Label>
                        <Input name="email" defaultValue={row.email} required />
                      </div>
                      <div>
                        <Label>{t.name}</Label>
                        <Input name="name" defaultValue={row.name} required />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>{t.description}</Label>
                        <Input name="description" defaultValue={row.description ?? ""} />
                      </div>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        name="allowExternalSenders"
                        defaultChecked={row.allowExternalSenders}
                        className="mt-1"
                      />
                      <span>
                        {t.externalSenders}
                        <span className="block text-xs text-zinc-500">{t.externalHelp}</span>
                      </span>
                    </label>
                  </SaveForm>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-vtk-ink">{t.sources}</h3>
                  {row.sources.length > 0 && (
                    <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15">
                      {row.sources.map((source) => (
                        <li
                          key={source.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span>
                            {source.name}
                            {source.onlyLead && (
                              <span className="ml-2 text-xs text-zinc-500">({t.onlyLead})</span>
                            )}
                          </span>
                          <DeleteIconButton
                            action={removeSourceAction}
                            fields={{ id: source.id }}
                            label={t.remove}
                            srLabel={`${t.remove}: ${source.name}`}
                            title={t.removeSourceTitle}
                            description={t.removeSourceDescription(source.name, row.email)}
                            confirmLabel={t.remove}
                            cancelLabel={t.cancel}
                            successMessage={t.deleted}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  <SaveForm
                    action={addSourceAction}
                    submitLabel={t.add}
                    savingLabel={t.adding}
                    savedMessage={t.added}
                    errorMessages={errorMessages}
                    fallbackErrorMessage={nl ? "Toevoegen is mislukt." : "Adding failed."}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="mailGroupId" value={row.id} />
                    <div className="w-64">
                      <Label>{t.addSource}</Label>
                      <Select name="source" required defaultValue="">
                        <option value="" disabled>
                          ...
                        </option>
                        {sourceOptions.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
                      <input type="checkbox" name="onlyLead" />
                      {t.onlyLead}
                    </label>
                  </SaveForm>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-vtk-ink">{t.extras}</h3>
                  <p className="text-xs text-zinc-500">{t.extrasHelp}</p>
                  {row.extras.length > 0 && (
                    <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15">
                      {row.extras.map((extra) => (
                        <li
                          key={extra.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span>
                            {extra.email}
                            <span
                              className={
                                extra.kind === "EXCLUDE"
                                  ? "ml-2 text-xs text-red-700"
                                  : "ml-2 text-xs text-zinc-500"
                              }
                            >
                              ({extra.kind === "EXCLUDE" ? t.exclude : t.include})
                            </span>
                            {extra.note && (
                              <span className="block text-xs text-zinc-500">{extra.note}</span>
                            )}
                          </span>
                          <DeleteIconButton
                            action={removeExtraAction}
                            fields={{ id: extra.id }}
                            label={t.remove}
                            srLabel={`${t.remove}: ${extra.email}`}
                            title={t.removeExtraTitle}
                            description={t.removeExtraDescription(extra.email)}
                            confirmLabel={t.remove}
                            cancelLabel={t.cancel}
                            successMessage={t.deleted}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  <SaveForm
                    action={addExtraAction}
                    submitLabel={t.add}
                    savingLabel={t.adding}
                    savedMessage={t.added}
                    errorMessages={errorMessages}
                    fallbackErrorMessage={nl ? "Toevoegen is mislukt." : "Adding failed."}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="mailGroupId" value={row.id} />
                    <div className="w-64">
                      <Label>{nl ? "Mailadres" : "Email address"}</Label>
                      <Input name="email" type="email" required />
                    </div>
                    <div className="w-32">
                      <Label>{nl ? "Soort" : "Kind"}</Label>
                      <Select name="kind" defaultValue="INCLUDE">
                        <option value="INCLUDE">{t.include}</option>
                        <option value="EXCLUDE">{t.exclude}</option>
                      </Select>
                    </div>
                    <div className="w-48">
                      <Label>{t.note}</Label>
                      <Input name="note" />
                    </div>
                  </SaveForm>
                </section>

                <div className="border-t border-vtk-blue/10 pt-3">
                  <DeleteButton
                    action={deleteMailGroupAction}
                    fields={{ id: row.id }}
                    title={t.deleteTitle}
                    description={t.deleteDescription(row.email)}
                    confirmLabel={t.deleteConfirm}
                    cancelLabel={t.cancel}
                    successMessage={t.deleted}
                  >
                    {t.deleteConfirm}
                  </DeleteButton>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      <section className="space-y-3 rounded-2xl border border-vtk-blue/15 bg-white px-4 py-4">
        <div>
          <h2 className="text-base font-semibold text-vtk-ink">{t.newTitle}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t.newHelp}</p>
        </div>
        <SaveForm
          action={saveMailGroupAction}
          submitLabel={t.create}
          savingLabel={t.creating}
          savedMessage={t.created}
          errorMessages={errorMessages}
          fallbackErrorMessage={nl ? "Aanmaken is mislukt." : "Creating failed."}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.address}</Label>
              <Input
                name="email"
                type="email"
                placeholder={domain ? `activiteiten@${domain}` : "activiteiten@vtk.be"}
                required
              />
            </div>
            <div>
              <Label>{t.name}</Label>
              <Input name="name" placeholder={nl ? "Activiteiten" : "Activities"} required />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.description}</Label>
              <Input name="description" />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="allowExternalSenders" defaultChecked className="mt-1" />
            <span>
              {t.externalSenders}
              <span className="block text-xs text-zinc-500">{t.externalHelp}</span>
            </span>
          </label>
        </SaveForm>
      </section>
    </div>
  );
}
