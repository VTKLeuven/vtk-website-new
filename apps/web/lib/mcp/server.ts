import "server-only";

import {
  createMcpHandler,
  fromJsonSchema,
  McpServer,
  type JsonSchemaType,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { ZodError } from "zod";
import {
  getCalendarCategory,
  getCalendarEvent,
  getPage,
  listAnnouncements,
  listCalendarCategories,
  listCalendarEvents,
  listCalendarGroups,
  listNavigation,
  listPages,
  listPartners,
  McpInputError,
  type CreateCalendarCategoryInput,
  type CreateCalendarEventInput,
  type ListEventsInput,
  type ListPagesInput,
} from "@/lib/mcp/data";
import {
  createMcpRecord,
  listMcpCreateSchemas,
  MCP_CREATE_KINDS,
  type McpCreateInput,
} from "@/lib/mcp/create";
import {
  hasAnyMcpPermission,
  hasMcpPermission,
  listMcpCapabilities,
  principalFromAuthInfo,
} from "@/lib/mcp/policy";
import {
  adminRead,
  canReadMcpResource,
  MCP_READ_RESOURCES,
  type McpAdminReadInput,
} from "@/lib/mcp/read";

export const MCP_READ_TOOL_NAMES = [
  "system_list_capabilities",
  "app_read",
  "calendar_list_events",
  "calendar_get_event",
  "calendar_list_categories",
  "calendar_get_category",
  "calendar_list_groups",
  "site_list_pages",
  "site_get_page",
  "site_list_navigation",
  "site_list_partners",
  "site_list_announcements",
] as const;

export const MCP_CREATE_TOOL_NAMES = [
  "app_create",
  "calendar_create_event",
  "calendar_create_category",
] as const;

export const MCP_TOOL_NAMES = [...MCP_READ_TOOL_NAMES, ...MCP_CREATE_TOOL_NAMES] as const;

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const createAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const emptyObjectSchema = schema<Record<string, never>>({
  type: "object",
  properties: {},
  additionalProperties: false,
});

const eventIdSchema = schema<{ id: string }>({
  type: "object",
  properties: { id: { type: "string", minLength: 1, maxLength: 100 } },
  required: ["id"],
  additionalProperties: false,
});

const categorySlugSchema = schema<{ slug: string }>({
  type: "object",
  properties: { slug: { type: "string", minLength: 1, maxLength: 60 } },
  required: ["slug"],
  additionalProperties: false,
});

const pageSlugSchema = schema<{ slug: string }>({
  type: "object",
  properties: { slug: { type: "string", minLength: 1, maxLength: 160 } },
  required: ["slug"],
  additionalProperties: false,
});

const listEventsSchema = schema<ListEventsInput>({
  type: "object",
  properties: {
    from: { type: "string", format: "date-time", description: "Inclusieve ondergrens; events die hierna eindigen." },
    to: { type: "string", format: "date-time", description: "Inclusieve bovengrens; events die hiervoor starten." },
    publication: { type: "string", enum: ["all", "published", "draft"], default: "all" },
    visibility: { type: "string", enum: ["all", "PUBLIC", "MEMBERS"], default: "all" },
    groupCode: { type: "string", minLength: 1, maxLength: 80 },
    categorySlug: { type: "string", minLength: 1, maxLength: 60 },
    order: { type: "string", enum: ["asc", "desc"], default: "desc" },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
    offset: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
  },
  additionalProperties: false,
});

const listPagesSchema = schema<ListPagesInput>({
  type: "object",
  properties: {
    publication: { type: "string", enum: ["all", "published", "draft"], default: "all" },
    headerTabSlug: { type: "string", minLength: 1, maxLength: 80 },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
    offset: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
  },
  additionalProperties: false,
});

const appReadSchema = schema<McpAdminReadInput>({
  type: "object",
  properties: {
    resource: { type: "string", enum: [...MCP_READ_RESOURCES] },
    id: { type: "string", minLength: 1, maxLength: 160 },
    search: { type: "string", minLength: 1, maxLength: 160 },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
    offset: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
  },
  required: ["resource"],
  additionalProperties: false,
});

const appCreateSchema = schema<McpCreateInput>({
  type: "object",
  properties: {
    kind: { type: "string", enum: [...MCP_CREATE_KINDS] },
    data: {
      type: "object",
      description: "Kind-specifieke velden. Roep eerst system_list_capabilities aan voor het exacte JSON Schema.",
      additionalProperties: true,
    },
  },
  required: ["kind", "data"],
  additionalProperties: false,
});

const nullableText = (maxLength: number) => ({
  anyOf: [{ type: "string", maxLength }, { type: "null" }],
});

const createEventSchema = schema<CreateCalendarEventInput>({
  type: "object",
  properties: {
    titleNl: { type: "string", minLength: 1, maxLength: 200 },
    titleEn: nullableText(200),
    descriptionNl: nullableText(20000),
    descriptionEn: nullableText(20000),
    location: nullableText(300),
    groupCode: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "Bestaande groepscode uit calendar_list_groups.",
    },
    start: { type: "string", format: "date-time", description: "ISO 8601 met tijdzone-offset." },
    end: { type: "string", format: "date-time", description: "ISO 8601 met tijdzone-offset." },
    allDay: { type: "boolean", default: false },
    visibility: { type: "string", enum: ["PUBLIC", "MEMBERS"], default: "PUBLIC" },
    url: {
      ...nullableText(2048),
      description: "Een absolute http(s)-URL of een intern pad dat met / begint.",
    },
    categorySlugs: {
      type: "array",
      maxItems: 20,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 60 },
      default: [],
    },
    publish: {
      type: "boolean",
      const: false,
      default: false,
      description: "MCP maakt altijd een veilig concept; publiceren is niet beschikbaar.",
    },
  },
  required: ["titleNl", "groupCode", "start", "end"],
  additionalProperties: false,
});

