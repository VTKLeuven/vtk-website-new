import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import {
  DoorOpen,
  KeyRound,
  Plus,
  Power,
  PowerOff,
  ScanLine,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
  UserPlus,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import {
  addTicketUserGrantAction,
  createTicketGateAction,
  removeTicketUserGrantAction,
  revokeTicketScanDeviceAction,
  setTicketGateActiveAction,
} from "@/app/actions/tickets";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { StatusBadge } from "@/components/ticketing/admin/StatusBadge";
import {
  formatDateTime,
  formatNumber,
  type AdminLocale,
} from "@/components/ticketing/admin/format";

const ROLES = ["OWNER", "MANAGER", "FINANCE", "SCANNER", "REPORTER"] as const;

function roleLabel(role: (typeof ROLES)[number], locale: AdminLocale) {
  const labels: Record<(typeof ROLES)[number], [string, string]> = {
    OWNER: ["Eigenaar", "Owner"],
    MANAGER: ["Eventbeheerder", "Event manager"],
    FINANCE: ["Financieel beheer", "Finance"],
    SCANNER: ["Scanner", "Scanner"],
    REPORTER: ["Rapportering", "Reporting"],
  };
  return labels[role][locale === "nl" ? 0 : 1];
}

export default async function TicketAccessPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale: localeParam, eventId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  await requireTicketEventCapability(eventId, "MANAGE_ACCESS");

  const [userGrants, groupGrants, groups, gates, scanDevices] = await Promise.all([
    prisma.ticketEventUserGrant.findMany({
      where: { eventId },
      include: {
        user: { select: { id: true, name: true, email: true, active: true } },
        grantedBy: { select: { name: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.ticketEventGroupGrant.findMany({
      where: { eventId },
      include: {
        group: { select: { id: true, nameNl: true, nameEn: true } },
        grantedBy: { select: { name: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.group.findMany({
      select: { id: true, nameNl: true, nameEn: true },
      orderBy: { orderInPraesidium: "asc" },
    }),
    prisma.ticketGate.findMany({
      where: { eventId },
      include: {
        _count: { select: { scanLogs: true } },
        scanLogs: { select: { scannedAt: true }, orderBy: { scannedAt: "desc" }, take: 1 },
      },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    }),
    prisma.ticketScanDevice.findMany({
      where: { eventId },
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { scanLogs: true } },
      },
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const ownerCount = userGrants.filter((grant) => grant.role === "OWNER").length;
  const activeDeviceCount = scanDevices.filter((device) => !device.revokedAt).length;
  const activeGates = gates.filter((gate) => gate.active).length;

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <h1>{locale === "nl" ? "Toegang" : "Access"}</h1>
          <p>
            {locale === "nl"
              ? "Rollen voor medewerkers en poorten voor de scanner."
              : "Staff roles and scanner gates."}
          </p>
        </div>
        <Link className="ticket-admin-button" data-variant="primary" href={`/scan/${eventId}`}>
          <ScanLine aria-hidden="true" size={16} />
          {locale === "nl" ? "Scanner openen" : "Open scanner"}
        </Link>
      </div>

      <div className="ticket-admin-metrics">
        <AdminMetric icon={UserRoundCog} label={locale === "nl" ? "Personen" : "People"} value={formatNumber(userGrants.length, locale)} />
        <AdminMetric icon={UsersRound} label={locale === "nl" ? "Groepen" : "Groups"} value={formatNumber(groupGrants.length, locale)} />
        <AdminMetric icon={Smartphone} label={locale === "nl" ? "Scanapparaten" : "Scan devices"} value={formatNumber(activeDeviceCount, locale)} />
        <AdminMetric icon={DoorOpen} label={locale === "nl" ? "Actieve poorten" : "Active gates"} value={formatNumber(activeGates, locale)} />
      </div>

      <div className="ticket-admin-grid" data-columns="2">
        <section className="ticket-admin-section" aria-labelledby="person-access-heading">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon"><UserPlus aria-hidden="true" size={17} /></span>
              <div>
                <h2 id="person-access-heading">{locale === "nl" ? "Persoon toegang geven" : "Grant person access"}</h2>
                <p>{locale === "nl" ? "Op basis van het VTK-account" : "Based on the VTK account"}</p>
              </div>
            </div>
          </div>
          <form action={addTicketUserGrantAction} className="ticket-admin-form">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="eventId" value={eventId} />
            <div className="ticket-admin-field">
              <label htmlFor="grant-user-email">E-mail</label>
              <input id="grant-user-email" name="email" type="email" autoComplete="off" required />
            </div>
            <div className="ticket-admin-field">
              <label htmlFor="grant-user-role">{locale === "nl" ? "Rol" : "Role"}</label>
              <select id="grant-user-role" name="role" defaultValue="MANAGER">
                {ROLES.map((role) => <option key={role} value={role}>{roleLabel(role, locale)}</option>)}
              </select>
            </div>
            <button className="ticket-admin-button" data-variant="primary" type="submit">
              <Plus aria-hidden="true" size={16} />
              {locale === "nl" ? "Toegang opslaan" : "Save access"}
            </button>
          </form>
        </section>

        <section className="ticket-admin-section" aria-labelledby="group-access-heading">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon"><UsersRound aria-hidden="true" size={17} /></span>
              <div>
                <h2 id="group-access-heading">{locale === "nl" ? "Groep toegang geven" : "Grant group access"}</h2>
                <p>{locale === "nl" ? "Voor alle leden of alleen groepsverantwoordelijken" : "For all members or group leads only"}</p>
              </div>
            </div>
          </div>
          <form action={addTicketUserGrantAction} className="ticket-admin-form">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="eventId" value={eventId} />
            <div className="ticket-admin-form-grid">
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="grant-group">{locale === "nl" ? "Groep" : "Group"}</label>
                <select id="grant-group" name="groupId" required>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{locale === "en" ? group.nameEn : group.nameNl}</option>
                  ))}
                </select>
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="grant-group-role">{locale === "nl" ? "Rol" : "Role"}</label>
                <select id="grant-group-role" name="role" defaultValue="MANAGER">
                  {ROLES.map((role) => <option key={role} value={role}>{roleLabel(role, locale)}</option>)}
                </select>
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="grant-group-scope">{locale === "nl" ? "Bereik" : "Scope"}</label>
                <select id="grant-group-scope" name="scope" defaultValue="LEADS_ONLY">
                  <option value="LEADS_ONLY">{locale === "nl" ? "Alleen verantwoordelijken" : "Group leads only"}</option>
                  <option value="ALL_MEMBERS">{locale === "nl" ? "Alle groepsleden" : "All group members"}</option>
                </select>
              </div>
            </div>
            <button className="ticket-admin-button" data-variant="primary" type="submit">
              <Plus aria-hidden="true" size={16} />
              {locale === "nl" ? "Groepstoegang opslaan" : "Save group access"}
            </button>
          </form>
        </section>
      </div>

      <section className="ticket-admin-section" aria-labelledby="access-list-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><ShieldCheck aria-hidden="true" size={17} /></span>
            <div>
              <h2 id="access-list-heading">{locale === "nl" ? "Toegekende rollen" : "Assigned roles"}</h2>
              <p>{formatNumber(userGrants.length + groupGrants.length, locale)} {locale === "nl" ? "toekenningen" : "grants"}</p>
            </div>
          </div>
        </div>
        {userGrants.length + groupGrants.length === 0 ? (
          <AdminEmptyState icon={KeyRound} title={locale === "nl" ? "Nog geen toegang toegekend" : "No access granted yet"} />
        ) : (
          <div className="ticket-admin-access-groups">
            <div>
              <h3>{locale === "nl" ? "Personen" : "People"}</h3>
              <ul className="ticket-admin-list">
                {userGrants.map((grant) => {
                  const isLastOwner = grant.role === "OWNER" && ownerCount <= 1;
                  return (
                    <li key={grant.id}>
                      <div className="ticket-admin-row-head">
                        <div className="ticket-admin-person">
                          <span className="ticket-admin-avatar" aria-hidden="true">{grant.user.name.slice(0, 1).toUpperCase()}</span>
                          <div>
                            <p className="ticket-admin-row-title">{grant.user.name}</p>
                            <p className="ticket-admin-row-meta">{grant.user.email} · {roleLabel(grant.role, locale)}</p>
                            <p className="ticket-admin-row-meta">{locale === "nl" ? "Toegekend" : "Granted"} {formatDateTime(grant.createdAt, locale)}{grant.grantedBy?.name ? ` · ${grant.grantedBy.name}` : ""}</p>
                          </div>
                        </div>
                        <div className="ticket-admin-row-actions">
                          {!grant.user.active ? <StatusBadge status="INACTIVE" locale={locale} /> : null}
                          <form action={removeTicketUserGrantAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="eventId" value={eventId} />
                            <input type="hidden" name="grantId" value={grant.id} />
                            <button
                              className="ticket-admin-icon-button"
                              data-variant="danger"
                              type="submit"
                              disabled={isLastOwner}
                              aria-label={locale === "nl" ? "Toegang intrekken" : "Revoke access"}
                              title={isLastOwner ? (locale === "nl" ? "De laatste eigenaar kan niet verwijderd worden" : "The last owner cannot be removed") : (locale === "nl" ? "Toegang intrekken" : "Revoke access")}
                            >
                              <Trash2 aria-hidden="true" size={16} />
                            </button>
                          </form>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3>{locale === "nl" ? "Groepen" : "Groups"}</h3>
              <ul className="ticket-admin-list">
                {groupGrants.map((grant) => (
                  <li key={grant.id}>
                    <div className="ticket-admin-row-head">
                      <div>
                        <p className="ticket-admin-row-title">{locale === "en" ? grant.group.nameEn : grant.group.nameNl}</p>
                        <p className="ticket-admin-row-meta">{roleLabel(grant.role, locale)} · {grant.scope === "LEADS_ONLY" ? (locale === "nl" ? "Alleen verantwoordelijken" : "Group leads only") : (locale === "nl" ? "Alle leden" : "All members")}</p>
                        <p className="ticket-admin-row-meta">{locale === "nl" ? "Toegekend" : "Granted"} {formatDateTime(grant.createdAt, locale)}{grant.grantedBy?.name ? ` · ${grant.grantedBy.name}` : ""}</p>
                      </div>
                      <form action={removeTicketUserGrantAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="grantId" value={grant.id} />
                        <input type="hidden" name="kind" value="group" />
                        <button className="ticket-admin-icon-button" data-variant="danger" type="submit" aria-label={locale === "nl" ? "Groepstoegang intrekken" : "Revoke group access"} title={locale === "nl" ? "Groepstoegang intrekken" : "Revoke group access"}>
                          <Trash2 aria-hidden="true" size={16} />
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="ticket-admin-section" aria-labelledby="gates-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><DoorOpen aria-hidden="true" size={17} /></span>
            <div>
              <h2 id="gates-heading">{locale === "nl" ? "Poorten" : "Gates"}</h2>
              <p>{locale === "nl" ? "Kies een poort bij het starten van de scanner." : "Select a gate when starting the scanner."}</p>
            </div>
          </div>
        </div>
        <div className="ticket-admin-grid" data-columns="access">
          <div>
            {gates.length === 0 ? (
              <AdminEmptyState icon={DoorOpen} title={locale === "nl" ? "Nog geen poorten" : "No gates yet"} />
            ) : (
              <ul className="ticket-admin-list">
                {gates.map((gate) => (
                  <li key={gate.id}>
                    <div className="ticket-admin-row-head">
                      <div>
                        <p className="ticket-admin-row-title">{gate.name}</p>
                        <p className="ticket-admin-row-meta ticket-admin-code">{gate.code}</p>
                        <p className="ticket-admin-row-meta">{formatNumber(gate._count.scanLogs, locale)} scans{gate.scanLogs[0] ? ` · ${locale === "nl" ? "laatste" : "latest"} ${formatDateTime(gate.scanLogs[0].scannedAt, locale)}` : ""}</p>
                      </div>
                      <div className="ticket-admin-row-actions">
                        <StatusBadge status={gate.active ? "ACTIVE" : "INACTIVE"} locale={locale} />
                        <form action={setTicketGateActiveAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="eventId" value={eventId} />
                          <input type="hidden" name="gateId" value={gate.id} />
                          <input type="hidden" name="active" value={gate.active ? "false" : "true"} />
                          <button
                            className="ticket-admin-icon-button"
                            type="submit"
                            disabled={gate.active && activeGates <= 1}
                            aria-label={gate.active ? (locale === "nl" ? "Poort deactiveren" : "Deactivate gate") : (locale === "nl" ? "Poort activeren" : "Activate gate")}
                            title={gate.active && activeGates <= 1 ? (locale === "nl" ? "De laatste actieve poort kan niet gedeactiveerd worden" : "The last active gate cannot be deactivated") : gate.active ? (locale === "nl" ? "Poort deactiveren" : "Deactivate gate") : (locale === "nl" ? "Poort activeren" : "Activate gate")}
                          >
                            {gate.active ? <PowerOff aria-hidden="true" size={16} /> : <Power aria-hidden="true" size={16} />}
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form action={createTicketGateAction} className="ticket-admin-form ticket-admin-gate-form">
            <h3>{locale === "nl" ? "Poort toevoegen" : "Add gate"}</h3>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="eventId" value={eventId} />
            <div className="ticket-admin-field">
              <label htmlFor="gate-name">{locale === "nl" ? "Naam" : "Name"}</label>
              <input id="gate-name" name="name" placeholder={locale === "nl" ? "Hoofdingang" : "Main entrance"} required />
            </div>
            <div className="ticket-admin-field">
              <label htmlFor="gate-code">Code</label>
              <input id="gate-code" name="code" placeholder="MAIN" pattern="[A-Za-z0-9_-]+" required />
            </div>
            <button className="ticket-admin-button" data-variant="primary" type="submit">
              <Plus aria-hidden="true" size={16} />
              {locale === "nl" ? "Poort toevoegen" : "Add gate"}
            </button>
          </form>
        </div>
      </section>

      <section className="ticket-admin-section" aria-labelledby="scan-devices-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><Smartphone aria-hidden="true" size={17} /></span>
            <div>
              <h2 id="scan-devices-heading">{locale === "nl" ? "Scanapparaten" : "Scan devices"}</h2>
              <p>
                {formatNumber(activeDeviceCount, locale)} {locale === "nl" ? "actief gekoppeld voor audit" : "actively linked for auditing"}
              </p>
            </div>
          </div>
        </div>
        {scanDevices.length === 0 ? (
          <AdminEmptyState icon={Smartphone} title={locale === "nl" ? "Geen gekoppelde apparaten" : "No linked devices"} />
        ) : (
          <ul className="ticket-admin-list">
            {scanDevices.map((device) => (
              <li key={device.id}>
                <div className="ticket-admin-row-head">
                  <div className="ticket-admin-person">
                    <span className="ticket-admin-device-icon"><Smartphone aria-hidden="true" size={17} /></span>
                    <div>
                      <p className="ticket-admin-row-title">{device.label}</p>
                      <p className="ticket-admin-row-meta">
                        {formatNumber(device._count.scanLogs, locale)} scans · {locale === "nl" ? "laatst gezien" : "last seen"} {formatDateTime(device.lastSeenAt, locale)}
                      </p>
                      <p className="ticket-admin-row-meta">
                        {locale === "nl" ? "Gekoppeld" : "Linked"} {formatDateTime(device.createdAt, locale)}{device.createdBy?.name ? ` · ${device.createdBy.name}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="ticket-admin-row-actions">
                    <StatusBadge status={device.revokedAt ? "INACTIVE" : "ACTIVE"} locale={locale} />
                    {!device.revokedAt ? (
                      <form action={revokeTicketScanDeviceAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="deviceId" value={device.id} />
                        <button
                          className="ticket-admin-icon-button"
                          data-variant="danger"
                          type="submit"
                          aria-label={locale === "nl" ? "Apparaat-ID blokkeren" : "Block device identifier"}
                          title={locale === "nl" ? "Apparaat-ID blokkeren" : "Block device identifier"}
                        >
                          <ShieldOff aria-hidden="true" size={16} />
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
