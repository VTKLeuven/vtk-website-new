import "server-only";

import { PERMISSIONS, isPermission, type Permission } from "@vtk/auth";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { prisma } from "@vtk/db";

export type McpPrincipal = {
  clientName: string;
  permissions: ReadonlySet<Permission>;
  allPermissions: boolean;
  groupCodes: ReadonlySet<string>;
  allGroups: boolean;
  roleCodes: ReadonlySet<string>;
};

export type McpPermissionPolicy = {
  reads: readonly string[];
  creates: readonly string[];
  blocked: readonly string[];
};

/**
 * Expliciete MCP-dekking voor elke canonieke applicatiepermissie. Door
 * `satisfies Record<Permission, ...>` breekt typecheck zodra iemand een nieuwe
 * websitepermissie toevoegt zonder bewust te beslissen wat MCP ermee mag.
 */
export const MCP_PERMISSION_POLICY = {
  "pages.edit": { reads: ["pages"], creates: ["app_create:page"], blocked: ["update page content"] },
  "pages.editAll": { reads: ["pages"], creates: ["app_create:page"], blocked: ["update page content"] },
  "pages.manage": { reads: ["pages", "navigation"], creates: ["app_create:page"], blocked: ["reorder or move pages"] },
  "pages.publish": { reads: ["pages"], creates: [], blocked: ["publish or unpublish pages"] },
  "pages.delete": { reads: ["pages"], creates: [], blocked: ["delete pages"] },
  "header.manage": { reads: ["navigation"], creates: ["app_create:header_tab", "app_create:header_link"], blocked: ["update, reorder or delete navigation"] },
  "calendar.create": { reads: ["calendar"], creates: ["app_create:calendar_event", "calendar_create_event"], blocked: ["update or delete events"] },
  "calendar.manageAll": { reads: ["calendar"], creates: ["app_create:calendar_event", "app_create:calendar_category", "calendar_create_event", "calendar_create_category"], blocked: ["update, publish or delete events"] },
  "tickets.create": { reads: ["tickets"], creates: ["app_create:ticket_event", "app_create:ticket_type", "app_create:ticket_question", "app_create:ticket_gate"], blocked: ["publish, sell, scan or refund tickets"] },
  "tickets.manageAll": { reads: ["tickets", "ticket_orders"], creates: ["app_create:ticket_event", "app_create:ticket_type", "app_create:ticket_question", "app_create:ticket_gate"], blocked: ["publish, sell, scan, resend or refund tickets"] },
  "forms.create": { reads: ["forms"], creates: ["app_create:form", "app_create:form_section", "app_create:form_field"], blocked: ["publish forms or submit entries"] },
  "forms.manageAll": { reads: ["forms", "form_entries"], creates: ["app_create:form", "app_create:form_section", "app_create:form_field"], blocked: ["publish forms, submit entries or send mail"] },
  "photos.upload": { reads: ["photos"], creates: ["app_create:photo_album"], blocked: ["upload assets or publish albums"] },
  "photos.manageAlbums": { reads: ["photos"], creates: ["app_create:photo_album"], blocked: ["modify, publish or delete albums"] },
  "users.search": { reads: ["user_search"], creates: [], blocked: ["create or modify accounts"] },
  "users.view": { reads: ["users"], creates: [], blocked: ["create or modify accounts"] },
  "users.edit": { reads: ["users"], creates: [], blocked: ["create, modify or deactivate accounts"] },
  "users.bulkImport": { reads: ["users"], creates: [], blocked: ["bulk-import accounts"] },
  "groups.manage": { reads: ["groups"], creates: ["app_create:group(PRAESIDIUM)"], blocked: ["modify memberships or grants"] },
  "werkgroepen.manage": { reads: ["groups"], creates: ["app_create:group(WERKGROEP)"], blocked: ["modify memberships or grants"] },
  "roles.manage": { reads: ["roles"], creates: ["app_create:role"], blocked: ["assign roles or permissions"] },
  "mailinglists.export": { reads: ["mailing_lists"], creates: [], blocked: ["send mail or change subscriptions"] },
  "pocs.manage": { reads: ["pocs"], creates: ["app_create:poc"], blocked: ["add representatives, update or delete POCs"] },
  "partners.manage": { reads: ["partners"], creates: ["app_create:partner"], blocked: ["upload logos, update or delete partners"] },
  "home.edit": { reads: ["announcements", "editorial_settings"], creates: ["app_create:announcement"], blocked: ["activate announcements or overwrite homepage settings"] },
  // Een pushbericht gaat rechtstreeks naar de telefoons van de leden en is niet
  // terug te nemen. Dat is geen `create` maar een operationeel neveneffect, dus
  // MCP mag het onder geen enkele voorwaarde.
  "app.push": { reads: [], creates: [], blocked: ["send push notifications"] },
  "openingHours.manageOwn": { reads: ["editorial_settings"], creates: [], blocked: ["overwrite opening hours"] },
  "media.manage": { reads: ["editorial_settings", "photos"], creates: ["app_create:photo_album"], blocked: ["upload or overwrite media settings"] },
  "dashboard.manage": { reads: ["dashboard"], creates: ["app_create:dashboard_tile"], blocked: ["update or delete dashboard tiles"] },
  "dashboard.manageOwn": { reads: ["dashboard"], creates: ["app_create:dashboard_tile(GROUP)"], blocked: ["update or delete dashboard tiles"] },
  "shortlinks.manage": { reads: ["shortlinks"], creates: ["app_create:short_link"], blocked: ["enable, update or delete short links"] },
  "shift.edit": { reads: ["shifts"], creates: ["app_create:shift"], blocked: ["update shifts or enrol participants"] },
  "shift.reward": { reads: ["shifts"], creates: [], blocked: ["pay shift rewards"] },
  "shift.ranking": { reads: ["shift_ranking"], creates: [], blocked: [] },
  "theokot.manage": { reads: ["theokot"], creates: ["app_create:theokot_product", "app_create:theokot_session"], blocked: ["open sessions, ban users or alter orders"] },
  "theokot.pickup": { reads: ["theokot"], creates: [], blocked: ["mark orders picked up or redeem vouchers"] },
  "grocomeet.reserve": { reads: ["meeting_schedule"], creates: [], blocked: ["reserve products or incur a payment"] },
  "grocomeet.manage": { reads: ["meetings"], creates: ["app_create:meeting(GROCOMEET)"], blocked: ["reserve products, mark payments or alter stock"] },
  "bureau.manage": { reads: ["meetings"], creates: ["app_create:meeting(BUREAU)"], blocked: ["reserve products or alter stock"] },
  "lesbezoeken.view": { reads: ["lesbezoek_calendar"], creates: [], blocked: [] },
  "lesbezoeken.manage": { reads: ["lesbezoeken"], creates: ["app_create:lesbezoek_organisation", "app_create:lesbezoek", "app_create:lesbezoek_peculiarity"], blocked: ["approve, reject or send email"] },
  "piano.manage": { reads: ["piano"], creates: ["app_create:piano_window"], blocked: ["create closures, reserve or cancel slots"] },
  "logistiek.manage": { reads: ["logistiek"], creates: ["app_create:uitleen_category", "app_create:uitleen_item", "app_create:uitleen_event"], blocked: ["reserve stock, approve requests, move money or plan transport"] },
  "door.open": { reads: [], creates: [], blocked: ["open doors"] },
  "door.remoteOpen": { reads: [], creates: [], blocked: ["open doors remotely"] },
  "door.manage": { reads: ["door"], creates: [], blocked: ["grant access, create shortcut tokens or open doors"] },
  "fakscanner.manage": { reads: ["fakscanner"], creates: [], blocked: ["record scans, award drinks or overwrite configuration"] },
  "modules.logistiek.access": { reads: ["logistiek_catalog"], creates: [], blocked: ["change module access"] },
  "modules.cursusdienst.access": { reads: ["module_access"], creates: [], blocked: ["change module access"] },
  "oauth.client.edit": { reads: ["oauth_clients"], creates: ["app_create:oauth_client"], blocked: ["enable clients, reveal or rotate secrets, grant access or revoke tokens"] },
  // Groepsadressen bevatten de mailadressen van elk lid van een post, en de sync
  // schrijft rechtstreeks in Google. Niets van dit alles gaat via MCP.
  "mailgroups.manage": { reads: [], creates: [], blocked: ["read or change group addresses, their members or the Google Workspace link"] },
  "googleAccounts.manage": { reads: [], creates: [], blocked: ["create Google accounts, move users between org units or change mailbox settings"] },
  "kiesploeg.manage": { reads: [], creates: [], blocked: ["read or change the kiesploeg, its posts, members or addresses"] },
  "vault.editOwn": { reads: ["vault_metadata"], creates: [], blocked: ["read or write passwords"] },
  "vault.manage": { reads: ["vault_metadata"], creates: [], blocked: ["read or write passwords, link posts or synchronize Vaultwarden"] },
  "audit.view": { reads: ["audit_log"], creates: [], blocked: [] },
  "urenloopApp.manage": { reads: ["urenloop_app"], creates: [], blocked: ["grant download access, issue codes or revoke devices"] },
} as const satisfies Record<Permission, McpPermissionPolicy>;

