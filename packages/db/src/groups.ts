import type { GroupCode } from "@prisma/client";

export type GroupSeed = {
  code: GroupCode;
  slug: string;
  nameNl: string;
  nameEn: string;
  orderInPraesidium: number;
};

export const GROUP_SEEDS: GroupSeed[] = [
  { code: "ALGEMEEN", slug: "algemeen", nameNl: "Algemeen", nameEn: "General", orderInPraesidium: 0 },
  { code: "GROEP5", slug: "groep-5", nameNl: "Groep 5", nameEn: "Group 5", orderInPraesidium: 1 },
  { code: "ACTIVITEITEN", slug: "activiteiten", nameNl: "Activiteiten", nameEn: "Activities", orderInPraesidium: 2 },
  { code: "BEDRIJVENRELATIES", slug: "bedrijvenrelaties", nameNl: "Bedrijvenrelaties", nameEn: "Corporate Relations", orderInPraesidium: 3 },
  { code: "COMMUNICATIE", slug: "communicatie", nameNl: "Communicatie", nameEn: "Communications", orderInPraesidium: 4 },
  { code: "CULTUUR", slug: "cultuur", nameNl: "Cultuur", nameEn: "Culture", orderInPraesidium: 5 },
  { code: "CURSUSDIENST", slug: "cursusdienst", nameNl: "Cursusdienst", nameEn: "Course Shop", orderInPraesidium: 6 },
  { code: "DEVELOPMENT", slug: "development", nameNl: "Development", nameEn: "Development", orderInPraesidium: 7 },
  { code: "FAKBAR", slug: "fakbar", nameNl: "Fakbar", nameEn: "Fakbar", orderInPraesidium: 8 },
  { code: "INTERNATIONAAL", slug: "internationaal", nameNl: "Internationaal", nameEn: "International", orderInPraesidium: 9 },
  { code: "IT", slug: "it", nameNl: "IT", nameEn: "IT", orderInPraesidium: 10 },
  { code: "LOGISTIEK", slug: "logistiek", nameNl: "Logistiek", nameEn: "Logistics", orderInPraesidium: 11 },
  { code: "ONDERWIJS", slug: "onderwijs", nameNl: "Onderwijs", nameEn: "Education", orderInPraesidium: 12 },
  { code: "ONTHAAL", slug: "onthaal", nameNl: "Onthaal", nameEn: "Welcome", orderInPraesidium: 13 },
  { code: "SPORT", slug: "sport", nameNl: "Sport", nameEn: "Sports", orderInPraesidium: 14 },
  { code: "THEOKOT", slug: "theokot", nameNl: "Theokot", nameEn: "Theokot", orderInPraesidium: 15 },
];

export const HEADER_TABS: Array<{
  code: string;
  slug: string;
  labelNl: string;
  labelEn: string;
  order: number;
}> = [
  { code: "AANBOD", slug: "aanbod", labelNl: "Aanbod", labelEn: "Offer", order: 0 },
  { code: "EERSTEJAARS", slug: "eerstejaars", labelNl: "Eerstejaars", labelEn: "Freshmen", order: 1 },
  { code: "CAREER", slug: "career", labelNl: "Career", labelEn: "Career", order: 2 },
  { code: "CURSUSDIENST", slug: "cursusdienst", labelNl: "Cursusdienst", labelEn: "Course Shop", order: 3 },
  { code: "INTERNATIONAAL", slug: "internationaal", labelNl: "Internationaal", labelEn: "International", order: 4 },
  { code: "STUDIES", slug: "studies", labelNl: "Studies", labelEn: "Studies", order: 5 },
  { code: "MEDIA", slug: "media", labelNl: "Media", labelEn: "Media", order: 6 },
  { code: "OVER_VTK", slug: "over-vtk", labelNl: "Over-VTK", labelEn: "About VTK", order: 7 },
  { code: "CONTACT", slug: "contact", labelNl: "Contact", labelEn: "Contact", order: 8 },
];