const createCategorySchema = schema<CreateCalendarCategoryInput>({
  type: "object",
  properties: {
    slug: {
      type: "string",
      minLength: 1,
      maxLength: 60,
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    },
    nameNl: { type: "string", minLength: 1, maxLength: 60 },
    nameEn: { type: "string", minLength: 1, maxLength: 60 },
    descriptionNl: nullableText(10000),
    descriptionEn: nullableText(10000),
    colour: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", default: "#5C667F" },
    order: { type: "integer", minimum: 0, maximum: 999, default: 0 },
    showOnCalendarPage: { type: "boolean", default: true },
  },
  required: ["slug", "nameNl", "nameEn"],
  additionalProperties: false,
});

function schema<T>(value: object) {
  return fromJsonSchema<T>(value as JsonSchemaType);
}

function ok(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
  };
}

async function runTool(work: () => Promise<Record<string, unknown>>) {
  try {
    return ok(await work());
  } catch (error) {
    if (error instanceof McpInputError) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `${error.code}: ${error.message}` }],
      };
    }
    if (error instanceof ZodError) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `INVALID_INPUT: ${error.issues.map((issue) => issue.message).join("; ")}` }],
      };
    }

    console.error("[mcp] tool call mislukt", error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: "INTERNAL_ERROR: de tool kon niet worden uitgevoerd." }],
    };
  }
}

