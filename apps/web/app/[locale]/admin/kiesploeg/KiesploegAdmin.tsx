"use client";

import Link from "next/link";
import { Input, Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { AddKiesploegMember } from "./AddKiesploegMember";
import {
  addKiesploegPostAction,
  createKiesploegListsAction,
  deleteKiesploegAction,
  removeKiesploegMemberAction,
  removeKiesploegPostAction,
  saveKiesploegAction,
  saveKiesploegMemberAction,
} from "./actions";

export type KiesploegRow = {
  id: string;
  code: string;
  workingYear: number;
  formalName: string;
  informalName: string | null;
  accountTemplate: string;
  aliasTemplate: string;
  listTemplate: string;
  active: boolean;
  current: boolean;
  posts: { id: string; code: string; name: string; isG5: boolean; listEmail: string }[];
  members: {
    id: string;
    userId: string;
    name: string;
    postId: string | null;
    role: "MEMBER" | "LEAD";
    mailboxActive: boolean;
    forwardTo: string | null;
    googleEmail: string | null;
    accountState: "RESTRICTED" | "FULL" | null;
    aliasPreview: string | null;
  }[];
};

export function KiesploegAdmin({
  nl,
  rows,
  domain,
  configured,
  nextWorkingYear,
  accountsHref,
}: {
  nl: boolean;
  rows: KiesploegRow[];
  domain: string;
  configured: boolean;
  nextWorkingYear: number;
  accountsHref: string;
}) {
  const t = nl
    ? {
        title: "Kiesploeg",
        intro:
          "De opkomende ploeg met haar eigen posten en adressen. Haar leden krijgen een beperkt account (mailbox stuurt door, verzenden via de kiesploegalias) en worden op 15 juli van hun werkingsjaar vanzelf volwaardig, op voorwaarde dat ze dan in een post zitten.",
        notConfigured:
          "Google Workspace is nog niet ingesteld (Admin > IT). Je kan de ploeg hier al klaarzetten; accounts aanmaken kan pas daarna.",
        settings: "Instellingen",
        code: "Code",
        codeHelp: "Komt in elk adres terug, bv. 2027.",
        workingYear: "Werkingsjaar",
        workingYearHelp: "Het jaar waarin ze aantreedt; 2027 is 27-28.",
        formalName: "Formele naam",
        informalName: "Informele naam",
        informalHelp: "Mag leeg blijven tot de ploeg ze kiest; de adressen hangen aan de code.",
        active: "Actief",
        activeHelp:
          "Zet uit wanneer de ploeg afgehandeld is. Haar lijsten blijven bestaan, maar de accountstaat van haar leden wordt niet meer uit deze ploeg afgeleid.",
        templates: "Adressjablonen",
        templatesHelp:
          "Met {code}, {voornaam}, {achternaam} en {post}. Accenten en spaties worden weggelaten.",
        accountTemplate: "Account",
        aliasTemplate: "Alias",
        listTemplate: "Lijst",
        save: "Opslaan",
        saving: "Bezig met opslaan...",
        saved: "Opgeslagen.",
        posts: "Posten van de ploeg",
        postsHelp:
          "Dit zijn niet de praesidiumposten. De post die je als g5 aanduidt, wordt aan elke lijst van deze ploeg toegevoegd.",
        postCode: "Code",
        postName: "Naam",
        isG5: "Dit is de g5",
        add: "Toevoegen",
        adding: "Bezig met toevoegen...",
        added: "Toegevoegd.",
        members: "Leden",
        membersHelp:
          "In het begin ken je enkel de g5; laat de post dan leeg. Vul hem in zodra de verdeling er is.",
        post: "Post",
        noPost: "(nog geen post)",
        role: "Rol",
        member: "Lid",
        lead: "Verantwoordelijke",
        mailboxActive: "Mag nu al mailen",
        mailboxHelp: "Voor wie zijn eigen mailbox nodig heeft, bv. marketing.",
        forwardTo: "Doorsturen naar",
        account: "Account",
        noAccount: "nog geen account",
        restricted: "beperkt",
        full: "volwaardig",
        alias: "Alias",
        remove: "Verwijderen",
        cancel: "Annuleren",
        removeMemberTitle: "Lid uit de kiesploeg halen?",
        removeMemberDescription: (name: string) =>
          `${name} valt bij de volgende synchronisatie uit de lijsten van deze ploeg. Het Google-account zelf blijft bestaan en wordt niet afgesloten.`,
        removePostTitle: "Post verwijderen?",
        removePostDescription: (name: string) =>
          `De post ${name} verdwijnt, en de leden die erin zaten houden geen post meer. De lijst die erbij hoort blijft bestaan; die verwijder je zelf bij Groepsadressen.`,
        removed: "Verwijderd.",
        lists: "Standaardlijsten aanmaken",
        listsHelp:
          "Maakt per post een groepsadres met die post en de g5 als bron. Bestaande adressen worden overgeslagen, dus je kan dit gerust twee keer doen.",
        creatingLists: "Bezig met aanmaken...",
        listsCreated: "Lijsten aangemaakt.",
        accounts: "Accounts aanmaken",
        deleteTitle: "Kiesploeg verwijderen?",
        deleteDescription: (name: string) =>
          `${name} verdwijnt met haar posten en ledenlijst. De Google-accounts van die mensen en de groepsadressen blijven bestaan.`,
        deleteConfirm: "Verwijderen",
        newTitle: "Nieuwe kiesploeg",
        create: "Aanmaken",
        creating: "Bezig met aanmaken...",
        created: "Kiesploeg aangemaakt.",
        empty: "Nog geen kiesploeg.",
        takesOffice: (year: number) => `treedt aan op 15 juli ${year}`,
      }
    : {
        title: "Kiesploeg",
        intro:
          "The incoming team with its own posts and addresses. Its members get a restricted account (mailbox forwards, sending via the kiesploeg alias) and become full members automatically on 15 July of their working year, provided they hold a post by then.",
        notConfigured:
          "Google Workspace is not set up yet (Admin > IT). You can prepare the team here; creating accounts needs that first.",
        settings: "Settings",
        code: "Code",
        codeHelp: "Appears in every address, e.g. 2027.",
        workingYear: "Working year",
        workingYearHelp: "The year they take office; 2027 is 27-28.",
        formalName: "Formal name",
        informalName: "Informal name",
        informalHelp: "May stay empty until they pick one; addresses hang on the code.",
        active: "Active",
        activeHelp:
          "Turn off once the team is done. Its lists keep existing, but the account state of its members is no longer derived from this team.",
        templates: "Address templates",
        templatesHelp:
          "With {code}, {voornaam}, {achternaam} and {post}. Accents and spaces are dropped.",
        accountTemplate: "Account",
        aliasTemplate: "Alias",
        listTemplate: "List",
        save: "Save",
        saving: "Saving...",
        saved: "Saved.",
        posts: "Posts of the team",
        postsHelp:
          "These are not the praesidium posts. The post you mark as g5 is added to every list of this team.",
        postCode: "Code",
        postName: "Name",
        isG5: "This is the g5",
        add: "Add",
        adding: "Adding...",
        added: "Added.",
        members: "Members",
        membersHelp:
          "At first only the g5 is known; leave the post empty then. Fill it in once the division exists.",
        post: "Post",
        noPost: "(no post yet)",
        role: "Role",
        member: "Member",
        lead: "Lead",
        mailboxActive: "May send already",
        mailboxHelp: "For whoever needs their own mailbox, e.g. marketing.",
        forwardTo: "Forward to",
        account: "Account",
        noAccount: "no account yet",
        restricted: "restricted",
        full: "full",
        alias: "Alias",
        remove: "Remove",
        cancel: "Cancel",
        removeMemberTitle: "Remove member from the team?",
        removeMemberDescription: (name: string) =>
          `${name} drops out of this team's lists on the next synchronisation. The Google account itself keeps existing and is not suspended.`,
        removePostTitle: "Remove post?",
        removePostDescription: (name: string) =>
          `The post ${name} disappears and its members hold no post any more. The matching list keeps existing; remove it yourself under Group addresses.`,
        removed: "Removed.",
        lists: "Create standard lists",
        listsHelp:
          "Creates one group address per post, with that post and the g5 as sources. Existing addresses are skipped, so running this twice is safe.",
        creatingLists: "Creating...",
        listsCreated: "Lists created.",
        accounts: "Create accounts",
        deleteTitle: "Delete kiesploeg?",
        deleteDescription: (name: string) =>
          `${name} disappears with its posts and member list. The Google accounts of those people and the group addresses keep existing.`,
        deleteConfirm: "Delete",
        newTitle: "New kiesploeg",
        create: "Create",
        creating: "Creating...",
        created: "Kiesploeg created.",
        empty: "No kiesploeg yet.",
        takesOffice: (year: number) => `takes office on 15 July ${year}`,
      };

  const errorMessages = nl
    ? {
        INVALID_INPUT: "Niet opgeslagen: controleer de velden.",
        DUPLICATE_CODE: "Niet opgeslagen: die code bestaat al.",
        INVALID_EMAIL: "Niet opgeslagen: dat is geen geldig mailadres.",
        NOT_CONFIGURED: "Google Workspace is nog niet ingesteld (Admin > IT).",
      }
    : {
        INVALID_INPUT: "Not saved: check the fields.",
        DUPLICATE_CODE: "Not saved: that code already exists.",
        INVALID_EMAIL: "Not saved: that is not a valid email address.",
        NOT_CONFIGURED: "Google Workspace is not set up yet (Admin > IT).",
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

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.empty}</p>
      ) : (
        rows.map((row) => (
          <details
            key={row.id}
            open={row.current}
            className="rounded-2xl border border-vtk-blue/15 bg-white px-4 py-3"
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium text-vtk-ink">
                  {row.formalName}
                  {row.informalName && (
                    <span className="ml-2 text-sm text-zinc-500">{row.informalName}</span>
                  )}
                </span>
                <span className="text-sm text-zinc-500">
                  {row.code} · {row.members.length} {t.members.toLowerCase()} ·{" "}
                  {t.takesOffice(row.workingYear)}
                </span>
              </div>
            </summary>

            <div className="mt-4 space-y-6 border-t border-vtk-blue/10 pt-4">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-vtk-ink">{t.settings}</h3>
                <SaveForm
                  action={saveKiesploegAction}
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
                      <Label>{t.code}</Label>
                      <Input name="code" defaultValue={row.code} required />
                      <p className="mt-1 text-xs text-zinc-500">{t.codeHelp}</p>
                    </div>
                    <div>
                      <Label>{t.workingYear}</Label>
                      <Input
                        name="workingYear"
                        type="number"
                        defaultValue={row.workingYear}
                        required
                      />
                      <p className="mt-1 text-xs text-zinc-500">{t.workingYearHelp}</p>
                    </div>
                    <div>
                      <Label>{t.formalName}</Label>
                      <Input name="formalName" defaultValue={row.formalName} required />
                    </div>
                    <div>
                      <Label>{t.informalName}</Label>
                      <Input name="informalName" defaultValue={row.informalName ?? ""} />
                      <p className="mt-1 text-xs text-zinc-500">{t.informalHelp}</p>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-zinc-700 sm:col-span-2">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={row.active}
                        className="mt-1"
                      />
                      <span>
                        {t.active}
                        <span className="block text-xs text-zinc-500">{t.activeHelp}</span>
                      </span>
                    </label>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {t.templates}
                    </h4>
                    <p className="mb-2 text-xs text-zinc-500">{t.templatesHelp}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <Label>{t.accountTemplate}</Label>
                        <Input name="accountTemplate" defaultValue={row.accountTemplate} required />
                      </div>
                      <div>
                        <Label>{t.aliasTemplate}</Label>
                        <Input name="aliasTemplate" defaultValue={row.aliasTemplate} required />
                      </div>
                      <div>
                        <Label>{t.listTemplate}</Label>
                        <Input name="listTemplate" defaultValue={row.listTemplate} required />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">@{domain}</p>
                  </div>
                </SaveForm>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-vtk-ink">{t.posts}</h3>
                <p className="text-xs text-zinc-500">{t.postsHelp}</p>
                {row.posts.length > 0 && (
                  <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15">
                    {row.posts.map((post) => (
                      <li
                        key={post.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span>
                          {post.name}
                          {post.isG5 && (
                            <span className="ml-2 rounded-full bg-vtk-yellow/30 px-2 py-0.5 text-xs">
                              g5
                            </span>
                          )}
                          <span className="block text-xs text-zinc-500">{post.listEmail}</span>
                        </span>
                        <DeleteIconButton
                          action={removeKiesploegPostAction}
                          fields={{ id: post.id }}
                          label={t.remove}
                          srLabel={`${t.remove}: ${post.name}`}
                          title={t.removePostTitle}
                          description={t.removePostDescription(post.name)}
                          confirmLabel={t.remove}
                          cancelLabel={t.cancel}
                          successMessage={t.removed}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <SaveForm
                  action={addKiesploegPostAction}
                  submitLabel={t.add}
                  savingLabel={t.adding}
                  savedMessage={t.added}
                  errorMessages={errorMessages}
                  fallbackErrorMessage={nl ? "Toevoegen is mislukt." : "Adding failed."}
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="kiesploegId" value={row.id} />
                  <div className="w-40">
                    <Label>{t.postCode}</Label>
                    <Input name="code" placeholder="marketing" required />
                  </div>
                  <div className="w-52">
                    <Label>{t.postName}</Label>
                    <Input name="name" placeholder="Marketing" required />
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
                    <input type="checkbox" name="isG5" />
                    {t.isG5}
                  </label>
                </SaveForm>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-vtk-ink">{t.members}</h3>
                <p className="text-xs text-zinc-500">{t.membersHelp}</p>

                {row.members.length > 0 && (
                  <ul className="space-y-2">
                    {row.members.map((member) => (
                      <li
                        key={member.id}
                        className="rounded-xl border border-vtk-blue/15 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-vtk-ink">{member.name}</span>
                          <span className="text-xs text-zinc-500">
                            {member.googleEmail ?? t.noAccount}
                            {member.accountState && (
                              <>
                                {" · "}
                                {member.accountState === "FULL" ? t.full : t.restricted}
                              </>
                            )}
                            {member.aliasPreview && !member.googleEmail && (
                              <>
                                {" · "}
                                {t.alias}: {member.aliasPreview}
                              </>
                            )}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-end gap-3">
                          <SaveForm
                            action={saveKiesploegMemberAction}
                            submitLabel={t.save}
                            savingLabel={t.saving}
                            savedMessage={t.saved}
                            errorMessages={errorMessages}
                            fallbackErrorMessage={nl ? "Opslaan is mislukt." : "Saving failed."}
                            resetOnSuccess={false}
                            className="flex flex-wrap items-end gap-3"
                          >
                            <input type="hidden" name="id" value={member.id} />
                            <div className="w-48">
                              <Label>{t.post}</Label>
                              <Select name="postId" defaultValue={member.postId ?? ""}>
                                <option value="">{t.noPost}</option>
                                {row.posts.map((post) => (
                                  <option key={post.id} value={post.id}>
                                    {post.name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="w-40">
                              <Label>{t.role}</Label>
                              <Select name="role" defaultValue={member.role}>
                                <option value="MEMBER">{t.member}</option>
                                <option value="LEAD">{t.lead}</option>
                              </Select>
                            </div>
                            <div className="w-56">
                              <Label>{t.forwardTo}</Label>
                              <Input
                                name="forwardTo"
                                type="email"
                                defaultValue={member.forwardTo ?? ""}
                              />
                            </div>
                            <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
                              <input
                                type="checkbox"
                                name="mailboxActive"
                                defaultChecked={member.mailboxActive}
                              />
                              <span title={t.mailboxHelp}>{t.mailboxActive}</span>
                            </label>
                          </SaveForm>
                          <div className="pb-1">
                            <DeleteIconButton
                              action={removeKiesploegMemberAction}
                              fields={{ id: member.id }}
                              label={t.remove}
                              srLabel={`${t.remove}: ${member.name}`}
                              title={t.removeMemberTitle}
                              description={t.removeMemberDescription(member.name)}
                              confirmLabel={t.remove}
                              cancelLabel={t.cancel}
                              successMessage={t.removed}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <AddKiesploegMember
                  nl={nl}
                  kiesploegId={row.id}
                  posts={row.posts.map((p) => ({ id: p.id, name: p.name }))}
                />
              </section>

              <section className="flex flex-wrap items-center gap-4 border-t border-vtk-blue/10 pt-4">
                <SaveForm
                  action={createKiesploegListsAction}
                  submitLabel={t.lists}
                  savingLabel={t.creatingLists}
                  savedMessage={t.listsCreated}
                  errorMessages={errorMessages}
                  fallbackErrorMessage={nl ? "Aanmaken is mislukt." : "Creating failed."}
                >
                  <input type="hidden" name="kiesploegId" value={row.id} />
                </SaveForm>
                <p className="max-w-md text-xs text-zinc-500">{t.listsHelp}</p>
                <Link href={`${accountsHref}?bron=kiesploeg:${row.id}`} className="vtk-link text-sm">
                  {t.accounts}
                </Link>
              </section>

              <div className="border-t border-vtk-blue/10 pt-3">
                <DeleteButton
                  action={deleteKiesploegAction}
                  fields={{ id: row.id }}
                  title={t.deleteTitle}
                  description={t.deleteDescription(row.formalName)}
                  confirmLabel={t.deleteConfirm}
                  cancelLabel={t.cancel}
                  successMessage={t.removed}
                >
                  {t.deleteConfirm}
                </DeleteButton>
              </div>
            </div>
          </details>
        ))
      )}

      <section className="space-y-3 rounded-2xl border border-vtk-blue/15 bg-white px-4 py-4">
        <h2 className="text-base font-semibold text-vtk-ink">{t.newTitle}</h2>
        <SaveForm
          action={saveKiesploegAction}
          submitLabel={t.create}
          savingLabel={t.creating}
          savedMessage={t.created}
          errorMessages={errorMessages}
          fallbackErrorMessage={nl ? "Aanmaken is mislukt." : "Creating failed."}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div>
            <Label>{t.code}</Label>
            <Input name="code" placeholder={String(nextWorkingYear)} required />
          </div>
          <div>
            <Label>{t.workingYear}</Label>
            <Input name="workingYear" type="number" defaultValue={nextWorkingYear} required />
          </div>
          <div>
            <Label>{t.formalName}</Label>
            <Input name="formalName" placeholder="Kiesploeg Delta" required />
          </div>
          <div>
            <Label>{t.informalName}</Label>
            <Input name="informalName" />
          </div>
          <input type="hidden" name="accountTemplate" value="{voornaam}.{achternaam}" />
          <input
            type="hidden"
            name="aliasTemplate"
            value="kiesploeg{code}.{voornaam}.{achternaam}"
          />
          <input type="hidden" name="listTemplate" value="{post}.{code}" />
          <input type="hidden" name="active" value="on" />
        </SaveForm>
      </section>
    </div>
  );
}
