"use client";

import Link from "@/components/ui/Link";
import { Input, Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { UserSearchField } from "../UserSearchField";
import {
  addExtraAction,
  addSourceAction,
  addUserMemberAction,
  clearImportedExtrasAction,
  deleteMailGroupAction,
  removeExtraAction,
  removeSourceAction,
  saveMailGroupAction,
  saveYearlyAction,
} from "../actions";

export type SourceOptionGroup = {
  label: string;
  options: { value: string; label: string }[];
};

type Extra = {
  id: string;
  label: string;
  /** Het adres dat dit lid in deze lijst krijgt; `null` bij een vrij adres of zonder account. */
  address: string | null;
  isUser: boolean;
  kind: "INCLUDE" | "EXCLUDE";
  note: string | null;
};

const ERRORS_NL: Record<string, string> = {
  DUPLICATE_EMAIL: "Niet opgeslagen: dat adres staat er al of bestaat al.",
  DUPLICATE_SOURCE: "Niet toegevoegd: die bron staat er al in.",
  DUPLICATE_MEMBER: "Niet toegevoegd: dat lid staat er al in.",
  NOT_IN_WERKGROEP: "Niet toegevoegd: dat is geen lid van je werkgroep dit werkingsjaar.",
  INVALID_EMAIL: "Niet opgeslagen: dat is geen geldig mailadres.",
  INVALID_INPUT: "Niet opgeslagen: controleer de velden.",
  YEARLY_INCOMPLETE: "Niet opgeslagen: vul het sjabloon en de post allebei in, of laat allebei leeg.",
  YEARLY_NO_YEAR: "Niet opgeslagen: het sjabloon moet {jj} of {jaar} bevatten, anders krijgt elk jaar hetzelfde adres.",
  YEARLY_NO_DOMAIN: "Niet opgeslagen: geef enkel het stuk voor de @, bv. activiteiten_{jj}.",
  YEARLY_ON_YEARLY: "Een jaargroep kan zelf geen jaargroepen hebben.",
};
const ERRORS_EN: Record<string, string> = {
  DUPLICATE_EMAIL: "Not saved: that address is already in it or already exists.",
  DUPLICATE_SOURCE: "Not added: that source is already there.",
  DUPLICATE_MEMBER: "Not added: that member is already in it.",
  NOT_IN_WERKGROEP: "Not added: that is not a member of your work group this working year.",
  INVALID_EMAIL: "Not saved: that is not a valid email address.",
  INVALID_INPUT: "Not saved: check the fields.",
  YEARLY_INCOMPLETE: "Not saved: fill in both the template and the post, or leave both empty.",
  YEARLY_NO_YEAR: "Not saved: the template needs {jj} or {jaar}, otherwise every year gets the same address.",
  YEARLY_NO_DOMAIN: "Not saved: only give the part before the @, e.g. activiteiten_{jj}.",
  YEARLY_ON_YEARLY: "A yearly group cannot have yearly groups itself.",
};

export function MailGroupDetail({
  nl,
  locale,
  manageAll,
  archived,
  group,
  members,
  unlinked,
  sources,
  sourceOptions,
  extras,
  importedLeft,
  ownMembers,
  werkgroepen,
  praesidiumPosts,
  yearlyPreview,
  yearlyGroups,
  domain,
  base,
}: {
  nl: boolean;
  locale: string;
  manageAll: boolean;
  archived: boolean;
  group: {
    id: string;
    email: string;
    name: string;
    description: string | null;
    enabled: boolean;
    allowExternalSenders: boolean;
    ownerGroupId: string | null;
    isYearly: boolean;
    canHaveYearly: boolean;
    yearlyTemplate: string | null;
    yearlyGroupId: string | null;
  };
  members: { email: string; name: string | null }[];
  unlinked: string[];
  sources: { id: string; name: string; removable: boolean }[];
  sourceOptions: SourceOptionGroup[];
  extras: Extra[];
  importedLeft: number;
  ownMembers: { id: string; name: string }[];
  werkgroepen: { id: string; name: string; prefix: string | null }[];
  praesidiumPosts: { id: string; name: string }[];
  yearlyPreview: string | null;
  yearlyGroups: { id: string; email: string; year: number | null; current: boolean; members: number }[];
  domain: string;
  base: string;
}) {
  const errorMessages = nl ? ERRORS_NL : ERRORS_EN;
  const t = nl
    ? {
        members: "Wie erin zit",
        membersHelp:
          "Berekend uit de bronnen en de losse leden hieronder, precies zoals de sync het in Google zet. Eigenaars en beheerders van de groep staan hier niet: die raakt de site nooit aan.",
        noMembers: "Niemand. Voeg een bron of een lid toe.",
        unlinked: (n: number) =>
          `${n} ${n === 1 ? "lid hoort" : "leden horen"} erin maar ${n === 1 ? "heeft" : "hebben"} geen gekoppeld @vtk.be-adres en ${n === 1 ? "staat" : "staan"} er dus niet in`,
        unlinkedHelp:
          "Koppel hun account, of zet hun eigen adres bewust bij de losse adressen.",
        sources: "Bronnen",
        sourcesHelp:
          "Iedereen die dit werkingsjaar in deze post, werkgroep, kiesploeg of POC zit. Wie er niet meer in zit, valt er vanzelf uit; op 15 juli wisselt alles mee.",
        noSources: "Geen bronnen: enkel de losse leden hieronder.",
        addSource: "Bron toevoegen",
        onlyLead: "Enkel de verantwoordelijke",
        add: "Toevoegen",
        adding: "Bezig met toevoegen...",
        added: "Toegevoegd.",
        removed: "Verwijderd.",
        remove: "Verwijderen",
        cancel: "Annuleren",
        extras: "Losse leden",
        extrasHelp:
          "Wie er los bij hoort, zonder post: een lid van de site (dan volgt het adres zijn account), of een vrij adres zoals een andere groep (groep5@vtk.be) of iemand van buiten. Een uitsluiting wint van de bronnen.",
        noExtras: "Geen losse leden.",
        include: "Erbij",
        exclude: "Eruit",
        member: "Lid van de site",
        address: "Mailadres",
        kind: "Soort",
        note: "Notitie",
        noAccount: "geen account",
        importedTitle: (n: number) => `${n} overgenomen ${n === 1 ? "adres" : "adressen"} wissen`,
        importedDescription: (n: number) =>
          `De ${n} vrije adressen die bij het overnemen uit Google meekwamen, verdwijnen uit deze lijst. Wie via een bron of als lid van de site in de lijst staat, blijft. Doe dit pas wanneer de bron nagekeken is: wie enkel als overgenomen adres in de lijst stond, valt er bij de volgende sync uit.`,
        importedHelp:
          "Wanneer de bronnen hierboven dezelfde mensen opleveren, mogen de adressen die bij het overnemen meekwamen weg.",
        removeSourceTitle: "Bron verwijderen?",
        removeSourceDescription: (name: string) =>
          `De leden van ${name} vallen bij de volgende synchronisatie uit ${group.email}, tenzij ze er ook via een andere bron of als los lid in staan.`,
        removeExtraTitle: "Uit de lijst halen?",
        removeExtraDescription: (label: string) =>
          `${label} verdwijnt bij de volgende synchronisatie uit ${group.email}, tenzij hij er ook via een bron in staat.`,
        yearly: "Jaargroepen",
        yearlyHelp:
          "Zoals activiteiten_2627@vtk.be in activiteiten@vtk.be: elk werkingsjaar een eigen groep met de leden van de post van dat jaar. De sync maakt de groep van dit jaar aan, die van volgend jaar zodra daar iemand in de post staat, en hangt op 15 juli de nieuwe in de plaats van de oude. Oude jaargroepen blijven bestaan als archief.",
        yearlyTemplate: "Adres van de jaargroep",
        yearlyTemplateHelp: "Met {jj} voor 2627 of {jaar} voor 2026.",
        yearlyPost: "Post",
        noPost: "Geen jaargroepen",
        yearlyNow: (email: string) => `Dit werkingsjaar: ${email}`,
        yearlyCurrent: "hangt erin",
        yearlyNext: "vanaf 15 juli",
        yearlyArchive: "archief",
        settings: "Instellingen",
        name: "Naam",
        description: "Omschrijving",
        email: "Adres",
        owner: "Beheerd door werkgroep",
        noOwner: "Geen (enkel IT)",
        ownerHelp:
          "Die werkgroep zet dan zelf leden in en uit. Haar leden krijgen in deze lijst hun werkgroepadres.",
        external: "Mail van buiten vtk.be toelaten",
        externalHelp:
          "Aan voor elk adres waar bedrijven, profs of studenten naartoe mailen. Uit: enkel adressen van vtk.be mogen posten.",
        enabled: "De site beheert dit adres",
        enabledHelp:
          "Uit: de sync raakt de groep in Google niet meer aan, maar de regel blijft hier staan.",
        save: "Opslaan",
        saving: "Bezig met opslaan...",
        saved: "Opgeslagen.",
        unlinkTitle: "Groepsadres loskoppelen?",
        unlinkDescription:
          "De regel verdwijnt hier, met haar bronnen en losse leden. De groep in Google blijft bestaan met haar huidige leden en haar archief; de site beheert ze enkel niet meer. Je kan ze later opnieuw overnemen.",
        unlink: "Loskoppelen",
      }
    : {
        members: "Who is in it",
        membersHelp:
          "Calculated from the sources and loose members below, exactly as the sync puts it in Google. Owners and managers of the group are not shown: the site never touches them.",
        noMembers: "Nobody. Add a source or a member.",
        unlinked: (n: number) =>
          `${n} ${n === 1 ? "member belongs" : "members belong"} in it without a linked @vtk.be address and ${n === 1 ? "is" : "are"} therefore not in it`,
        unlinkedHelp: "Link their account, or deliberately add their own address as a loose address.",
        sources: "Sources",
        sourcesHelp:
          "Everyone in this post, work group, kiesploeg or POC this working year. Whoever leaves drops out by itself; on 15 July everything follows.",
        noSources: "No sources: only the loose members below.",
        addSource: "Add source",
        onlyLead: "Only the lead",
        add: "Add",
        adding: "Adding...",
        added: "Added.",
        removed: "Removed.",
        remove: "Remove",
        cancel: "Cancel",
        extras: "Loose members",
        extrasHelp:
          "Who belongs in it without a post: a site member (the address then follows their account), or a free address such as another group (groep5@vtk.be) or someone outside. An exclusion beats the sources.",
        noExtras: "No loose members.",
        include: "Include",
        exclude: "Exclude",
        member: "Site member",
        address: "Email address",
        kind: "Kind",
        note: "Note",
        noAccount: "no account",
        importedTitle: (n: number) => `Clear ${n} imported ${n === 1 ? "address" : "addresses"}`,
        importedDescription: (n: number) =>
          `The ${n} free addresses that came along when taking over from Google disappear from this list. Whoever is in it through a source or as a site member stays. Only do this once the source is checked: whoever was only in it as an imported address drops out on the next sync.`,
        importedHelp:
          "When the sources above yield the same people, the addresses that came along when taking over can go.",
        removeSourceTitle: "Remove source?",
        removeSourceDescription: (name: string) =>
          `The members of ${name} drop out of ${group.email} on the next synchronisation, unless they are in it through another source or as a loose member.`,
        removeExtraTitle: "Remove from the list?",
        removeExtraDescription: (label: string) =>
          `${label} drops out of ${group.email} on the next synchronisation, unless they are in it through a source.`,
        yearly: "Yearly groups",
        yearlyHelp:
          "Like activiteiten_2627@vtk.be inside activiteiten@vtk.be: a group per working year with that year's post members. The sync creates this year's group, next year's as soon as someone is in next year's post, and swaps the new one in for the old one on 15 July. Old yearly groups stay as an archive.",
        yearlyTemplate: "Address of the yearly group",
        yearlyTemplateHelp: "With {jj} for 2627 or {jaar} for 2026.",
        yearlyPost: "Post",
        noPost: "No yearly groups",
        yearlyNow: (email: string) => `This working year: ${email}`,
        yearlyCurrent: "is in it",
        yearlyNext: "from 15 July",
        yearlyArchive: "archive",
        settings: "Settings",
        name: "Name",
        description: "Description",
        email: "Address",
        owner: "Managed by work group",
        noOwner: "None (IT only)",
        ownerHelp:
          "That work group then adds and removes members itself. Its members get their work group address in this list.",
        external: "Allow mail from outside vtk.be",
        externalHelp:
          "On for every address companies, professors or students mail. Off: only vtk.be addresses may post.",
        enabled: "The site manages this address",
        enabledHelp: "Off: the sync no longer touches the group in Google, but the rule stays here.",
        save: "Save",
        saving: "Saving...",
        saved: "Saved.",
        unlinkTitle: "Unlink group address?",
        unlinkDescription:
          "The rule disappears here, with its sources and loose members. The group in Google keeps existing with its current members and its archive; the site simply stops managing it. You can take it over again later.",
        unlink: "Unlink",
      };

  const yearOf = (y: number | null) => (y === null ? "" : `${y}-${y + 1}`);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-vtk-ink">
            {t.members} <span className="tabular-nums text-zinc-500">({members.length})</span>
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-zinc-500">{t.membersHelp}</p>
        </div>
        {unlinked.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">{t.unlinked(unlinked.length)}</p>
            <p className="mt-1">{t.unlinkedHelp}</p>
            <p className="mt-1 text-xs">{unlinked.join(", ")}</p>
          </div>
        )}
        {members.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.noMembers}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 rounded-xl border border-vtk-blue/15 bg-white px-3 py-2 text-sm sm:grid-cols-2">
            {members.map((m) => (
              <li key={m.email} className="flex min-w-0 items-baseline justify-between gap-3 py-1">
                <span className="min-w-0 break-all text-vtk-ink">{m.email}</span>
                {m.name && <span className="shrink-0 text-xs text-zinc-500">{m.name}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!archived && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-vtk-ink">{t.sources}</h2>
            <p className="mt-1 max-w-3xl text-xs text-zinc-500">{t.sourcesHelp}</p>
          </div>
          {sources.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.noSources}</p>
          ) : (
            <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
              {sources.map((source) => (
                <li key={source.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>{source.name}</span>
                  {source.removable && (
                    <DeleteIconButton
                      action={removeSourceAction}
                      fields={{ id: source.id }}
                      label={t.remove}
                      srLabel={`${t.remove}: ${source.name}`}
                      title={t.removeSourceTitle}
                      description={t.removeSourceDescription(source.name)}
                      confirmLabel={t.remove}
                      cancelLabel={t.cancel}
                      successMessage={t.removed}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {sourceOptions.length > 0 && (
            <SaveForm
              action={addSourceAction}
              submitLabel={t.add}
              savingLabel={t.adding}
              savedMessage={t.added}
              errorMessages={errorMessages}
              fallbackErrorMessage={nl ? "Toevoegen is mislukt." : "Adding failed."}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="mailGroupId" value={group.id} />
              <div className="w-72">
                <Label>{t.addSource}</Label>
                <Select name="source" required defaultValue="">
                  <option value="" disabled>
                    ...
                  </option>
                  {sourceOptions.map((og) => (
                    <optgroup key={og.label} label={og.label}>
                      {og.options.map((option) => (
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
          )}
        </section>
      )}

      {!archived && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-vtk-ink">{t.extras}</h2>
            <p className="mt-1 max-w-3xl text-xs text-zinc-500">{t.extrasHelp}</p>
          </div>
          {extras.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.noExtras}</p>
          ) : (
            <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
              {extras.map((extra) => (
                <li key={extra.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="break-all">{extra.label}</span>
                    <span
                      className={
                        extra.kind === "EXCLUDE" ? "ml-2 text-xs text-red-700" : "ml-2 text-xs text-zinc-500"
                      }
                    >
                      ({extra.kind === "EXCLUDE" ? t.exclude : t.include})
                    </span>
                    {extra.isUser && (
                      <span className="block text-xs text-zinc-500">{extra.address ?? t.noAccount}</span>
                    )}
                    {extra.note && <span className="block text-xs text-zinc-500">{extra.note}</span>}
                  </span>
                  <DeleteIconButton
                    action={removeExtraAction}
                    fields={{ id: extra.id }}
                    label={t.remove}
                    srLabel={`${t.remove}: ${extra.label}`}
                    title={t.removeExtraTitle}
                    description={t.removeExtraDescription(extra.label)}
                    confirmLabel={t.remove}
                    cancelLabel={t.cancel}
                    successMessage={t.removed}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <SaveForm
              action={addUserMemberAction}
              submitLabel={t.add}
              savingLabel={t.adding}
              savedMessage={t.added}
              errorMessages={errorMessages}
              fallbackErrorMessage={nl ? "Toevoegen is mislukt." : "Adding failed."}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-3"
            >
              <input type="hidden" name="mailGroupId" value={group.id} />
              {manageAll ? (
                <UserSearchField nl={nl} label={t.member} />
              ) : (
                <div className="w-64">
                  <Label>{t.member}</Label>
                  <Select name="userId" required defaultValue="">
                    <option value="" disabled>
                      ...
                    </option>
                    {ownMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="w-28">
                <Label>{t.kind}</Label>
                <Select name="kind" defaultValue="INCLUDE">
                  <option value="INCLUDE">{t.include}</option>
                  <option value="EXCLUDE">{t.exclude}</option>
                </Select>
              </div>
            </SaveForm>

            <SaveForm
              action={addExtraAction}
              submitLabel={t.add}
              savingLabel={t.adding}
              savedMessage={t.added}
              errorMessages={errorMessages}
              fallbackErrorMessage={nl ? "Toevoegen is mislukt." : "Adding failed."}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-3"
            >
              <input type="hidden" name="mailGroupId" value={group.id} />
              <div className="w-56">
                <Label>{t.address}</Label>
                <Input name="email" type="email" placeholder={`groep5@${domain}`} required />
              </div>
              <div className="w-28">
                <Label>{t.kind}</Label>
                <Select name="kind" defaultValue="INCLUDE">
                  <option value="INCLUDE">{t.include}</option>
                  <option value="EXCLUDE">{t.exclude}</option>
                </Select>
              </div>
              <div className="w-40">
                <Label>{t.note}</Label>
                <Input name="note" />
              </div>
            </SaveForm>
          </div>

          {manageAll && importedLeft > 0 && sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <DeleteButton
                action={clearImportedExtrasAction}
                fields={{ mailGroupId: group.id }}
                title={t.importedTitle(importedLeft)}
                description={t.importedDescription(importedLeft)}
                confirmLabel={t.importedTitle(importedLeft)}
                cancelLabel={t.cancel}
                successMessage={t.removed}
              >
                {t.importedTitle(importedLeft)}
              </DeleteButton>
              <p className="max-w-md text-xs text-zinc-500">{t.importedHelp}</p>
            </div>
          )}
        </section>
      )}

      {manageAll && (group.canHaveYearly || group.yearlyTemplate) && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-vtk-ink">{t.yearly}</h2>
            <p className="mt-1 max-w-3xl text-xs text-zinc-500">{t.yearlyHelp}</p>
          </div>
          <SaveForm
            action={saveYearlyAction}
            submitLabel={t.save}
            savingLabel={t.saving}
            savedMessage={t.saved}
            errorMessages={errorMessages}
            fallbackErrorMessage={nl ? "Opslaan is mislukt." : "Saving failed."}
            resetOnSuccess={false}
            className="flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="mailGroupId" value={group.id} />
            <div className="w-64">
              <Label>{t.yearlyTemplate}</Label>
              <div className="flex items-center gap-1 text-sm">
                <Input
                  name="yearlyTemplate"
                  defaultValue={group.yearlyTemplate ?? ""}
                  placeholder={`${group.email.split("@")[0]}_{jj}`}
                />
                <span className="text-zinc-500">@{domain}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{t.yearlyTemplateHelp}</p>
            </div>
            <div className="w-56">
              <Label>{t.yearlyPost}</Label>
              <Select name="yearlyGroupId" defaultValue={group.yearlyGroupId ?? ""}>
                <option value="">{t.noPost}</option>
                {praesidiumPosts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </SaveForm>
          {yearlyPreview && <p className="text-sm text-zinc-600">{t.yearlyNow(yearlyPreview)}</p>}
          {yearlyGroups.length > 0 && (
            <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
              {yearlyGroups.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <Link href={`${base}/${c.id}`} className="vtk-link">
                    {c.email}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {yearOf(c.year)} ·{" "}
                    {c.current
                      ? t.yearlyCurrent
                      : c.year !== null && yearlyGroups.some((x) => x.current && x.year !== null && c.year! > x.year)
                        ? t.yearlyNext
                        : t.yearlyArchive}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-vtk-ink">{t.settings}</h2>
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
          <input type="hidden" name="id" value={group.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {manageAll && (
              <div>
                <Label>{t.email}</Label>
                <Input name="email" defaultValue={group.email} required />
              </div>
            )}
            <div>
              <Label>{t.name}</Label>
              <Input name="name" defaultValue={group.name} required />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.description}</Label>
              <Input name="description" defaultValue={group.description ?? ""} />
            </div>
            {manageAll && (
              <div>
                <Label>{t.owner}</Label>
                <Select name="ownerGroupId" defaultValue={group.ownerGroupId ?? ""}>
                  <option value="">{t.noOwner}</option>
                  {werkgroepen.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.prefix ? ` (${w.prefix}.)` : ""}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-zinc-500">{t.ownerHelp}</p>
              </div>
            )}
          </div>
          {manageAll && (
            <>
              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  name="allowExternalSenders"
                  defaultChecked={group.allowExternalSenders}
                  className="mt-1"
                />
                <span>
                  {t.external}
                  <span className="block text-xs text-zinc-500">{t.externalHelp}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input type="checkbox" name="enabled" defaultChecked={group.enabled} className="mt-1" />
                <span>
                  {t.enabled}
                  <span className="block text-xs text-zinc-500">{t.enabledHelp}</span>
                </span>
              </label>
            </>
          )}
        </SaveForm>
      </section>

      {manageAll && (
        <div className="border-t border-vtk-blue/10 pt-4">
          <DeleteButton
            action={deleteMailGroupAction}
            fields={{ id: group.id, locale }}
            title={t.unlinkTitle}
            description={t.unlinkDescription}
            confirmLabel={t.unlink}
            cancelLabel={t.cancel}
          >
            {t.unlink}
          </DeleteButton>
        </div>
      )}
    </div>
  );
}
