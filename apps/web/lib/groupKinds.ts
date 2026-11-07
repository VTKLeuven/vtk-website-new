import type { Permission } from "@vtk/auth";

/*
 * De soorten groep die naast de praesidiumposten hun eigen beheerscherm hebben:
 * werkgroepen en jaarwerkingen. Ze delen het `Group`-model, de leden per
 * werkingsjaar en de rollen die ze toekennen; wat verschilt, staat hier.
 *
 * Geen `server-only`: het beheerscherm (een clientcomponent) leest hier zijn
 * paden uit. Er staat niets in wat de browser niet mag zien.
 */

export type WerkingKind = "WERKGROEP" | "JAARWERKING";

export type WerkingKindConfig = {
  kind: WerkingKind;
  /** Alles beheren: elke groep van dit soort, haar leden, rollen en instellingen. */
  managePermission: Permission;
  /**
   * De gewone leden van de eigen groep beheren, enkel in de groep die het recht
   * verleent (zie `lib/werkgroepMembers.ts`).
   */
  ownMembersPermission: Permission;
  /** Zonder taalprefix. */
  adminPath: string;
  /**
   * De publieke pagina die infotekst en website toont, of `null`. Jaarwerkingen
   * hebben er geen: hun beheerscherm toont die velden dan ook niet.
   */
  publicPath: string | null;
  /** `entity` in het auditlogboek. */
  auditEntity: "werkgroep" | "jaarwerking";
  /** Wat een nieuwe groep als titel van de verantwoordelijke krijgt. */
  defaultLeadLabel: string;
};

export const WERKING_KINDS: Record<WerkingKind, WerkingKindConfig> = {
  WERKGROEP: {
    kind: "WERKGROEP",
    managePermission: "werkgroepen.manage",
    ownMembersPermission: "werkgroepen.manageOwnMembers",
    adminPath: "/admin/werkgroepen",
    publicPath: "/werkgroepen",
    auditEntity: "werkgroep",
    defaultLeadLabel: "G3",
  },
  JAARWERKING: {
    kind: "JAARWERKING",
    managePermission: "jaarwerkingen.manage",
    ownMembersPermission: "jaarwerkingen.manageOwnMembers",
    adminPath: "/admin/jaarwerkingen",
    publicPath: null,
    auditEntity: "jaarwerking",
    defaultLeadLabel: "Verantwoordelijke",
  },
};

export function isWerkingKind(type: string | null | undefined): type is WerkingKind {
  return type === "WERKGROEP" || type === "JAARWERKING";
}

/**
 * Het recht dat een groep van dit soort beheert: een praesidiumpost vraagt
 * `groups.manage`, een werkgroep en een jaarwerking elk hun eigen recht. Zo kan
 * het beheer van elk soort los gedelegeerd worden.
 */
export function managePermissionFor(type: string | null | undefined): Permission {
  return isWerkingKind(type) ? WERKING_KINDS[type].managePermission : "groups.manage";
}
