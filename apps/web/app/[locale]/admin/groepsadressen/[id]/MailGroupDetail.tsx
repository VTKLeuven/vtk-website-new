"use client";

import { useState } from "react";
import Link from "@/components/ui/Link";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
import {
  type MemberStatusView,
  STATUS_TONE_CLASS,
  statusLabel,
} from "@/lib/google/activityLabels";
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
import { deleteOneFromGoogleAction } from "../bulkActions";

export type SourceOptionGroup = {
  label: string;
  options: { value: string; label: string }[];
};

/**
 * Eén rij in het tabblad Leden: wie er nu in zit, plus de losse regels die
 * geen adres opleveren (een uitsluiting, een lid zonder account). Zo staat
 * elk adres er één keer, met waarom het erin zit.
 */
export type MemberRow = {
  key: string;
  /** `null` bij een lid van de site zonder `@vtk.be`-account. */
  address: string | null;
  name: string | null;
  via: "source" | "loose" | "yearly" | "excluded";
  /** De rij in `MailGroupExtra`, om ze te kunnen weghalen. */
  extraId: string | null;
  note: string | null;
  /** `null` voor een uitsluiting: die zit er per definitie niet in. */
  status: MemberStatusView | null;
};

type Tab = "leden" | "bronnen" | "jaargroepen" | "instellingen";

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
  NOT_CONFIGURED: "Google Workspace is nog niet ingesteld (Admin > IT); er is niets verwijderd.",
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
  NOT_CONFIGURED: "Google Workspace is not set up yet (Admin > IT); nothing was deleted.",
};

/**
 * Eén groepsadres in vier tabbladen: Leden (wie erin zit, waarom, en of ze nog
 * actief zijn), Bronnen, Jaargroepen en Instellingen. Gekozen uit vier
 * richtingen op 16 november 2026; zie docs/design-decisions.md.
 */
