"use client";

import Link from "@/components/ui/Link";
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
  restoreKiesploegAccountAction,
  saveKiesploegMemberAction,
} from "./actions";

export type KiesploegFunctionCode = "PRAESES" | "VICE" | "SECRETARIS" | "BEHEER";

const FUNCTIONS: KiesploegFunctionCode[] = ["PRAESES", "VICE", "SECRETARIS", "BEHEER"];

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
  /** Is 15 juli van het werkingsjaar voorbij? */
  tookOffice: boolean;
  /** Wanneer de sync de kiesploegadressen weghaalde, of `null`. */
  transitionedLabel: string | null;
  /** Staat de postverdeling van dat werkingsjaar al in de site? */
  postsEntered: boolean;
  posts: { id: string; code: string; name: string; isG5: boolean; listEmail: string }[];
  members: {
    id: string;
    userId: string;
    name: string;
    postId: string | null;
    role: "MEMBER" | "LEAD";
    function: KiesploegFunctionCode | null;
    sendFromAlias: boolean;
    forwardTo: string | null;
    googleEmail: string | null;
    accountState: "RESTRICTED" | "ALIAS_SENDER" | "FULL" | "SUSPENDED" | null;
    /** Het kiesploegadres dat op het account staat, of `null`. */
    aliasEmail: string | null;
    aliasPreview: string | null;
    aliasRemoved: boolean;
    /** Heeft dit lid een post in het werkingsjaar van de ploeg? */
    hasPostInYear: boolean;
    keepAccount: boolean;
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
          "De opkomende ploeg met haar eigen posten en adressen. Elk lid krijgt voornaam.naam@vtk.be met daarop het kiesploegadres (voornaam.naam.kiesploegepsilon@vtk.be). Vanaf het eigen adres mailt niemand tot de ploeg aantreedt; enkel wie je hieronder aanduidt, mag mailen vanaf het kiesploegadres, de rest ontvangt enkel. Op 15 juli van het werkingsjaar verdwijnen de kiesploegadressen, wordt wie een post heeft volwaardig, en wordt wie geen post kreeg geschorst.",
        notConfigured:
          "Google Workspace is nog niet ingesteld (Admin > IT). Je kan de ploeg hier al klaarzetten; accounts aanmaken kan pas daarna.",
        settings: "Instellingen",
        code: "Code",
        codeHelp: "Komt in elk adres terug, bv. epsilon (epsilon.g5@vtk.be).",
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
          "In het begin ken je enkel de g5; laat de post dan leeg. Vul hem in zodra de verdeling er is. De functie (praeses, vice, secretaris, beheer) staat los van de post: wie Beheer is, ziet en beheert de rekeningen op de post Ploeg.",
        function: "Functie",
        noFunction: "Geen functie",
        functions: {
          PRAESES: "Praeses",
          VICE: "Vice",
          SECRETARIS: "Secretaris",
          BEHEER: "Beheer",
        },
        post: "Post",
        noPost: "(nog geen post)",
        role: "Rol",
        member: "Lid",
        lead: "Verantwoordelijke",
        sending: "Mailen",
        receiveOnly: "Enkel ontvangen",
        fromAlias: "Vanaf kiesploegadres",
        forwardTo: "Doorsturen naar",
        account: "Account",
        noAccount: "nog geen account",
        states: {
          RESTRICTED: "ontvangt enkel",
          ALIAS_SENDER: "mailt vanaf kiesploegadres",
          FULL: "volwaardig",
          SUSPENDED: "geschorst",
        },
        alias: "Kiesploegadres",
        aliasProposal: "voorstel",
        aliasRemoved: "weggehaald",
        restore: "Account terug openzetten",
        restoring: "Bezig...",
        restored: "Account terug opengezet.",
        restoreTitle: "Account terug openzetten?",
        restoreDescription: (name: string) =>
          `${name} kreeg geen post en werd daarom geschorst. Openzetten maakt het account volwaardig (mailen vanaf het eigen adres) en de sync schorst het daarna niet opnieuw. De mailbox en de mail van tijdens de schorsing blijven zoals ze waren.`,
        transitionTitle: "Op 15 juli",
        transitionPending: (year: number, full: number, suspended: number) =>
          `Op 15 juli ${year} verdwijnen de kiesploegadressen. ${full} ${full === 1 ? "lid heeft" : "leden hebben"} dan een post en ${full === 1 ? "wordt" : "worden"} volwaardig; ${suspended} ${suspended === 1 ? "lid wordt" : "leden worden"} geschorst omdat ze geen post hebben in ${year}-${year + 1}.`,
        transitionNoPosts: (year: number) =>
          `De postverdeling van ${year}-${year + 1} staat nog niet in de site (Admin > Posten). Zolang die ontbreekt, schorst de sync niemand.`,
        transitionDone: (when: string) =>
          `Aangetreden: de kiesploegadressen zijn weggehaald op ${when}.`,
        transitionBusy: "Aangetreden: de sync haalt de kiesploegadressen weg.",
        noPostThen: (year: number) => `geen post in ${year}-${year + 1}`,
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
          "The incoming team with its own posts and addresses. Every member gets firstname.lastname@vtk.be carrying the kiesploeg address (firstname.lastname.kiesploegepsilon@vtk.be). Nobody sends from their own address until the team takes office; only those you mark below may send, and only from the kiesploeg address. The rest only receive. On 15 July of the working year the kiesploeg addresses go, whoever holds a post becomes a full member, and whoever got no post is suspended.",
        notConfigured:
          "Google Workspace is not set up yet (Admin > IT). You can prepare the team here; creating accounts needs that first.",
        settings: "Settings",
        code: "Code",
        codeHelp: "Appears in every address, e.g. epsilon (epsilon.g5@vtk.be).",
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
          "At first only the g5 is known; leave the post empty then. Fill it in once the division exists. The function (president, vice, secretary, finance) is separate from the post: whoever is Finance sees and manages the expenses on the post Ploeg.",
        function: "Function",
        noFunction: "No function",
        functions: {
          PRAESES: "President",
          VICE: "Vice",
          SECRETARIS: "Secretary",
          BEHEER: "Finance",
        },
        post: "Post",
        noPost: "(no post yet)",
        role: "Role",
        member: "Member",
        lead: "Lead",
        sending: "Sending",
        receiveOnly: "Receive only",
        fromAlias: "From kiesploeg address",
        forwardTo: "Forward to",
        account: "Account",
        noAccount: "no account yet",
        states: {
          RESTRICTED: "receives only",
          ALIAS_SENDER: "sends from kiesploeg address",
          FULL: "full",
          SUSPENDED: "suspended",
        },
        alias: "Kiesploeg address",
        aliasProposal: "proposal",
        aliasRemoved: "removed",
        restore: "Reopen account",
        restoring: "Working...",
        restored: "Account reopened.",
        restoreTitle: "Reopen account?",
        restoreDescription: (name: string) =>
          `${name} got no post and was suspended for that. Reopening makes the account a full one (sending from their own address) and the sync will not suspend it again. The mailbox and mail from during the suspension stay as they were.`,
        transitionTitle: "On 15 July",
        transitionPending: (year: number, full: number, suspended: number) =>
          `On 15 July ${year} the kiesploeg addresses go. ${full} ${full === 1 ? "member holds" : "members hold"} a post by then and become full; ${suspended} ${suspended === 1 ? "member is" : "members are"} suspended for holding no post in ${year}-${year + 1}.`,
        transitionNoPosts: (year: number) =>
          `The post division for ${year}-${year + 1} is not in the site yet (Admin > Posts). As long as it is missing, the sync suspends nobody.`,
        transitionDone: (when: string) => `Took office: the kiesploeg addresses were removed on ${when}.`,
        transitionBusy: "Took office: the sync is removing the kiesploeg addresses.",
        noPostThen: (year: number) => `no post in ${year}-${year + 1}`,
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
        NO_ACCOUNT: "Dit lid heeft geen gekoppeld account.",
        GOOGLE_UNREACHABLE: "Google weigerde of was niet bereikbaar; probeer het opnieuw.",
      }
    : {
        INVALID_INPUT: "Not saved: check the fields.",
        DUPLICATE_CODE: "Not saved: that code already exists.",
        INVALID_EMAIL: "Not saved: that is not a valid email address.",
        NOT_CONFIGURED: "Google Workspace is not set up yet (Admin > IT).",
        NO_ACCOUNT: "This member has no linked account.",
        GOOGLE_UNREACHABLE: "Google refused or was unreachable; try again.",
      };

  return (
    <div className="space-y-6">
      <div>
        <p className="max-w-3xl text-sm text-zinc-500">{t.intro}</p>
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

              <TransitionNote row={row} t={t} />

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
                          <span className="font-medium text-vtk-ink">
                            {member.name}
                            {member.function && (
                              <span className="ml-2 rounded-full bg-vtk-blue-soft px-2 py-0.5 text-xs font-normal text-vtk-ink">
                                {t.functions[member.function]}
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {member.googleEmail ?? t.noAccount}
                            {member.accountState && (
                              <>
                                {" · "}
                                <span
                                  className={
                                    member.accountState === "SUSPENDED" ? "text-red-700" : undefined
                                  }
                                >
                                  {t.states[member.accountState]}
                                </span>
                              </>
                            )}
                            {row.current && !member.hasPostInYear && member.accountState !== "FULL" && (
                              <> · {t.noPostThen(row.workingYear)}</>
                            )}
                          </span>
                        </div>
                        {(member.aliasEmail || member.aliasPreview) && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {t.alias}: {member.aliasEmail ?? member.aliasPreview}
                            {!member.aliasEmail && <> ({t.aliasProposal})</>}
                            {member.aliasRemoved && <> ({t.aliasRemoved})</>}
                          </p>
                        )}
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
                            <div className="w-40">
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
                            <div className="w-36">
                              <Label>{t.function}</Label>
                              <Select name="function" defaultValue={member.function ?? ""}>
                                <option value="">{t.noFunction}</option>
                                {FUNCTIONS.map((code) => (
                                  <option key={code} value={code}>
                                    {t.functions[code]}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="w-32">
                              <Label>{t.role}</Label>
                              <Select name="role" defaultValue={member.role}>
                                <option value="MEMBER">{t.member}</option>
                                <option value="LEAD">{t.lead}</option>
                              </Select>
                            </div>
                            <div className="w-52">
                              <Label>{t.forwardTo}</Label>
                              <Input
                                name="forwardTo"
                                type="email"
                                defaultValue={member.forwardTo ?? ""}
                              />
                            </div>
                            <div className="w-48">
                              <Label>{t.sending}</Label>
                              <Select
                                name="sendFromAlias"
                                defaultValue={member.sendFromAlias ? "on" : ""}
                              >
                                <option value="">{t.receiveOnly}</option>
                                <option value="on">{t.fromAlias}</option>
                              </Select>
                            </div>
                          </SaveForm>
                          {member.accountState === "SUSPENDED" && (
                            <SaveForm
                              action={restoreKiesploegAccountAction}
                              submitLabel={t.restore}
                              savingLabel={t.restoring}
                              savedMessage={t.restored}
                              submitVariant="ghost"
                              errorMessages={errorMessages}
                              fallbackErrorMessage={nl ? "Openzetten is mislukt." : "Reopening failed."}
                              confirmSubmit={{
                                title: t.restoreTitle,
                                description: t.restoreDescription(member.name),
                                confirmLabel: t.restore,
                                cancelLabel: t.cancel,
                              }}
                            >
                              <input type="hidden" name="id" value={member.id} />
                            </SaveForm>
                          )}
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
            <Input name="code" placeholder="epsilon" required />
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
            value="{voornaam}.{achternaam}.kiesploeg{code}"
          />
          <input type="hidden" name="listTemplate" value="{code}.{post}" />
          <input type="hidden" name="active" value="on" />
        </SaveForm>
      </section>
    </div>
  );
}

/**
 * Wat er op 15 juli met deze ploeg gebeurt, vooraf berekend uit dezelfde
 * gegevens als de sync. Zo ziet de vice een week op voorhand wie geschorst zou
 * worden omdat zijn post nog niet ingevuld is, en niet pas op 16 juli.
 */
function TransitionNote({
  row,
  t,
}: {
  row: KiesploegRow;
  t: {
    transitionTitle: string;
    transitionPending: (year: number, full: number, suspended: number) => string;
    transitionNoPosts: (year: number) => string;
    transitionDone: (when: string) => string;
    transitionBusy: string;
  };
}) {
  if (!row.current && !row.tookOffice) return null;
  if (row.transitionedLabel) {
    return <p className="text-sm text-zinc-600">{t.transitionDone(row.transitionedLabel)}</p>;
  }
  if (row.tookOffice) return <p className="text-sm text-zinc-600">{t.transitionBusy}</p>;

  const withAccount = row.members.filter((m) => m.googleEmail);
  const full = withAccount.filter((m) => m.hasPostInYear).length;
  const suspended = withAccount.filter(
    (m) => !m.hasPostInYear && !m.keepAccount && m.accountState !== "FULL",
  ).length;
  return (
    <section className="space-y-1 rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/30 px-3 py-2 text-sm">
      <h3 className="font-semibold text-vtk-ink">{t.transitionTitle}</h3>
      <p>{t.transitionPending(row.workingYear, full, suspended)}</p>
      {!row.postsEntered && <p className="text-amber-800">{t.transitionNoPosts(row.workingYear)}</p>}
    </section>
  );
}