function createServer(context: McpRequestContext): McpServer {
  const server = new McpServer({ name: "vtk-website", version: "1.0.0" });
  const principal = principalFromAuthInfo(context.authInfo);
  const readResources = MCP_READ_RESOURCES.map((resource) => ({
    resource,
    granted: canReadMcpResource(principal, resource),
  }));
  const createKinds = listMcpCreateSchemas(principal);

  server.registerTool(
    "system_list_capabilities",
    {
      title: "MCP-capabilities en veiligheidsgrenzen lezen",
      description: "Toont elke websitepermissie, de rechten van deze serviceaccount, alle leesresources, alle create-kinds en hun exacte inputschema's.",
      inputSchema: emptyObjectSchema,
      annotations: readAnnotations,
    },
    () => runTool(async () => ({
      ...listMcpCapabilities(principal),
      readResources,
      createKinds,
    })),
  );

  if (readResources.some(({ granted }) => granted)) server.registerTool(
    "app_read",
    {
      title: "Applicatiedata lezen",
      description: "Permission-scoped read-only toegang tot alle admin-domeinen. Secrets, bearerwaarden, hashes en operationele Setting-configuratie worden nooit teruggegeven.",
      inputSchema: appReadSchema,
      annotations: readAnnotations,
    },
    (input) => runTool(() => adminRead(principal, input)),
  );

  if (canReadMcpResource(principal, "calendar")) server.registerTool(
    "calendar_list_events",
    {
      title: "Kalenderevenementen lezen",
      description: "Leest events, inclusief concepten en ledenevents. Gepagineerd en filterbaar; bevat geen ticketbestellingen of deelnemers.",
      inputSchema: listEventsSchema,
      annotations: readAnnotations,
    },
    (input) => runTool(() => listCalendarEvents(input)),
  );
  if (canReadMcpResource(principal, "calendar")) server.registerTool(
    "calendar_get_event",
    {
      title: "Kalenderevenement lezen",
      description: "Leest één volledig kalenderevenement op id.",
      inputSchema: eventIdSchema,
      annotations: readAnnotations,
    },
    (input) => runTool(() => getCalendarEvent(input)),
  );
  if (canReadMcpResource(principal, "calendar")) server.registerTool(
    "calendar_list_categories",
    {
      title: "Kalendercategorieën lezen",
      description: "Leest alle gewone en doelgroepcategorieën, ook verborgen categorieën.",
      inputSchema: emptyObjectSchema,
      annotations: readAnnotations,
    },
    () => runTool(listCalendarCategories),
  );
  if (canReadMcpResource(principal, "calendar")) server.registerTool(
    "calendar_get_category",
    {
      title: "Kalendercategorie lezen",
      description: "Leest één kalendercategorie op slug.",
      inputSchema: categorySlugSchema,
      annotations: readAnnotations,
    },
    (input) => runTool(() => getCalendarCategory(input)),
  );
  if (canReadMcpResource(principal, "calendar")) server.registerTool(
    "calendar_list_groups",
    {
      title: "Kalendergroepen lezen",
      description: "Leest de groepscodes die nodig zijn om een evenement aan de juiste post of werkgroep te koppelen.",
      inputSchema: emptyObjectSchema,
      annotations: readAnnotations,
    },
    () => runTool(listCalendarGroups),
  );
  if (canReadMcpResource(principal, "pages")) server.registerTool(
    "site_list_pages",
    {
      title: "CMS-pagina's lezen",
      description: "Leest metadata van alle CMS-pagina's, inclusief concepten. Gebruik site_get_page voor de inhoud.",
      inputSchema: listPagesSchema,
      annotations: readAnnotations,
    },
    (input) => runTool(() => listPages(input)),
  );
  if (canReadMcpResource(principal, "pages")) server.registerTool(
    "site_get_page",
    {
      title: "CMS-pagina lezen",
      description: "Leest de volledige Nederlandstalige en Engelstalige inhoud van één CMS-pagina.",
      inputSchema: pageSlugSchema,
      annotations: readAnnotations,
    },
    (input) => runTool(() => getPage(input)),
  );
  if (canReadMcpResource(principal, "navigation")) server.registerTool(
    "site_list_navigation",
    {
      title: "Navigatie lezen",
      description: "Leest alle headertabs, links en gekoppelde paginametadata, ook wanneer ze verborgen zijn.",
      inputSchema: emptyObjectSchema,
      annotations: readAnnotations,
    },
    () => runTool(listNavigation),
  );
  if (canReadMcpResource(principal, "partners")) server.registerTool(
    "site_list_partners",
    {
      title: "Partners lezen",
      description: "Leest alle partners, inclusief inactieve partners.",
      inputSchema: emptyObjectSchema,
      annotations: readAnnotations,
    },
    () => runTool(listPartners),
  );
  if (canReadMcpResource(principal, "announcements")) server.registerTool(
    "site_list_announcements",
    {
      title: "Aankondigingen lezen",
      description: "Leest alle aankondigingen, inclusief inactieve, geplande en verlopen aankondigingen.",
      inputSchema: emptyObjectSchema,
      annotations: readAnnotations,
    },
    () => runTool(listAnnouncements),
  );
  if (createKinds.some(({ granted }) => granted)) server.registerTool(
    "app_create",
    {
      title: "Applicatierecord aanmaken",
      description: "Maakt één expliciet ondersteund record aan. Waar mogelijk wordt het geforceerd draft, verborgen, inactief, gesloten, ongepubliceerd of uitgeschakeld aangemaakt. Wijzigen, verwijderen en operationele effecten bestaan niet.",
      inputSchema: appCreateSchema,
      annotations: createAnnotations,
    },
    (input) => runTool(() => createMcpRecord(principal, input)),
  );
  if (hasAnyMcpPermission(principal, ["calendar.create", "calendar.manageAll"])) server.registerTool(
    "calendar_create_event",
    {
      title: "Kalenderevenement aanmaken",
      description: "Maakt uitsluitend een nieuw evenement aan. Kan niets wijzigen of verwijderen en maakt standaard een concept.",
      inputSchema: createEventSchema,
      annotations: createAnnotations,
    },
    (input) => runTool(() => createMcpRecord(principal, {
      kind: "calendar_event",
      data: { ...input, publish: false },
    })),
  );
  if (hasMcpPermission(principal, "calendar.manageAll")) server.registerTool(
    "calendar_create_category",
    {
      title: "Kalendercategorie aanmaken",
      description: "Maakt uitsluitend een nieuwe gewone kalendercategorie aan. Doelgroepcategorieën, wijzigingen en verwijderingen zijn niet mogelijk.",
      inputSchema: createCategorySchema,
      annotations: createAnnotations,
    },
    (input) => runTool(() => createMcpRecord(principal, {
      kind: "calendar_category",
      data: input,
    })),
  );

  return server;
}

export const mcpHandler = createMcpHandler(createServer, {
  legacy: "stateless",
  responseMode: "json",
  onerror: (error) => console.error("[mcp] protocolfout", error),
});
