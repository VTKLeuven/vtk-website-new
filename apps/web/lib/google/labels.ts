import { everyGroupOfKindLabel, isGroupKind } from "./members";

/**
 * Hoe een bron heet op het scherm: een post, "elke praesidiumpost", een
 * kiesploeg(post) of een POC. Puur, zodat het overzicht, de detailpagina en
 * het logboek dezelfde namen gebruiken.
 */
export type SourceWithNames = {
  groupType: string | null;
  onlyLead: boolean;
  group: { nameNl: string; nameEn: string } | null;
  kiesploeg: { formalName: string } | null;
  kiesploegPost: { name: string; kiesploeg: { formalName: string } } | null;
  poc: { nameNl: string; nameEn: string | null } | null;
};

export const SOURCE_NAME_SELECT = {
  group: { select: { nameNl: true, nameEn: true, type: true } },
  kiesploeg: { select: { formalName: true } },
  kiesploegPost: { select: { name: true, kiesploeg: { select: { formalName: true } } } },
  poc: { select: { nameNl: true, nameEn: true } },
} as const;

export function sourceName(src: SourceWithNames, nl: boolean): string {
  let name = "?";
  if (src.group) name = nl ? src.group.nameNl : src.group.nameEn;
  else if (src.groupType && isGroupKind(src.groupType)) name = everyGroupOfKindLabel(src.groupType, nl);
  else if (src.kiesploeg) name = src.kiesploeg.formalName;
  else if (src.kiesploegPost) {
    name = `${src.kiesploegPost.name} (${src.kiesploegPost.kiesploeg.formalName})`;
  } else if (src.poc) {
    name = `${nl ? "POC" : "POC"} ${nl ? src.poc.nameNl : (src.poc.nameEn ?? src.poc.nameNl)}`;
  }
  if (src.onlyLead) name += nl ? " (verantwoordelijke)" : " (lead)";
  return name;
}
