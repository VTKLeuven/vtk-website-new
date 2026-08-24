import { PERMISSIONS } from "@vtk/db/permissions";

/**
 * Leesbare namen voor de categorieën uit de permissie-registry
 * (`packages/db/src/permissions.ts`). De registry zelf houdt enkel een sleutel
 * bij ("pages", "users", ...); die is prima als groepering in code, maar te
 * kaal voor een scherm.
 */
const CATEGORY_LABELS: Record<string, { nl: string; en: string }> = {
  pages: { nl: "Pagina's", en: "Pages" },
  calendar: { nl: "Kalender", en: "Calendar" },
  tickets: { nl: "Tickets", en: "Tickets" },
  forms: { nl: "Forms", en: "Forms" },
  photos: { nl: "Foto's", en: "Photos" },
  users: { nl: "Leden en rollen", en: "Members and roles" },
  general: { nl: "Website-inhoud", en: "Website content" },
  shift: { nl: "Shiften", en: "Shifts" },
  theokot: { nl: "Theokot", en: "Theokot" },
  meetings: { nl: "Grocomeet & Bureau", en: "Grocomeet & Bureau" },
  lesbezoeken: { nl: "Lesbezoeken", en: "Classroom visits" },
  piano: { nl: "Piano", en: "Piano" },
  logistiek: { nl: "Logistiek", en: "Logistics" },
  door: { nl: "Deurtoegang", en: "Door access" },
  vault: { nl: "Wachtwoordkluis", en: "Password vault" },
  google: { nl: "Google Workspace", en: "Google Workspace" },
  modules: { nl: "Moduletoegang", en: "Module access" },
  external: { nl: "Externe apps", en: "External apps" },
  it: { nl: "IT", en: "IT" },
};

export function permissionCategoryLabel(category: string, locale: "nl" | "en"): string {
  const entry = CATEGORY_LABELS[category];
  if (!entry) return category;
  return locale === "nl" ? entry.nl : entry.en;
}

export type PermissionInfo = {
  code: string;
  label: string;
  category: string;
  categoryLabel: string;
};

/**
 * Permissiecode -> label en categorie, in de gevraagde taal. Codes die niet in
 * de registry staan (bv. een oude rij die in de database bleef staan) vallen
 * terug op de code zelf, zodat een scherm nooit een leeg vakje toont.
 */
export function permissionInfoByCode(locale: "nl" | "en"): Map<string, PermissionInfo> {
  return new Map(
    PERMISSIONS.map((permission) => [
      permission.code as string,
      {
        code: permission.code as string,
        label: locale === "nl" ? permission.labelNl : permission.labelEn,
        category: permission.category,
        categoryLabel: permissionCategoryLabel(permission.category, locale),
      },
    ]),
  );
}

export function describePermission(code: string, locale: "nl" | "en"): PermissionInfo {
  return (
    permissionInfoByCode(locale).get(code) ?? {
      code,
      label: code,
      category: "general",
      categoryLabel: permissionCategoryLabel("general", locale),
    }
  );
}
