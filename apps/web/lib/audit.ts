import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vtk/db";
import { getActualSession } from "@/lib/session";

/**
 * Adminlogboek: wie deed wat in de admin.
 *
 * Eén regel per wijzigende beheerdersactie, te lezen in /admin/it/logboek. Het
 * is bewust een logboek en geen archief: regels ouder dan
 * {@link AUDIT_RETENTION_DAYS} worden gesnoeid.
 *
 * Wat wel: alles wat iemand anders' data of de site verandert (aanmaken,
 * wijzigen, verwijderen, toegang geven, publiceren, versturen).
 * Wat niet: leesacties, exports, testknoppen, en zelfbediening van een lid voor
 * zichzelf (eigen profiel, eigen dashboardtegels, eigen reservatie). Die zeggen
 * niets over wie in het beheer iets veranderde en zouden het logboek verzuipen.
 */

/** Hoe lang een regel bewaard blijft. */
export const AUDIT_RETENTION_DAYS = 30;

/**
 * Het werkwoord van de actie. Union, zodat een typo een compile-error is (zoals
 * bij `Permission`).
 */
export const AUDIT_ACTIONS = {
  create: { nl: "Aangemaakt", en: "Created" },
  update: { nl: "Gewijzigd", en: "Changed" },
  delete: { nl: "Verwijderd", en: "Deleted" },
  reorder: { nl: "Herschikt", en: "Reordered" },
  publish: { nl: "Gepubliceerd", en: "Published" },
  grant: { nl: "Toegang gegeven", en: "Access granted" },
  revoke: { nl: "Toegang ingetrokken", en: "Access revoked" },
  import: { nl: "Geïmporteerd", en: "Imported" },
  send: { nl: "Verstuurd", en: "Sent" },
  cancel: { nl: "Geannuleerd", en: "Cancelled" },
  refund: { nl: "Terugbetaald", en: "Refunded" },
  sync: { nl: "Gesynchroniseerd", en: "Synced" },
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/**
 * Het soort onderwerp. `group` is de admin-tab waar de actie thuishoort; die
 * groepering vult het filter in het logboek, zodat je "alles van Tickets" kan
 * bekijken zonder tien soorten aan te vinken.
 */
export const AUDIT_ENTITIES = {
  // Ledenbeheer
  user: { nl: "Gebruiker", en: "User", group: "users" },
  membership: { nl: "Postlidmaatschap", en: "Post membership", group: "users" },
  post: { nl: "Post", en: "Post", group: "users" },
  werkgroep: { nl: "Werkgroep", en: "Werkgroep", group: "users" },
  poc: { nl: "POC", en: "POC", group: "users" },
  role: { nl: "Rol", en: "Role", group: "roles" },
  rolePermission: { nl: "Rolrecht", en: "Role permission", group: "roles" },
  roleAssignment: { nl: "Roltoewijzing", en: "Role assignment", group: "roles" },

  // Website
  headerTab: { nl: "Header-item", en: "Header item", group: "content" },
  page: { nl: "Pagina", en: "Page", group: "pages" },
  pageAsset: { nl: "Paginabijlage", en: "Page download", group: "pages" },
  announcement: { nl: "Aankondiging", en: "Announcement", group: "home" },
  home: { nl: "Homepagina", en: "Homepage", group: "home" },
  frontpage: { nl: "Frontpage", en: "Front page", group: "home" },
  linkPage: { nl: "Linktree", en: "Linktree", group: "home" },
  partner: { nl: "Partner", en: "Partner", group: "home" },
  shortLink: { nl: "Verkorte link", en: "Short link", group: "shortlinks" },
  media: { nl: "Mediapagina", en: "Media page", group: "media" },
  photoAlbum: { nl: "Fotoalbum", en: "Photo album", group: "media" },
  dashboardTile: { nl: "Dashboardtegel", en: "Dashboard tile", group: "dashboard" },

  // Evenementen
  calendarEvent: { nl: "Evenement", en: "Event", group: "calendar" },
  calendarCategory: { nl: "Kalendercategorie", en: "Calendar category", group: "calendar" },
  ticketEvent: { nl: "Ticketevenement", en: "Ticket event", group: "tickets" },
  ticketType: { nl: "Tickettype", en: "Ticket type", group: "tickets" },
  ticketQuestion: { nl: "Ticketvraag", en: "Ticket question", group: "tickets" },
  ticketGate: { nl: "Scanpoort", en: "Scan gate", group: "tickets" },
  ticketAccess: { nl: "Ticketbeheerder", en: "Ticket manager", group: "tickets" },
  ticketOrder: { nl: "Ticketbestelling", en: "Ticket order", group: "tickets" },
  ticketDesign: { nl: "Ticketontwerp", en: "Ticket design", group: "tickets" },
  ticketTerms: { nl: "Ticketvoorwaarden", en: "Ticket terms", group: "tickets" },
  ticketScanDevice: { nl: "Scantoestel", en: "Scan device", group: "tickets" },

  // Formulieren
  form: { nl: "Formulier", en: "Form", group: "forms" },
  formField: { nl: "Formuliervraag", en: "Form field", group: "forms" },
  formSection: { nl: "Formuliersectie", en: "Form section", group: "forms" },
  formAccess: { nl: "Formulierbeheerder", en: "Form manager", group: "forms" },
  formEntry: { nl: "Inzending", en: "Entry", group: "forms" },
  formMailing: { nl: "Formuliermailing", en: "Form mailing", group: "forms" },

  // Werking
  shift: { nl: "Shift", en: "Shift", group: "shift" },
  shiftReward: { nl: "Shiftbonnetje", en: "Shift voucher", group: "shift" },
  theokotSession: { nl: "Theokotsessie", en: "Theokot session", group: "theokot" },
  theokotProduct: { nl: "Theokotproduct", en: "Theokot product", group: "theokot" },
  theokotOrder: { nl: "Theokotbestelling", en: "Theokot order", group: "theokot" },
  theokotBan: { nl: "Theokotban", en: "Theokot ban", group: "theokot" },
  theokotSettings: { nl: "Theokotinstelling", en: "Theokot setting", group: "theokot" },
  meeting: { nl: "Vergadering", en: "Meeting", group: "meetings" },
  meetingReservation: { nl: "Broodjesreservatie", en: "Sandwich reservation", group: "meetings" },
  lesbezoek: { nl: "Lesbezoek", en: "Classroom visit", group: "lesbezoeken" },
  lesbezoekOrganisation: { nl: "Lesbezoekorganisatie", en: "Classroom-visit organisation", group: "lesbezoeken" },
  lesbezoekPeculiarity: { nl: "Bijzonderheid lesbezoeken", en: "Classroom-visit note", group: "lesbezoeken" },
  lesbezoekSettings: { nl: "Lesbezoekeninstelling", en: "Classroom-visit setting", group: "lesbezoeken" },
  piano: { nl: "Piano", en: "Piano", group: "piano" },
  pianoReservation: { nl: "Pianoreservatie", en: "Piano reservation", group: "piano" },
  mailinglists: { nl: "Mailinglijsten", en: "Mailing lists", group: "mailinglists" },
  logistiek: { nl: "Uitleendienst", en: "Equipment rental", group: "logistiek" },
  vaultItem: { nl: "Kluiswachtwoord", en: "Vault password", group: "vault" },
  vaultPost: { nl: "Kluiskoppeling", en: "Vault link", group: "vault" },
  vaultAccess: { nl: "Kluistoegang", en: "Vault access", group: "vault" },

  // IT
  doorAccess: { nl: "Deurtoegang", en: "Door access", group: "door" },
  fakscanner: { nl: "Fakscanner", en: "Fakscanner", group: "fakscanner" },
  ssoClient: { nl: "SSO-client", en: "SSO client", group: "sso" },
  ssoPermission: { nl: "SSO-recht", en: "SSO permission", group: "sso" },
  itConfig: { nl: "IT-configuratie", en: "IT configuration", group: "it" },
  urenloopDownload: { nl: "24UL-app downloadlijst", en: "24UL app download list", group: "it" },
  appPush: { nl: "Pushbericht", en: "Push notification", group: "it" },
} as const;

export type AuditEntity = keyof typeof AUDIT_ENTITIES;

/** De tabgroepen, in de volgorde waarin het filter ze toont. */
export const AUDIT_GROUPS = {
  users: { nl: "Leden & posten", en: "Members & posts" },
  roles: { nl: "Rollen", en: "Roles" },
  content: { nl: "Menustructuur", en: "Menu structure" },
  pages: { nl: "Pagina's", en: "Pages" },
  home: { nl: "Homepagina", en: "Homepage" },
  shortlinks: { nl: "Verkorte links", en: "Short links" },
  media: { nl: "Media", en: "Media" },
  dashboard: { nl: "Dashboardtegels", en: "Dashboard tiles" },
  calendar: { nl: "Kalender", en: "Calendar" },
  tickets: { nl: "Tickets", en: "Tickets" },
  forms: { nl: "Formulieren", en: "Forms" },
  shift: { nl: "Shiften", en: "Shifts" },
  theokot: { nl: "Theokot", en: "Theokot" },
  meetings: { nl: "Grocomeet & Bureau", en: "Grocomeet & Bureau" },
  lesbezoeken: { nl: "Lesbezoeken", en: "Classroom visits" },
  piano: { nl: "Piano", en: "Piano" },
  mailinglists: { nl: "Mailinglijsten", en: "Mailing lists" },
  logistiek: { nl: "Uitleendienst", en: "Equipment rental" },
  vault: { nl: "Wachtwoordkluis", en: "Password vault" },
  door: { nl: "Deur", en: "Door" },
  fakscanner: { nl: "Fakscanner", en: "Fakscanner" },
  sso: { nl: "SSO", en: "SSO" },
  it: { nl: "IT-configuratie", en: "IT configuration" },
} as const;

export type AuditGroup = keyof typeof AUDIT_GROUPS;

export type AuditEntry = {
  action: AuditAction;
  entity: AuditEntity;
  /** Id van het onderwerp, voor "toon alles over dit ding". Mag ontbreken. */
  entityId?: string | null;
  /**
   * Hoe het onderwerp heette op het moment van de actie ("Career Fair"). Dit is
   * waar de zoekbalk op zoekt, dus zet er de naam in die iemand zou intypen,
   * niet een id.
   */
  target: string;
  /** Wat er precies gebeurde, bv. "titel en datum gewijzigd". Optioneel. */
  summary?: string | null;
};

/**
 * "titel, startdatum en locatie gewijzigd" — welke velden een bewerking effectief
 * raakte. Zonder dit zegt een update-regel enkel *dat* iemand iets bewerkte, wat
 * bij een pagina of een evenement de helft van de vraag is.
 *
 * Vergelijkt enkel de sleutels die in `labels` staan, zodat velden die altijd
 * meeschrijven (`updatedAt`, `createdById`) geen ruis maken.
 */
export function describeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
): string | null {
  const changed = Object.entries(labels)
    // `undefined` in `after` betekent "niet meegeschreven" (zo leest Prisma het
    // ook), niet "leeggemaakt". Zonder deze regel zou een gedeeltelijke update
    // elk veld dat ze niet aanraakt als gewijzigd melden.
    .filter(([key]) => after[key] !== undefined && !sameValue(before[key], after[key]))
    .map(([, label]) => label);

  if (changed.length === 0) return null;
  if (changed.length === 1) return `${changed[0]} gewijzigd`;
  const last = changed[changed.length - 1];
  return `${changed.slice(0, -1).join(", ")} en ${last} gewijzigd`;
}

