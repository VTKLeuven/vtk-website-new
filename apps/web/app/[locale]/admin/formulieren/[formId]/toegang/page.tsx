import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { KeyRound, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { removeFormGrantAction } from "@/app/actions/forms";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { AddGroupGrantForm, AddUserGrantForm } from "@/components/forms/admin/GrantForms";
import {
  formatDateTime,
  grantRoleLabel,
  type AdminLocale,
} from "@/components/forms/admin/format";

export default async function FormAccessPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  await requireFormCapability(formId, "MANAGE_ACCESS");
  const nl = locale === "nl";

  const [userGrants, groupGrants, groups] = await Promise.all([
    prisma.formUserGrant.findMany({
      where: { formId },
      include: {
        user: { select: { name: true, email: true, active: true } },
        grantedBy: { select: { name: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.formGroupGrant.findMany({
      where: { formId },
      include: {
        group: { select: { nameNl: true, nameEn: true } },
        grantedBy: { select: { name: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.group.findMany({
      where: { active: true },
      select: { id: true, nameNl: true, nameEn: true },
      orderBy: { orderInPraesidium: "asc" },
    }),
  ]);

  const managerCount = userGrants.filter((grant) => grant.role === "MANAGER").length;

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-grid" data-columns="2">
        <section className="ticket-admin-section" aria-labelledby="person-access-heading">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon">
                <UserPlus aria-hidden="true" size={17} />
              </span>
              <div>
                <h2 id="person-access-heading">
                  {nl ? "Persoon toegang geven" : "Grant person access"}
                </h2>
                <p>{nl ? "Op basis van het VTK-account" : "Based on the VTK account"}</p>
              </div>
            </div>
          </div>
          <AddUserGrantForm locale={locale} formId={formId} />
        </section>

        <section className="ticket-admin-section" aria-labelledby="group-access-heading">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon">
                <UsersRound aria-hidden="true" size={17} />
              </span>
              <div>
                <h2 id="group-access-heading">{nl ? "Post toegang geven" : "Grant post access"}</h2>
                <p>
                  {nl
                    ? "Voor alle leden of enkel de verantwoordelijken"
                    : "For all members or only the leads"}
                </p>
              </div>
            </div>
          </div>
          <AddGroupGrantForm
            locale={locale}
            formId={formId}
            groups={groups.map((group) => ({
              id: group.id,
              name: locale === "en" ? group.nameEn : group.nameNl,
            }))}
          />
        </section>
      </div>

      <section className="ticket-admin-section" aria-labelledby="access-list-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <ShieldCheck aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="access-list-heading">{nl ? "Toegekende rollen" : "Assigned roles"}</h2>
              <p>
                {userGrants.length + groupGrants.length}{" "}
                {nl ? "toekenningen" : "grants"}
              </p>
            </div>
          </div>
        </div>

        {userGrants.length + groupGrants.length === 0 ? (
          <AdminEmptyState
            icon={KeyRound}
            title={nl ? "Nog geen toegang toegekend" : "No access granted yet"}
          />
        ) : (
          <div className="ticket-admin-access-groups">
            <div>
              <h3>{nl ? "Personen" : "People"}</h3>
              <ul className="ticket-admin-list">
                {userGrants.map((grant) => {
                  const lastManager = grant.role === "MANAGER" && managerCount <= 1;
                  return (
                    <li key={grant.id}>
                      <div className="ticket-admin-row-head">
                        <div className="ticket-admin-person">
                          <span className="ticket-admin-avatar" aria-hidden="true">
                            {grant.user.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <p className="ticket-admin-row-title">{grant.user.name}</p>
                            <p className="ticket-admin-row-meta">
                              {grant.user.email} · {grantRoleLabel(grant.role, locale)}
                            </p>
                            <p className="ticket-admin-row-meta">
                              {nl ? "Toegekend" : "Granted"}{" "}
                              {formatDateTime(grant.createdAt, locale)}
                              {grant.grantedBy?.name ? ` · ${grant.grantedBy.name}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="ticket-admin-row-actions">
                          {lastManager ? (
                            <span className="ticket-admin-status" data-tone="neutral">
                              {nl ? "Laatste beheerder" : "Last manager"}
                            </span>
                          ) : (
                            <DeleteIconButton
                              action={removeFormGrantAction}
                              fields={{ locale, formId, grantId: grant.id, kind: "user" }}
                              label={nl ? "Toegang intrekken" : "Revoke access"}
                              srLabel={`${nl ? "Toegang intrekken" : "Revoke access"}: ${grant.user.name}`}
                              title={nl ? "Toegang intrekken?" : "Revoke access?"}
                              description={
                                nl
                                  ? `${grant.user.name} verliest de toegang tot dit formulier en zijn inzendingen. De inzendingen zelf blijven staan.`
                                  : `${grant.user.name} loses access to this form and its entries. The entries themselves stay.`
                              }
                              confirmLabel={nl ? "Intrekken" : "Revoke"}
                              cancelLabel={nl ? "Annuleren" : "Cancel"}
                              successMessage={nl ? "Toegang ingetrokken" : "Access revoked"}
                            />
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h3>{nl ? "Posten" : "Posts"}</h3>
              {groupGrants.length === 0 ? (
                <p className="ticket-admin-empty">
                  {nl ? "Nog geen post toegevoegd." : "No post added yet."}
                </p>
              ) : (
                <ul className="ticket-admin-list">
                  {groupGrants.map((grant) => (
                    <li key={grant.id}>
                      <div className="ticket-admin-row-head">
                        <div>
                          <p className="ticket-admin-row-title">
                            {locale === "en" ? grant.group.nameEn : grant.group.nameNl}
                          </p>
                          <p className="ticket-admin-row-meta">
                            {grantRoleLabel(grant.role, locale)} ·{" "}
                            {grant.scope === "LEADS_ONLY"
                              ? nl
                                ? "Alleen de verantwoordelijken"
                                : "Post leads only"
                              : nl
                                ? "Alle leden"
                                : "All members"}
                          </p>
                          <p className="ticket-admin-row-meta">
                            {nl ? "Toegekend" : "Granted"} {formatDateTime(grant.createdAt, locale)}
                            {grant.grantedBy?.name ? ` · ${grant.grantedBy.name}` : ""}
                          </p>
                        </div>
                        <DeleteIconButton
                          action={removeFormGrantAction}
                          fields={{ locale, formId, grantId: grant.id, kind: "group" }}
                          label={nl ? "Posttoegang intrekken" : "Revoke post access"}
                          srLabel={`${nl ? "Posttoegang intrekken" : "Revoke post access"}: ${locale === "en" ? grant.group.nameEn : grant.group.nameNl}`}
                          title={nl ? "Posttoegang intrekken?" : "Revoke post access?"}
                          description={
                            nl
                              ? "Iedereen die enkel via deze post toegang had, verliest ze. Wie persoonlijk toegang kreeg, behoudt ze."
                              : "Everyone who only had access through this post loses it. Individual grants stay."
                          }
                          confirmLabel={nl ? "Intrekken" : "Revoke"}
                          cancelLabel={nl ? "Annuleren" : "Cancel"}
                          successMessage={nl ? "Toegang ingetrokken" : "Access revoked"}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
