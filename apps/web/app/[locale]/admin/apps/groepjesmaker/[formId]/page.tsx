import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet, Printer, Shuffle, TriangleAlert, UsersRound } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { loadGroupingView } from "@/lib/forms/grouping/view";
import type { GroupingWarning } from "@/lib/forms/grouping/algorithm";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import {
  AddLateEntrySelect,
  MoveMemberSelect,
  RunGroupingForm,
} from "@/components/forms/admin/GroupingForms";
import {
  formatDateTime,
  formatNumber,
  formBase,
  type AdminLocale,
} from "@/components/forms/admin/format";

function warningText(
  warning: GroupingWarning,
  names: ReadonlyMap<string, string>,
  locale: AdminLocale
): string {
  const nl = locale === "nl";
  const who = warning.entryId ? (names.get(warning.entryId) ?? warning.entryId) : "";
  const group = warning.group ?? "";
  const detail = warning.detail ?? "";
  switch (warning.code) {
    case "NO_ENTRIES":
      return nl ? "Er zijn nog geen inzendingen om in te delen." : "There are no entries to divide yet.";
    case "PARTNER_NOT_FOUND":
      return nl
        ? `${who} wil samen met "${detail}", maar die staat niet bij de inzendingen.`
        : `${who} wants to be with "${detail}", but no entry matches.`;
    case "PARTNER_AMBIGUOUS":
      return nl
        ? `${who} wil samen met "${detail}", maar dat past op meerdere inzendingen.`
        : `${who} wants to be with "${detail}", but that matches several entries.`;
    case "PARTNER_OTHER_ROLE":
      return nl
        ? `${who} wil samen met "${detail}", maar die ene is kern en de andere niet.`
        : `${who} wants to be with "${detail}", but one of them is core and the other is not.`;
    case "PARTNER_TOO_LARGE":
      return nl
        ? `${who} en "${detail}" samen zijn meer personen dan het maximum per groep.`
        : `${who} and "${detail}" together exceed the maximum per group.`;
    case "SIZE_INFEASIBLE":
      return nl
        ? `Met ${detail} personen lukt geen verdeling binnen het minimum en maximum per groep; sommige groepen vallen erbuiten.`
        : `With ${detail} people no division fits the minimum and maximum per group; some groups fall outside.`;
    case "GROUP_BOUNDS_CONFLICT":
      return nl
        ? "Het gevraagde aantal groepen past niet bij de groepsgrootte; het aantal groepen ging voor."
        : "The requested number of groups does not fit the group size; the number of groups won.";
    case "TOO_MANY_ANCHOR_TEAMS":
      return nl
        ? `Er schreven ${detail} kerngroepen in; elk kreeg een eigen groep, ook al zijn dat er meer dan de grenzen toelaten.`
        : `${detail} core teams registered; each got its own group, even though that is more than the limits allow.`;
    case "GROUP_TOO_SMALL":
      return nl
        ? `Groep ${group} heeft maar ${detail} personen.`
        : `Group ${group} has only ${detail} people.`;
    case "GROUP_TOO_LARGE":
      return nl
        ? `Groep ${group} heeft ${detail} personen, meer dan het maximum.`
        : `Group ${group} has ${detail} people, more than the maximum.`;
    case "ANCHORS_TOO_FEW":
      return nl
        ? `Groep ${group} heeft maar ${detail} kernleden.`
        : `Group ${group} has only ${detail} core members.`;
    case "ANCHORS_TOO_MANY":
      return nl
        ? `Groep ${group} heeft ${detail} kernleden, meer dan het maximum.`
        : `Group ${group} has ${detail} core members, more than the maximum.`;
  }
}

function closeReasonText(reason: string | null, autoRun: boolean, locale: AdminLocale): string {
  const nl = locale === "nl";
  if (!autoRun) {
    return nl
      ? "Automatisch indelen staat uit: deel in met de knop wanneer alle antwoorden binnen zijn."
      : "Automatic division is off: divide with the button once all answers are in.";
  }
  switch (reason) {
    case "CLOSED":
      return nl ? "De form is gesloten; de indeling volgt binnen de minuut." : "The form is closed; the division follows within a minute.";
    case "DEADLINE":
      return nl ? "Het sluitmoment is voorbij; de indeling volgt binnen de minuut." : "The closing time has passed; the division follows within a minute.";
    case "FULL":
      return nl ? "Het maximum aantal inzendingen is bereikt; de indeling volgt binnen de minuut." : "The entry limit is reached; the division follows within a minute.";
    case "EXPECTED":
      return nl ? "Het verwachte aantal personen is bereikt; de indeling volgt binnen de minuut." : "The expected number of people is reached; the division follows within a minute.";
    default:
      return nl
        ? "Wacht op de antwoorden: de form sluit en deelt in bij het sluitmoment, bij het maximum aantal inzendingen of bij het verwachte aantal personen."
        : "Waiting for the answers: the form closes and divides at the closing time, at the entry limit or at the expected number of people.";
  }
}