export function MailGroupDetail({
  nl,
  locale,
  initialTab,
  manageAll,
  archived,
  group,
  members,
  activeCount,
  unlinked,
  sources,
  sourceOptions,
  importedLeft,
  ownMembers,
  werkgroepen,
  praesidiumPosts,
  categoryOptions,
  showYearly,
  yearlyPreview,
  yearlyGroups,
  domain,
  base,
}: {
  nl: boolean;
  locale: string;
  initialTab: string | undefined;
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
    categoryId: string | null;
    isYearly: boolean;
    yearlyTemplate: string | null;
    yearlyGroupId: string | null;
  };
  members: MemberRow[];
  activeCount: number;
  unlinked: string[];
  sources: { id: string; name: string; removable: boolean }[];
  sourceOptions: SourceOptionGroup[];
  importedLeft: number;
  ownMembers: { id: string; name: string }[];
  werkgroepen: { id: string; name: string; prefix: string | null }[];
  praesidiumPosts: { id: string; name: string }[];
  categoryOptions: SearchPickerOption[];
  showYearly: boolean;
  yearlyPreview: string | null;
  yearlyGroups: { id: string; email: string; year: number | null; current: boolean; members: number }[];
  domain: string;
  base: string;
}) {
  const errorMessages = nl ? ERRORS_NL : ERRORS_EN;
  const t = nl ? NL(group.email) : EN(group.email);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "leden", label: t.members, count: members.filter((m) => m.via !== "excluded" && m.address).length },
    ...(!archived ? [{ key: "bronnen" as const, label: t.sources, count: sources.length }] : []),
    ...(showYearly ? [{ key: "jaargroepen" as const, label: t.yearly, count: yearlyGroups.length || undefined }] : []),
    { key: "instellingen", label: t.settings },
  ];

  // Het tabblad staat in de URL (`?tab=instellingen`), zodat een link daar
  // opent en herladen na een opslag niet naar Leden springt. De server geeft
  // de beginstand mee; wisselen raakt de server niet.
  const [tab, setTab] = useState<Tab>(tabs.some((x) => x.key === initialTab) ? (initialTab as Tab) : "leden");
  const choose = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "leden") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  };

  const inList = members.filter((m) => m.via !== "excluded" && m.address);
  const loose = members.filter((m) => m.via === "loose").length;
  const sourceNames = sources.map((s) => s.name);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-vtk-blue/15 bg-white px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-vtk-ink">
          {t.summary(inList.length, activeCount, sourceNames, loose)}
        </p>
        {inList.length > 0 && (
          <span
            className="inline-block h-1.5 w-32 overflow-hidden rounded-full bg-vtk-blue-soft"
            aria-hidden="true"
          >
            <span
              className="block h-full bg-emerald-700"
              style={{ width: `${Math.round((activeCount / inList.length) * 100)}%` }}
            />
          </span>
        )}
      </div>

      <div role="tablist" aria-label={group.email} className="flex gap-1 overflow-x-auto border-b border-vtk-blue/15">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            id={`tab-${x.key}`}
            aria-selected={tab === x.key}
            aria-controls={`panel-${x.key}`}
            onClick={() => choose(x.key)}
            className={[
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm",
              tab === x.key
                ? "border-vtk-yellow font-semibold text-vtk-ink"
                : "border-transparent text-zinc-500 hover:text-vtk-ink",
            ].join(" ")}
          >
            {x.label}
            {x.count !== undefined && <span className="ml-1.5 font-normal tabular-nums text-zinc-500">{x.count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "leden" && (
          <MembersTab
            nl={nl}
            t={t}
            manageAll={manageAll}
            archived={archived}
            group={group}
            members={members}
            unlinked={unlinked}
            hasSources={sources.length > 0}
            importedLeft={importedLeft}
            ownMembers={ownMembers}
            domain={domain}
            errorMessages={errorMessages}
            onGoToSources={() => choose("bronnen")}
          />
        )}

        {tab === "bronnen" && (
          <section className="space-y-4">
            <p className="max-w-3xl text-sm text-zinc-500">{t.sourcesHelp}</p>
            {sources.length === 0 ? (
              <p className="rounded-xl border border-vtk-blue/15 bg-white px-4 py-3 text-sm text-zinc-600">
                {importedLeft > 0 ? t.noSourcesImported : t.noSources}
              </p>
            ) : (
              <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
                {sources.map((source) => (
                  <li key={source.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
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
                fallbackErrorMessage={t.addFailed}
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="mailGroupId" value={group.id} />
                <div className="w-80 max-w-full">
                  <Label>{t.addSource}</Label>
                  <SearchPicker
                    name="source"
                    options={sourceOptions.flatMap((og) =>
                      og.options.map((option) => ({ ...option, group: og.label })),
                    )}
                    placeholder={t.pickSource}
                    searchPlaceholder={t.searchSource}
                    ariaLabel={t.addSource}
                    emptyText={t.noSourceMatch}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
                  <input type="checkbox" name="onlyLead" />
                  {t.onlyLead}
                </label>
              </SaveForm>
            )}
          </section>
        )}

        {tab === "jaargroepen" && (
          <section className="space-y-4">
            <p className="max-w-3xl text-sm text-zinc-500">{t.yearlyHelp}</p>
            <SaveForm
              action={saveYearlyAction}
              submitLabel={t.save}
              savingLabel={t.saving}
              savedMessage={t.saved}
              errorMessages={errorMessages}
              fallbackErrorMessage={t.saveFailed}
              resetOnSuccess={false}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="mailGroupId" value={group.id} />
              <div className="w-72 max-w-full">
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
              <div className="w-60 max-w-full self-start">
                <Label>{t.yearlyPost}</Label>
                <SearchPicker
                  name="yearlyGroupId"
                  defaultValue={group.yearlyGroupId ?? ""}
                  options={[
                    { value: "", label: t.noPost, muted: true },
                    ...praesidiumPosts.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  placeholder={t.noPost}
                  searchPlaceholder={t.searchPost}
                  ariaLabel={t.yearlyPost}
                  emptyText={t.noPostMatch}
                />
              </div>
            </SaveForm>
            {yearlyPreview && <p className="text-sm text-zinc-600">{t.yearlyNow(yearlyPreview)}</p>}
            {yearlyGroups.length > 0 && (
              <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
                {yearlyGroups.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <Link href={`${base}/${c.id}`} className="vtk-link">
                      {c.email}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      {c.year === null ? "" : `${c.year}-${c.year + 1}`} ·{" "}
                      {c.current
                        ? t.yearlyCurrent
                        : c.year !== null &&
                            yearlyGroups.some((x) => x.current && x.year !== null && c.year! > x.year)
                          ? t.yearlyNext
                          : t.yearlyArchive}{" "}
                      · {t.membersCount(c.members)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "instellingen" && (
          <section className="space-y-6">
            <SaveForm
              action={saveMailGroupAction}
              submitLabel={t.save}
              savingLabel={t.saving}
              savedMessage={t.saved}
              errorMessages={errorMessages}
              fallbackErrorMessage={t.saveFailed}
              resetOnSuccess={false}
              className="space-y-4"
            >
              <input type="hidden" name="id" value={group.id} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <Input name="description" defaultValue={group.description ?? ""} placeholder={t.descriptionPlaceholder} />
                </div>
                {manageAll && (
                  <div>
                    <Label>{t.category}</Label>
                    <SearchPicker
                      name="categoryId"
                      defaultValue={group.categoryId ?? ""}
                      options={[{ value: "", label: t.noCategory, muted: true }, ...categoryOptions]}
                      placeholder={t.noCategory}
                      searchPlaceholder={t.searchCategory}
                      ariaLabel={t.category}
                      emptyText={t.noCategoryMatch}
                    />
                    <p className="mt-1 text-xs text-zinc-500">{t.categoryHelp}</p>
                  </div>
                )}
                {manageAll && (
                  <div>
                    <Label>{t.owner}</Label>
                    <ThemedSelect
                      name="ownerGroupId"
                      defaultValue={group.ownerGroupId ?? ""}
                      ariaLabel={t.owner}
                      options={[
                        { value: "", label: t.noOwner },
                        ...werkgroepen.map((w) => ({
                          value: w.id,
                          label: `${w.name}${w.prefix ? ` (${w.prefix}.)` : ""}`,
                        })),
                      ]}
                    />
                    <p className="mt-1 text-xs text-zinc-500">{t.ownerHelp}</p>
                  </div>
                )}
              </div>
              {manageAll && (
                <div className="space-y-3">
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
                </div>
              )}
            </SaveForm>

            {manageAll && (
              <div className="space-y-3 border-t border-vtk-blue/10 pt-5">
                <p className="max-w-3xl text-sm text-zinc-500">{t.dangerHelp}</p>
                <div className="flex flex-wrap gap-2">
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
                  <DeleteButton
                    action={deleteOneFromGoogleAction}
                    fields={{ id: group.id, locale }}
                    title={t.deleteTitle}
                    description={t.deleteDescription(inList.length, activeCount)}
                    confirmLabel={t.delete}
                    cancelLabel={t.cancel}
                    errorMessages={errorMessages}
                    errorFallback={t.deleteFailed}
                  >
                    {t.delete}
                  </DeleteButton>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function MembersTab({
  nl,
  t,
  manageAll,
  archived,
  group,
  members,
  unlinked,
  hasSources,
  importedLeft,
  ownMembers,
  domain,
  errorMessages,
  onGoToSources,
}: {
  nl: boolean;
  t: Texts;
  manageAll: boolean;
  archived: boolean;
  group: { id: string; email: string };
  members: MemberRow[];
  unlinked: string[];
  hasSources: boolean;
  importedLeft: number;
  ownMembers: { id: string; name: string }[];
  domain: string;
  errorMessages: Record<string, string>;
  onGoToSources: () => void;
}) {
  const [filter, setFilter] = useState<"alle" | "actief" | "niet">("alle");
  const [adding, setAdding] = useState<"lid" | "adres">("lid");
  const isActive = (m: MemberRow) => m.via !== "excluded" && Boolean(m.status?.active);
  const visible = members.filter((m) =>
    filter === "alle" ? true : filter === "actief" ? isActive(m) : !isActive(m),
  );
  const activeN = members.filter(isActive).length;
  const chip = (key: typeof filter, label: string, n: number) => (
    <button
      type="button"
      aria-pressed={filter === key}
      onClick={() => setFilter(key)}
      className={[
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px]",
        filter === key
          ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
          : "border-vtk-blue/15 bg-white text-vtk-ink hover:border-vtk-blue/30",
      ].join(" ")}
    >
      {label} <span className="tabular-nums">{n}</span>
    </button>
  );
  const kindOptions = [
    { value: "INCLUDE", label: t.include },
    { value: "EXCLUDE", label: t.exclude },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {chip("alle", t.all, members.length)}
          {chip("actief", t.stillActive, activeN)}
          {chip("niet", t.notActive, members.length - activeN)}
        </div>
        <p className="max-w-md text-xs text-zinc-500">{t.ownersNote}</p>
      </div>

      {unlinked.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">{t.unlinked(unlinked.length)}</p>
          <p className="mt-1">{t.unlinkedHelp}</p>
          <p className="mt-1 text-xs">{unlinked.join(", ")}</p>
        </div>
      )}

      {manageAll && importedLeft > 0 && !hasSources && !archived && (
        <p className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/40 px-3 py-2 text-sm text-vtk-ink">
          {t.importedNoSource}{" "}
          <button type="button" className="vtk-link" onClick={onGoToSources}>
            {t.goToSources}
          </button>
        </p>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-vtk-blue/15 bg-white">
        {!archived && (
          <div className="flex flex-wrap items-end gap-3 border-b border-vtk-blue/10 bg-vtk-blue-soft/30 px-4 py-3">
            <div className="inline-flex rounded-full border border-vtk-blue/15 bg-white p-0.5" role="group" aria-label={t.addWhat}>
              {(["lid", "adres"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={adding === k}
                  onClick={() => setAdding(k)}
                  className={[
                    "rounded-full px-3 py-1.5 text-[13px]",
                    adding === k ? "bg-vtk-navy text-vtk-surface" : "text-vtk-ink",
                  ].join(" ")}
                >
                  {k === "lid" ? t.member : t.address}
                </button>
              ))}
            </div>
            {adding === "lid" ? (
              <SaveForm
                key="lid"
                action={addUserMemberAction}
                submitLabel={t.add}
                savingLabel={t.adding}
                savedMessage={t.added}
                errorMessages={errorMessages}
                fallbackErrorMessage={t.addFailed}
                className="flex flex-1 flex-wrap items-end gap-3"
              >
                <input type="hidden" name="mailGroupId" value={group.id} />
                {manageAll ? (
                  <UserSearchField nl={nl} label={t.member} />
                ) : (
                  <div className="w-64 max-w-full">
                    <Label>{t.member}</Label>
                    <SearchPicker
                      name="userId"
                      options={ownMembers.map((m) => ({ value: m.id, label: m.name }))}
                      placeholder={t.pickMember}
                      searchPlaceholder={t.searchMember}
                      ariaLabel={t.member}
                      emptyText={t.noMemberMatch}
                    />
                  </div>
                )}
                <div className="w-32">
                  <Label>{t.kind}</Label>
                  <ThemedSelect name="kind" defaultValue="INCLUDE" options={kindOptions} ariaLabel={t.kind} />
                </div>
              </SaveForm>
            ) : (
              <SaveForm
                key="adres"
                action={addExtraAction}
                submitLabel={t.add}
                savingLabel={t.adding}
                savedMessage={t.added}
                errorMessages={errorMessages}
                fallbackErrorMessage={t.addFailed}
                className="flex flex-1 flex-wrap items-end gap-3"
              >
                <input type="hidden" name="mailGroupId" value={group.id} />
                <div className="w-60 max-w-full">
                  <Label>{t.address}</Label>
                  <Input name="email" type="email" placeholder={`groep5@${domain}`} required />
                </div>
                <div className="w-32">
                  <Label>{t.kind}</Label>
                  <ThemedSelect name="kind" defaultValue="INCLUDE" options={kindOptions} ariaLabel={t.kind} />
                </div>
                <div className="w-40">
                  <Label>{t.note}</Label>
                  <Input name="note" />
                </div>
              </SaveForm>
            )}
          </div>
        )}

        {visible.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">{members.length === 0 ? t.noMembers : t.noneForFilter}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t.colAddress}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colWhy}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colStatus}</th>
                  <th className="w-14 px-4 py-2.5" aria-label={t.actions} />
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => {
                  const label = m.status ? statusLabel(m.status, nl) : null;
                  const display = m.address ?? m.name ?? "?";
                  return (
                    <tr key={m.key} className="border-b border-vtk-blue/5 last:border-0">
                      <td className="px-4 py-2 align-top">
                        <span className="block break-all text-vtk-ink">{m.address ?? <em className="not-italic text-zinc-500">{t.noAccount}</em>}</span>
                        {m.name && <span className="block text-xs text-zinc-500">{m.name}</span>}
                        {m.note && <span className="block text-xs text-zinc-500">{m.note}</span>}
                      </td>
                      <td className="px-4 py-2 align-top">
                        {m.via === "excluded" ? (
                          <span className="inline-flex rounded-full border border-red-200 px-2 py-0.5 text-xs text-red-700">
                            {t.excluded}
                          </span>
                        ) : m.via === "loose" ? (
                          <span className="inline-flex rounded-full border border-vtk-blue/20 px-2 py-0.5 text-xs text-zinc-700">
                            {t.loose}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-500">{m.via === "yearly" ? t.viaYearly : t.viaSource}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top">
                        {label && (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${STATUS_TONE_CLASS[label.tone]}`}>
                            {label.text}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right align-top">
                        {m.extraId && !archived && (
                          <DeleteIconButton
                            action={removeExtraAction}
                            fields={{ id: m.extraId }}
                            label={m.via === "excluded" ? t.removeExclusion : t.removeFromList}
                            srLabel={`${m.via === "excluded" ? t.removeExclusion : t.removeFromList}: ${display}`}
                            title={m.via === "excluded" ? t.removeExclusionTitle : t.removeExtraTitle}
                            description={
                              m.via === "excluded"
                                ? t.removeExclusionDescription(display)
                                : t.removeExtraDescription(display)
                            }
                            confirmLabel={t.remove}
                            cancelLabel={t.cancel}
                            successMessage={t.removed}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {manageAll && importedLeft > 0 && hasSources && !archived && (
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
  );
}

type Texts = ReturnType<typeof NL>;

function NL(email: string) {
  return {
    summary: (n: number, active: number, sources: string[], loose: number) => {
      const src = sources.length ? `Volgt ${listNl(sources)}` : "Geen bronnen";
      const lo = loose
        ? `${sources.length ? ", plus" : ", enkel"} ${loose} ${loose === 1 ? "los adres" : "losse adressen"}`
        : "";
      return `${n} ${n === 1 ? "lid" : "leden"}, waarvan ${active} nog actief. ${src}${lo}.`;
    },
    members: "Leden",
    all: "Alle",
    stillActive: "Nog actief",
    notActive: "Niet actief",
    ownersNote: "Eigenaars en beheerders van de groep staan hier niet: die raakt de site nooit aan.",
    noMembers: "Niemand. Voeg een lid toe, of zet een bron in het tabblad Bronnen.",
    noneForFilter: "Niemand voor deze filter.",
    unlinked: (n: number) =>
      `${n} ${n === 1 ? "lid hoort" : "leden horen"} erin maar ${n === 1 ? "heeft" : "hebben"} geen gekoppeld @vtk.be-adres en ${n === 1 ? "staat" : "staan"} er dus niet in`,
    unlinkedHelp: "Koppel hun account, of zet hun eigen adres bewust als los adres.",
    importedNoSource:
      "Overgenomen uit Google: iedereen staat er als los adres in. Moet deze lijst een post, POC of werkgroep volgen, zet die dan als bron en wis daarna de overgenomen adressen.",
    goToSources: "Naar Bronnen",
    addWhat: "Wat voeg je toe?",
    member: "Lid van de site",
    address: "Mailadres",
    pickMember: "Kies een lid",
    searchMember: "Zoek op naam",
    noMemberMatch: (q: string) => `Geen lid van je werkgroep gevonden voor "${q}".`,
    kind: "Soort",
    include: "Erbij",
    exclude: "Eruit",
    note: "Notitie",
    colAddress: "Adres",
    colWhy: "Waarom",
    colStatus: "Status",
    actions: "Acties",
    noAccount: "geen @vtk.be-account",
    excluded: "uitgesloten",
    loose: "los",
    viaSource: "via een bron",
    viaYearly: "jaargroep van dit jaar",
    removeFromList: "Uit de lijst halen",
    removeExclusion: "Uitsluiting weghalen",
    removeExtraTitle: "Uit de lijst halen?",
    removeExtraDescription: (label: string) =>
      `${label} verdwijnt bij de volgende synchronisatie uit ${email}, tenzij het er ook via een bron in staat.`,
    removeExclusionTitle: "Uitsluiting weghalen?",
    removeExclusionDescription: (label: string) =>
      `${label} komt bij de volgende synchronisatie terug in ${email} wanneer een bron het oplevert.`,
    sources: "Bronnen",
    sourcesHelp:
      "Iedereen die dit werkingsjaar in deze post, werkgroep, kiesploeg of POC zit. Wie er niet meer in zit, valt er vanzelf uit; op 15 juli wisselt alles mee.",
    noSources: "Geen bronnen: deze lijst bestaat enkel uit losse leden.",
    noSourcesImported:
      "Nog geen bron. Deze lijst bestaat enkel uit de adressen die bij het overnemen meekwamen; zet een post of POC als bron als ze die moet volgen.",
    addSource: "Bron toevoegen",
    pickSource: "Kies een post, POC of kiesploeg",
    searchSource: "Zoek, bv. activiteiten of POC",
    noSourceMatch: (q: string) => `Geen bron gevonden voor "${q}".`,
    onlyLead: "Enkel de verantwoordelijke",
    add: "Toevoegen",
    adding: "Bezig met toevoegen...",
    added: "Toegevoegd.",
    addFailed: "Toevoegen is mislukt.",
    removed: "Verwijderd.",
    remove: "Verwijderen",
    cancel: "Annuleren",
    importedTitle: (n: number) => `${n} overgenomen ${n === 1 ? "adres" : "adressen"} wissen`,
    importedDescription: (n: number) =>
      `De ${n} vrije adressen die bij het overnemen uit Google meekwamen, verdwijnen uit deze lijst. Wie via een bron of als lid van de site in de lijst staat, blijft. Doe dit pas wanneer de bron nagekeken is: wie enkel als overgenomen adres in de lijst stond, valt er bij de volgende sync uit.`,
    importedHelp:
      "Wanneer de bronnen dezelfde mensen opleveren, mogen de adressen die bij het overnemen meekwamen weg.",
    removeSourceTitle: "Bron verwijderen?",
    removeSourceDescription: (name: string) =>
      `De leden van ${name} vallen bij de volgende synchronisatie uit ${email}, tenzij ze er ook via een andere bron of als los lid in staan.`,
    yearly: "Jaargroepen",
    yearlyHelp:
      "Zoals activiteiten_2627@vtk.be in activiteiten@vtk.be: elk werkingsjaar een eigen groep met de leden van de post van dat jaar. De sync maakt de groep van dit jaar aan, die van volgend jaar zodra daar iemand in de post staat, en hangt op 15 juli de nieuwe in de plaats van de oude. Oude jaargroepen blijven bestaan als archief.",
    yearlyTemplate: "Adres van de jaargroep",
    yearlyTemplateHelp: "Met {jj} voor 2627 of {jaar} voor 2026.",
    yearlyPost: "Post",
    noPost: "Geen jaargroepen",
    searchPost: "Zoek een post",
    noPostMatch: (q: string) => `Geen post gevonden voor "${q}".`,
    yearlyNow: (address: string) => `Dit werkingsjaar: ${address}`,
    yearlyCurrent: "hangt erin",
    yearlyNext: "vanaf 15 juli",
    yearlyArchive: "archief",
    membersCount: (n: number) => `${n} ${n === 1 ? "lid" : "leden"}`,
    settings: "Instellingen",
    name: "Naam",
    description: "Omschrijving",
    descriptionPlaceholder: "Waarvoor dient dit adres?",
    email: "Adres",
    category: "Categorie",
    noCategory: "Zonder categorie",
    searchCategory: "Zoek een categorie",
    noCategoryMatch: (q: string) => `Geen categorie "${q}". Maak ze aan op het overzicht.`,
    categoryHelp: "Enkel voor het overzicht; zegt niets over wie erin zit.",
    owner: "Beheerd door werkgroep",
    noOwner: "Geen (enkel IT)",
    ownerHelp: "Die werkgroep zet dan zelf leden in en uit. Haar leden krijgen in deze lijst hun werkgroepadres.",
    external: "Mail van buiten vtk.be toelaten",
    externalHelp:
      "Aan voor elk adres waar bedrijven, profs of studenten naartoe mailen. Uit: enkel adressen van vtk.be mogen posten.",
    enabled: "De site beheert dit adres",
    enabledHelp: "Uit: de sync raakt de groep in Google niet meer aan, maar de regel blijft hier staan.",
    save: "Opslaan",
    saving: "Bezig met opslaan...",
    saved: "Opgeslagen.",
    saveFailed: "Opslaan is mislukt.",
    dangerHelp:
      "Loskoppelen haalt enkel de regel hier weg; de groep blijft in Google. Verwijderen haalt de groep ook in Google weg.",
    unlinkTitle: "Groepsadres loskoppelen?",
    unlinkDescription:
      "De regel verdwijnt hier, met haar bronnen en losse leden. De groep in Google blijft bestaan met haar huidige leden en haar archief; de site beheert ze enkel niet meer. Je kan ze later opnieuw overnemen.",
    unlink: "Loskoppelen",
    deleteTitle: `${email} verwijderen uit Google?`,
    deleteDescription: (n: number, active: number) =>
      `De groep verdwijnt in Google, met haar aliassen en het archief van haar berichten, en de regel hier op de site. Mail naar ${email} komt daarna terug als onbestelbaar.${
        active > 0 ? ` Let op: ${active} van de ${n} leden ${active === 1 ? "is" : "zijn"} nog actief.` : ""
      } Wat blijft: de accounts van de leden, en wie erin zat in het adminlogboek. Terugzetten kan niet vanuit de site.`,
    delete: "Verwijderen uit Google",
    deleteFailed: "Verwijderen is mislukt.",
  };
}

function EN(email: string): Texts {
  return {
    summary: (n: number, active: number, sources: string[], loose: number) => {
      const src = sources.length ? `Follows ${listEn(sources)}` : "No sources";
      const lo = loose
        ? `${sources.length ? ", plus" : ", only"} ${loose} loose ${loose === 1 ? "address" : "addresses"}`
        : "";
      return `${n} ${n === 1 ? "member" : "members"}, ${active} still active. ${src}${lo}.`;
    },
    members: "Members",
    all: "All",
    stillActive: "Still active",
    notActive: "Not active",
    ownersNote: "Owners and managers of the group are not shown: the site never touches them.",
    noMembers: "Nobody. Add a member, or set a source in the Sources tab.",
    noneForFilter: "Nobody for this filter.",
    unlinked: (n: number) =>
      `${n} ${n === 1 ? "member belongs" : "members belong"} in it without a linked @vtk.be address and ${n === 1 ? "is" : "are"} therefore not in it`,
    unlinkedHelp: "Link their account, or deliberately add their own address as a loose address.",
    importedNoSource:
      "Taken over from Google: everyone is in it as a loose address. If this list should follow a post, POC or work group, set it as a source and clear the imported addresses afterwards.",
    goToSources: "Go to Sources",
    addWhat: "What are you adding?",
    member: "Site member",
    address: "Email address",
    pickMember: "Pick a member",
    searchMember: "Search by name",
    noMemberMatch: (q: string) => `No member of your work group found for "${q}".`,
    kind: "Kind",
    include: "Include",
    exclude: "Exclude",
    note: "Note",
    colAddress: "Address",
    colWhy: "Why",
    colStatus: "Status",
    actions: "Actions",
    noAccount: "no @vtk.be account",
    excluded: "excluded",
    loose: "loose",
    viaSource: "via a source",
    viaYearly: "this year's yearly group",
    removeFromList: "Remove from the list",
    removeExclusion: "Remove exclusion",
    removeExtraTitle: "Remove from the list?",
    removeExtraDescription: (label: string) =>
      `${label} drops out of ${email} on the next synchronisation, unless it is in it through a source.`,
    removeExclusionTitle: "Remove exclusion?",
    removeExclusionDescription: (label: string) =>
      `${label} comes back into ${email} on the next synchronisation when a source yields it.`,
    sources: "Sources",
    sourcesHelp:
      "Everyone in this post, work group, kiesploeg or POC this working year. Whoever leaves drops out by itself; on 15 July everything follows.",
    noSources: "No sources: this list only has loose members.",
    noSourcesImported:
      "No source yet. This list only has the addresses that came along when taking over; set a post or POC as source if it should follow one.",
    addSource: "Add source",
    pickSource: "Pick a post, POC or kiesploeg",
    searchSource: "Search, e.g. activities or POC",
    noSourceMatch: (q: string) => `No source found for "${q}".`,
    onlyLead: "Only the lead",
    add: "Add",
    adding: "Adding...",
    added: "Added.",
    addFailed: "Adding failed.",
    removed: "Removed.",
    remove: "Remove",
    cancel: "Cancel",
    importedTitle: (n: number) => `Clear ${n} imported ${n === 1 ? "address" : "addresses"}`,
    importedDescription: (n: number) =>
      `The ${n} free addresses that came along when taking over from Google disappear from this list. Whoever is in it through a source or as a site member stays. Only do this once the source is checked: whoever was only in it as an imported address drops out on the next sync.`,
    importedHelp: "When the sources yield the same people, the addresses that came along when taking over can go.",
    removeSourceTitle: "Remove source?",
    removeSourceDescription: (name: string) =>
      `The members of ${name} drop out of ${email} on the next synchronisation, unless they are in it through another source or as a loose member.`,
    yearly: "Yearly groups",
    yearlyHelp:
      "Like activiteiten_2627@vtk.be inside activiteiten@vtk.be: a group per working year with that year's post members. The sync creates this year's group, next year's as soon as someone is in next year's post, and swaps the new one in for the old one on 15 July. Old yearly groups stay as an archive.",
    yearlyTemplate: "Address of the yearly group",
    yearlyTemplateHelp: "With {jj} for 2627 or {jaar} for 2026.",
    yearlyPost: "Post",
    noPost: "No yearly groups",
    searchPost: "Search a post",
    noPostMatch: (q: string) => `No post found for "${q}".`,
    yearlyNow: (address: string) => `This working year: ${address}`,
    yearlyCurrent: "is in it",
    yearlyNext: "from 15 July",
    yearlyArchive: "archive",
    membersCount: (n: number) => `${n} ${n === 1 ? "member" : "members"}`,
    settings: "Settings",
    name: "Name",
    description: "Description",
    descriptionPlaceholder: "What is this address for?",
    email: "Address",
    category: "Category",
    noCategory: "No category",
    searchCategory: "Search a category",
    noCategoryMatch: (q: string) => `No category "${q}". Create it on the overview.`,
    categoryHelp: "Only for the overview; says nothing about who is in it.",
    owner: "Managed by work group",
    noOwner: "None (IT only)",
    ownerHelp: "That work group then adds and removes members itself. Its members get their work group address in this list.",
    external: "Allow mail from outside vtk.be",
    externalHelp:
      "On for every address companies, professors or students mail. Off: only vtk.be addresses may post.",
    enabled: "The site manages this address",
    enabledHelp: "Off: the sync no longer touches the group in Google, but the rule stays here.",
    save: "Save",
    saving: "Saving...",
    saved: "Saved.",
    saveFailed: "Saving failed.",
    dangerHelp:
      "Unlinking only removes the rule here; the group stays in Google. Deleting also removes the group in Google.",
    unlinkTitle: "Unlink group address?",
    unlinkDescription:
      "The rule disappears here, with its sources and loose members. The group in Google keeps existing with its current members and its archive; the site simply stops managing it. You can take it over again later.",
    unlink: "Unlink",
    deleteTitle: `Delete ${email} from Google?`,
    deleteDescription: (n: number, active: number) =>
      `The group disappears in Google, with its aliases and message archive, and the rule here on the site. Mail to ${email} bounces afterwards.${
        active > 0 ? ` Note: ${active} of the ${n} members ${active === 1 ? "is" : "are"} still active.` : ""
      } What stays: the members' accounts, and who was in it in the admin log. It cannot be restored from the site.`,
    delete: "Delete from Google",
    deleteFailed: "Deleting failed.",
  };
}

function listNl(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} en ${items[items.length - 1]}`;
}
function listEn(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