/** Een lege string en `null` zijn voor een logregel hetzelfde: leeg. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const time = (v: unknown) => (v instanceof Date ? v.getTime() : v);
    return time(a) === time(b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => value === b[i]);
  }
  const empty = (v: unknown) => (v === "" ? null : v);
  return empty(a) === empty(b);
}

/** Knipt een waarde af zodat één regel nooit een halve pagina tekst wordt. */
function trim(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

/**
 * Schrijft één regel in het adminlogboek.
 *
 * Roep dit aan *nadat* de wijziging geslaagd is en vóór een eventuele
 * `redirect()` (die gooit). De actor is altijd de echt ingelogde gebruiker, ook
 * wanneer een superadmin in autorisatievoorbeeld-modus staat: het logboek moet
 * zeggen wie het deed, niet in wiens huid die persoon keek.
 *
 * Faalt nooit naar buiten toe: een kapotte logregel mag een geslaagde actie niet
 * ongedaan maken of de gebruiker een foutmelding tonen.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const session = await getActualSession();
    await writeAudit(entry, {
      actorId: session?.user.id ?? null,
      actorName: session?.user.name ?? "Systeem",
    });
  } catch (err) {
    console.error("[audit] kon actie niet loggen", err);
    Sentry.captureException(err);
  }
}

/**
 * Schrijft een auditregel voor een benoemde systeemintegratie zonder te doen
 * alsof ze een ingelogd lid is. De naam komt uit serverconfiguratie, nooit uit
 * request-input. Dit is onder meer de actor voor create-only MCP-tools.
 */
export async function logSystemAudit(entry: AuditEntry, actorName: string): Promise<void> {
  try {
    await writeAudit(entry, { actorId: null, actorName: actorName || "Systeem" });
  } catch (err) {
    console.error("[audit] kon systeemactie niet loggen", err);
    Sentry.captureException(err);
  }
}

async function writeAudit(
  entry: AuditEntry,
  actor: { actorId: string | null; actorName: string },
): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      actorId: actor.actorId,
      actorName: trim(actor.actorName, 200),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      target: trim(entry.target || "—", 200),
      summary: entry.summary ? trim(entry.summary, 500) : null,
    },
  });

  await maybePrune();
}

/** Verwijdert regels ouder dan de bewaartermijn. Geeft het aantal terug. */
export async function pruneAuditLog(): Promise<number> {
  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.adminAuditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}

/**
 * Snoeien hoort bij het schrijven, maar niet bij élke schrijfactie: één
 * `deleteMany` per logregel is zonde. Er is bewust geen cron voor; een timer per
 * proces is genoeg voor een tabel die enkel door beheerders gevuld wordt. De
 * logboekpagina snoeit ook zelf, dus zelfs een proces dat net herstart is loopt
 * niet achter.
 */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

async function maybePrune(): Promise<void> {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  await pruneAuditLog();
}