export default async function FormGroupingPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const nl = locale === "nl";
  const { capabilities } = await requireFormCapability(formId, "VIEW_GROUPING");
  const canManage = capabilities.includes("MANAGE_GROUPING");
  const base = formBase(locale);
  const view = await loadGroupingView(formId, locale);

  if (!view.grouping) {
    return (
      <div className="ticket-admin-page">
        <section className="ticket-admin-section">
          <AdminEmptyState
            icon={Shuffle}
            title={nl ? "Deze form heeft geen groepjesmaker" : "This form has no group maker"}
            description={
              nl
                ? "Maak er een vanuit de lijst van groepjesmakers."
                : "Create one from the list of group makers."
            }
            action={
              <Link
                className="ticket-admin-button"
                href={`${base}/admin/apps/groepjesmaker`}
              >
                {nl ? "Naar de groepjesmakers" : "To the group makers"}
              </Link>
            }
          />
        </section>
      </div>
    );
  }

  const { grouping, groups, ungrouped, stats, entryNames } = view;
  const groupOptions = groups.map((group) => ({ id: group.id, number: group.number }));
  const hasResult = grouping.ranAt != null;

  return (
    <div className="ticket-admin-page">
      <section className="ticket-admin-section" aria-labelledby="grouping-status-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <Shuffle aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="grouping-status-heading">{nl ? "Indeling" : "Division"}</h2>
              <p>
                {formatNumber(stats.entries, locale)} {nl ? "inzendingen" : "entries"},{" "}
                {formatNumber(stats.people, locale)} {nl ? "personen" : "people"}
              </p>
            </div>
          </div>
          {hasResult ? (
            <div className="ticket-admin-section-actions">
              {/* Twee formaten met twee doelen: de CSV om mee te werken in een
                  spreadsheet, de PDF om af te drukken en mee aan de deur te
                  staan (één pagina per groep). */}
              <a
                className="ticket-admin-icon-button"
                href={`/api/forms/${formId}/exports/groepjes?locale=${locale}`}
                aria-label={nl ? "Groepjes exporteren (CSV)" : "Export groups (CSV)"}
                title={nl ? "Groepjes exporteren (CSV)" : "Export groups (CSV)"}
              >
                <FileSpreadsheet aria-hidden="true" size={17} />
              </a>
              <a
                className="ticket-admin-icon-button"
                href={`/api/forms/${formId}/exports/groepjes/pdf?locale=${locale}`}
                aria-label={
                  nl ? "Afdruklijst per groep (PDF)" : "Printable list per group (PDF)"
                }
                title={nl ? "Afdruklijst per groep (PDF)" : "Printable list per group (PDF)"}
              >
                <Printer aria-hidden="true" size={17} />
              </a>
            </div>
          ) : null}
        </div>

        <dl className="form-grouping-facts">
          <div>
            <dt>{nl ? "Laatste indeling" : "Last division"}</dt>
            <dd>
              {grouping.ranAt
                ? `${formatDateTime(grouping.ranAt, locale)}${
                    grouping.ranByName
                      ? ` · ${grouping.ranByName}`
                      : nl
                        ? " · automatisch"
                        : " · automatic"
                  }`
                : nl
                  ? "Nog niet ingedeeld"
                  : "Not divided yet"}
            </dd>
          </div>
          {hasResult ? (
            <div>
              <dt>{nl ? "Handmatig verplaatst" : "Moved by hand"}</dt>
              <dd>{formatNumber(grouping.manualMoves, locale)}</dd>
            </div>
          ) : (
            <div>
              <dt>{nl ? "Automatisch" : "Automatic"}</dt>
              <dd>{closeReasonText(view.closeReason, grouping.autoRun, locale)}</dd>
            </div>
          )}
        </dl>

        {grouping.warnings.length > 0 ? (
          <ul className="form-grouping-warnings">
            {grouping.warnings.map((warning, index) => (
              <li key={index}>
                <TriangleAlert aria-hidden="true" size={14} />
                {warningText(warning, entryNames, locale)}
              </li>
            ))}
          </ul>
        ) : null}

        {canManage ? (
          <div className="form-grouping-actions">
            <RunGroupingForm
              locale={locale}
              formId={formId}
              hasResult={hasResult}
              manualMoves={grouping.manualMoves}
            />
          </div>
        ) : null}
      </section>

      {hasResult && ungrouped.length > 0 ? (
        <section className="ticket-admin-section" aria-labelledby="grouping-late-heading">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon">
                <TriangleAlert aria-hidden="true" size={17} />
              </span>
              <div>
                <h2 id="grouping-late-heading">{nl ? "Nog niet ingedeeld" : "Not divided yet"}</h2>
                <p>
                  {nl
                    ? "Deze inzendingen kwamen na de indeling binnen. Zet ze in een groep, of deel opnieuw in."
                    : "These entries came in after the division. Put them in a group, or divide again."}
                </p>
              </div>
            </div>
          </div>
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table">
              <thead>
                <tr>
                  <th scope="col">{nl ? "Naam" : "Name"}</th>
                  <th scope="col">{nl ? "Groep" : "Group"}</th>
                </tr>
              </thead>
              <tbody>
                {ungrouped.map((entry) => (
                  <tr key={entry.entryId}>
                    <td>{entry.name}</td>
                    <td>
                      {canManage ? (
                        <AddLateEntrySelect
                          locale={locale}
                          formId={formId}
                          entryId={entry.entryId}
                          name={entry.name}
                          groups={groupOptions}
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {groups.length > 0 ? (
        <div className="form-grouping-groups">
          {groups.map((group) => (
            <section
              key={group.id}
              className="ticket-admin-section form-grouping-group"
              aria-labelledby={`grouping-group-${group.number}`}
            >
              <div className="ticket-admin-section-head">
                <div className="ticket-admin-section-heading">
                  <span className="ticket-admin-section-icon">
                    <UsersRound aria-hidden="true" size={17} />
                  </span>
                  <div>
                    <h2 id={`grouping-group-${group.number}`}>
                      {nl ? "Groep" : "Group"} {group.number}
                    </h2>
                    <p>
                      {group.memberPeople} {nl ? "personen" : "people"}
                      {group.anchorPeople > 0
                        ? ` + ${group.anchorPeople} ${nl ? "kern" : "core"}`
                        : ""}
                    </p>
                  </div>
                </div>
              </div>
              {group.profile.length > 0 ? (
                <dl className="form-grouping-profile">
                  {group.profile.map((line) => (
                    <div key={line.label}>
                      <dt>{line.label}</dt>
                      <dd>{line.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {group.members.length === 0 ? (
                <p className="ticket-admin-empty">{nl ? "Lege groep" : "Empty group"}</p>
              ) : (
                <div className="ticket-admin-table-wrap">
                  <table className="ticket-admin-table">
                    <thead>
                      <tr>
                        <th scope="col">{nl ? "Naam" : "Name"}</th>
                        <th scope="col">{nl ? "Personen" : "People"}</th>
                        {canManage ? <th scope="col">{nl ? "Groep" : "Group"}</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {group.members.map((member) => (
                        <tr key={member.memberId}>
                          <td>
                            <span className="form-grouping-name">
                              {member.name}
                              {member.isAnchor ? (
                                <span className="ticket-admin-status" data-tone="success">
                                  {nl ? "Kern" : "Core"}
                                </span>
                              ) : null}
                            </span>
                            {member.companions.length > 0 ? (
                              <small className="form-grouping-companions">
                                {nl ? "met " : "with "}
                                {member.companions.join(", ")}
                              </small>
                            ) : null}
                          </td>
                          <td className="tabular-nums">{member.size}</td>
                          {canManage ? (
                            <td>
                              <MoveMemberSelect
                                locale={locale}
                                formId={formId}
                                memberId={member.memberId}
                                name={member.name}
                                currentGroupId={group.id}
                                groups={groupOptions}
                              />
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      ) : null}

    </div>
  );
}