export function parseConfiguredPermissions(raw: string | undefined): {
  allPermissions: boolean;
  permissions: Permission[];
} | null {
  const values = (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (values.length === 1 && values[0] === "*") {
    return { allPermissions: true, permissions: PERMISSIONS.map(({ code }) => code) };
  }
  if (values.some((value) => !isPermission(value))) return null;
  return { allPermissions: false, permissions: [...new Set(values)] as Permission[] };
}

function configuredCodes(raw: string | undefined): { all: boolean; values: string[] } {
  const values = (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return values.length === 1 && values[0] === "*"
    ? { all: true, values: [] }
    : { all: false, values: [...new Set(values)] };
}

export async function principalAuthExtra(): Promise<Record<string, unknown> | null> {
  const configured = parseConfiguredPermissions(process.env.MCP_PERMISSIONS);
  if (!configured) return null;
  const groups = configuredCodes(process.env.MCP_GROUP_CODES);
  const configuredRoles = configuredCodes(process.env.MCP_ROLE_CODES);
  if (!configured.allPermissions && configured.permissions.length === 0 && !configuredRoles.all && configuredRoles.values.length === 0) {
    return null;
  }

  const roles = configuredRoles.all || configuredRoles.values.length > 0
    ? await prisma.role.findMany({
        where: configuredRoles.all ? undefined : { code: { in: configuredRoles.values } },
        select: {
          code: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      })
    : [];
  if (!configuredRoles.all) {
    const found = new Set(roles.map(({ code }) => code));
    if (configuredRoles.values.some((code) => !found.has(code))) return null;
  }
  const rolePermissions = roles.flatMap((role) => role.permissions.map(({ permission }) => permission.code));
  if (rolePermissions.some((permission) => !isPermission(permission))) return null;
  const permissions = configured.allPermissions
    ? configured.permissions
    : [...new Set([...configured.permissions, ...rolePermissions])] as Permission[];
  return {
    permissions,
    allPermissions: configured.allPermissions,
    groupCodes: groups.values,
    allGroups: groups.all,
    roleCodes: roles.map(({ code }) => code),
  };
}

export function principalFromAuthInfo(authInfo: AuthInfo | undefined): McpPrincipal {
  const extra = authInfo?.extra ?? {};
  const permissions = Array.isArray(extra.permissions)
    ? extra.permissions.filter((value): value is Permission => typeof value === "string" && isPermission(value))
    : [];
  const strings = (value: unknown) => Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    clientName: authInfo?.clientId || "vtk-mcp-agent",
    permissions: new Set(permissions),
    allPermissions: extra.allPermissions === true,
    groupCodes: new Set(strings(extra.groupCodes)),
    allGroups: extra.allGroups === true,
    roleCodes: new Set(strings(extra.roleCodes)),
  };
}

export function hasMcpPermission(principal: McpPrincipal, permission: Permission): boolean {
  return principal.allPermissions || principal.permissions.has(permission);
}

export function hasAnyMcpPermission(principal: McpPrincipal, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasMcpPermission(principal, permission));
}

export function canUseMcpGroup(principal: McpPrincipal, groupCode: string): boolean {
  return principal.allGroups || principal.groupCodes.has(groupCode);
}

export function listMcpCapabilities(principal: McpPrincipal) {
  return {
    principal: {
      clientName: principal.clientName,
      allPermissions: principal.allPermissions,
      permissions: [...principal.permissions].sort(),
      allGroups: principal.allGroups,
      groupCodes: [...principal.groupCodes].sort(),
      roleCodes: [...principal.roleCodes].sort(),
    },
    permissions: PERMISSIONS.map((definition) => ({
      ...definition,
      granted: hasMcpPermission(principal, definition.code),
      policy: MCP_PERMISSION_POLICY[definition.code],
    })),
    invariant: "MCP exposes reads and explicit create-only tools; update, upsert, publish, delete and operational side effects are unavailable.",
  };
}
