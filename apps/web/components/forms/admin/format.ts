/**
 * Opmaakhelpers voor de formulierenadmin.
 *
 * Datums, getallen en het `datetime-local`-formaat komen ongewijzigd uit de
 * ticketadmin: dat zijn algemene helpers die toevallig daar geland zijn, en er
 * een tweede kopie van maken zou gegarandeerd uiteenlopen. De statuslabels zijn
 * wél van ons: die van ticketing gaan over verkoop en scannen.
 */
export {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  toDatetimeLocal,
  type AdminLocale,
} from "@/components/ticketing/admin/format";

import type { AdminLocale } from "@/components/ticketing/admin/format";

export function formBase(locale: AdminLocale) {
  return locale === "nl" ? "" : "/en";
}

const FORM_STATUS_LABELS: Record<string, [string, string]> = {
  DRAFT: ["Concept", "Draft"],
  PUBLISHED: ["Online", "Online"],
  CLOSED: ["Gesloten", "Closed"],
  ARCHIVED: ["Gearchiveerd", "Archived"],
};

const ENTRY_STATUS_LABELS: Record<string, [string, string]> = {
  SUBMITTED: ["Ingediend", "Submitted"],
  NEW: ["Nieuw", "New"],
  ACCEPTED: ["Geaccepteerd", "Accepted"],
  REJECTED: ["Geweigerd", "Rejected"],
};

export function formStatusLabel(status: string, locale: AdminLocale): string {
  const labels = FORM_STATUS_LABELS[status] ?? ENTRY_STATUS_LABELS[status];
  if (!labels) return status.replaceAll("_", " ").toLowerCase();
  return labels[locale === "nl" ? 0 : 1];
}

export function formStatusTone(status: string): "success" | "danger" | "neutral" | "warning" {
  if (status === "PUBLISHED" || status === "ACCEPTED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "DRAFT" || status === "ARCHIVED" || status === "CLOSED") return "neutral";
  return "warning";
}

const AUDIENCE_LABELS: Record<string, [string, string]> = {
  PUBLIC: ["Iedereen", "Everyone"],
  MEMBERS: ["Enkel ingelogde leden", "Logged-in members only"],
};

export function audienceLabel(audience: string, locale: AdminLocale): string {
  const labels = AUDIENCE_LABELS[audience];
  return labels ? labels[locale === "nl" ? 0 : 1] : audience;
}

const GRANT_ROLE_LABELS: Record<string, [string, string]> = {
  VIEWER: ["Lezer", "Viewer"],
  EDITOR: ["Bewerker", "Editor"],
  MANAGER: ["Beheerder", "Manager"],
};

export function grantRoleLabel(role: string, locale: AdminLocale): string {
  const labels = GRANT_ROLE_LABELS[role];
  return labels ? labels[locale === "nl" ? 0 : 1] : role;
}

const GRANT_ROLE_HELP: Record<string, [string, string]> = {
  VIEWER: ["Inzendingen lezen en exporteren", "Read and export entries"],
  EDITOR: [
    "Ook inzendingen bewerken, verwijderen en deelnemers mailen",
    "Also edit and delete entries, and mail participants",
  ],
  MANAGER: [
    "Ook het formulier zelf beheren: velden, instellingen en toegang",
    "Also manage the form itself: fields, settings and access",
  ],
};

export function grantRoleHelp(role: string, locale: AdminLocale): string {
  const labels = GRANT_ROLE_HELP[role];
  return labels ? labels[locale === "nl" ? 0 : 1] : "";
}
