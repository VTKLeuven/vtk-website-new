import { notFound } from "next/navigation";
import Link from "@/components/ui/Link";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getGoogleConfig } from "@/lib/google/config";
import { getChatSpace, type ChatSpace } from "@/lib/google/client";
import { directoryAddresses, type DirectoryAddresses } from "@/lib/google/aliases";
import { chatErrorCode, chatMembersOf, chatRoleLabel, type ChatMemberView } from "@/lib/google/chatSpaces";
import { ChatSetupHelp } from "../ChatSetupHelp";
import {
  AddChatMemberForm,
  ChatMemberRoleForm,
  DeleteChatSpaceButton,
  RemoveChatMemberButton,
  SpaceDetailsForm,
} from "../ChatSpaceForms";

/**
 * Eén chatruimte: haar gegevens, haar leden en groepen met hun rol, iemand
 * toevoegen, en de ruimte verwijderen. Leden komen van Chat als ids; de namen
 * en adressen haalt de pagina uit de directory (`chatMembersOf`).
 */
export default async function AdminChatSpace({
  params,
}: {
  params: Promise<{ locale: string; space: string }>;
}) {
  const { locale: localeParam, space: spaceId } = await params;
  if (!hasLocale(localeParam)) notFound();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(spaceId)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("mailgroups.manage");

  const back = `${nl ? "" : "/en"}/admin/groepsadressen/chatruimtes`;
  const cfg = await getGoogleConfig();
  if (!cfg) notFound();

  let space: ChatSpace | null = null;
  let members: ChatMemberView[] = [];
  let directory: DirectoryAddresses | null = null;
  let errorCode: string | null = null;
  let errorText: string | null = null;
  try {
    space = await getChatSpace(cfg, spaceId);
    if (space) {
      // Zonder directory toont de lijst ids in plaats van namen, maar ze werkt.
      directory = await directoryAddresses(cfg).catch(() => null);
      members = await chatMembersOf(cfg, spaceId, directory);
    }
  } catch (err) {
    errorCode = chatErrorCode(err);
    if (!errorCode) throw err;
    errorText = err instanceof Error ? err.message : String(err);
  }

  const backLink = (
    <Link href={back} className="text-sm text-[#5c667f] hover:text-vtk-ink">
      ← {nl ? "Alle chatruimtes" : "All chat spaces"}
    </Link>
  );

  if (errorCode) {
    return (
      <div className="space-y-4">
        {backLink}
        <ChatSetupHelp nl={nl} code={errorCode} detail={errorText} />
      </div>
    );
  }
  if (!space) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="text-sm text-vtk-ink">
          {nl ? "Deze ruimte bestaat niet (meer)." : "This space does not exist (anymore)."}
        </p>
      </div>
    );
  }

  const name = space.displayName || (nl ? "(zonder naam)" : "(unnamed)");
  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = (value?: string) => (value ? dateFmt.format(new Date(value)) : "-");
  const people = members.filter((member) => member.kind === "user").length;
  const groups = members.length - people;
  const options = (directory?.owners ?? []).map((owner) => ({ email: owner.email, name: owner.name }));
  const section = "space-y-3 rounded-xl border border-vtk-blue/15 bg-white p-4";

  return (
    <div className="space-y-6">
      {backLink}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-vtk-ink">{name}</h2>
          {space.spaceDetails?.description ? (
            <p className="mt-1 text-sm text-[#5c667f]">{space.spaceDetails.description}</p>
          ) : null}
        </div>
        {space.spaceUri ? (
          <a
            href={space.spaceUri}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/70"
          >
            {nl ? "Openen in Chat" : "Open in Chat"}
          </a>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-vtk-blue/15 bg-white p-4 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-xs uppercase tracking-wide text-[#5c667f]">{nl ? "Leden" : "Members"}</dt>
          <dd className="tabular-nums text-vtk-ink">
            {nl ? `${people} personen, ${groups} ${groups === 1 ? "groep" : "groepen"}` : `${people} people, ${groups} ${groups === 1 ? "group" : "groups"}`}
          </dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-xs uppercase tracking-wide text-[#5c667f]">{nl ? "Externe gebruikers" : "External users"}</dt>
          <dd className="text-vtk-ink">
            {space.externalUserAllowed ? (nl ? "Toegestaan" : "Allowed") : nl ? "Niet toegestaan" : "Not allowed"}
          </dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-xs uppercase tracking-wide text-[#5c667f]">{nl ? "Laatste activiteit" : "Last activity"}</dt>
          <dd className="tabular-nums text-vtk-ink">{date(space.lastActiveTime)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-xs uppercase tracking-wide text-[#5c667f]">{nl ? "Gemaakt" : "Created"}</dt>
          <dd className="tabular-nums text-vtk-ink">{date(space.createTime)}</dd>
        </div>
      </dl>

      <section className={section} aria-labelledby="space-members-heading">
        <h3 id="space-members-heading" className="font-medium text-vtk-ink">
          {nl ? "Leden en groepen" : "Members and groups"}
        </h3>
        <AddChatMemberForm nl={nl} spaceId={spaceId} domain={cfg.domain} options={options} />
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
                <th className="px-3 py-2 font-medium">{nl ? "Wie" : "Who"}</th>
                <th className="px-3 py-2 font-medium">{nl ? "Rol" : "Role"}</th>
                <th className="px-3 py-2">
                  <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const memberLabel = member.email ?? member.name;
                return (
                  <tr key={member.membershipName} className="border-b border-vtk-blue/10 last:border-0">
                    <td className="px-3 py-2">
                      <span className="text-vtk-ink">{member.name}</span>
                      <span className="block text-xs text-[#5c667f]">
                        {member.email ?? (nl ? "niet in de directory" : "not in the directory")}
                        {member.kind === "group" ? (nl ? " · groep" : " · group") : ""}
                        {member.invited ? (nl ? " · uitgenodigd" : " · invited") : ""}
                        {member.suspended ? (nl ? " · geschorst" : " · suspended") : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {member.kind === "user" ? (
                        <ChatMemberRoleForm
                          nl={nl}
                          spaceId={spaceId}
                          membership={member.membershipName}
                          memberLabel={memberLabel}
                          role={member.role}
                        />
                      ) : (
                        <span className="text-[#5c667f]">{chatRoleLabel(member.role, nl)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <RemoveChatMemberButton
                        nl={nl}
                        spaceId={spaceId}
                        membership={member.membershipName}
                        memberLabel={memberLabel}
                        isGroup={member.kind === "group"}
                        spaceName={name}
                      />
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-[#5c667f]">
                    {nl ? "Deze ruimte heeft geen leden." : "This space has no members."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={section} aria-labelledby="space-details-heading">
        <h3 id="space-details-heading" className="font-medium text-vtk-ink">
          {nl ? "Naam en beschrijving" : "Name and description"}
        </h3>
        <SpaceDetailsForm
          nl={nl}
          spaceId={spaceId}
          displayName={space.displayName ?? ""}
          description={space.spaceDetails?.description ?? ""}
          guidelines={space.spaceDetails?.guidelines ?? ""}
        />
      </section>

      <section className={section} aria-labelledby="space-delete-heading">
        <h3 id="space-delete-heading" className="font-medium text-vtk-ink">
          {nl ? "Ruimte verwijderen" : "Delete space"}
        </h3>
        <p className="text-sm text-[#5c667f]">
          {nl
            ? "Verwijdert de ruimte voor iedereen, met al haar berichten. Wil je enkel dat niemand er nog iets in zet, haal dan de leden eruit in plaats van de ruimte te verwijderen."
            : "Deletes the space for everyone, with all its messages. If you only want nobody to post there anymore, remove the members instead of deleting the space."}
        </p>
        <DeleteChatSpaceButton nl={nl} spaceId={spaceId} spaceName={name} members={people} />
      </section>
    </div>
  );
}
