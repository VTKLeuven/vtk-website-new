import "server-only";

import { cache } from "react";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@/lib/workingYear";
import { viewerAudienceFilter } from "@/lib/calendar/audience";

/**
 * Wat een contentpagina over zichzelf kan tonen naast haar eigen tekst.
 *
 * Een pagina die aan een post hangt (`Page.groupId`) is de pagina van een
 * werking en geen tekstbestand: ze hoort te tonen wat die werking binnenkort
 * doet en wie ze is. Alles hier is optioneel en valt stil weg wanneer de
 * koppeling ontbreekt; een FAQ of een woordenlijst hoort bij geen enkele post
 * en blijft de pagina die ze vandaag is.
 *
 * De queries staan los van `loadPageBySlug` (en niet als `include` erin), zodat
 * een pagina zonder post er ook geen betaalt.
 */

/** Het aantal blokken dat we ophalen. Meer dan dit leest als een tweede kalender. */
const MAX_EVENTS = 3;
const MAX_SIBLINGS = 4;

export type WerkingMember = {
  id: string;
  name: string;
  avatarKey: string | null;
  titleNl: string | null;
  titleEn: string | null;
  lead: boolean;
};

export type WerkingGroup = {
  id: string;
  slug: string;
  nameNl: string;
  nameEn: string;
  website: string | null;
  members: WerkingMember[];
};

/**
 * De post achter de pagina, met haar ploeg van dit werkingsjaar.
 *
 * Dezelfde selectie als /praesidium: inactieve leden horen erbij (een
 * afgestudeerde blijft dat jaar in de post), tombstones van verwijderde
 * accounts niet.
 */
export const loadWerkingGroup = cache(async (groupId: string): Promise<WerkingGroup | null> => {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      slug: true,
      nameNl: true,
      nameEn: true,
      website: true,
      memberships: {
        where: { year: currentWorkingYear(), user: { deletedAt: null } },
        select: {
          id: true,
          role: true,
          displayOrder: true,
          titleNl: true,
          titleEn: true,
          user: { select: { name: true, avatarKey: true } },
        },
      },
    },
  });
  if (!group) return null;

  const members = [...group.memberships]
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.user.name.localeCompare(b.user.name, "nl");
    })
    .map((m) => ({
      id: m.id,
      name: m.user.name,
      avatarKey: m.user.avatarKey,
      titleNl: m.titleNl,
      titleEn: m.titleEn,
      lead: m.role === "LEAD",
    }));

  return {
    id: group.id,
    slug: group.slug,
    nameNl: group.nameNl,
    nameEn: group.nameEn,
    website: group.website,
    members,
  };
});

export type WerkingEvent = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  location: string | null;
  start: Date;
  allDay: boolean;
  imageKey: string | null;
  imageFocusX: number;
  imageFocusY: number;
};

/**
 * De eerstvolgende evenementen van deze post.
 *
 * `end >= nu` en niet `start >= nu`: een meerdaagse activiteit die vandaag
 * bezig is, is precies wat iemand op deze pagina zoekt. De doelgroepfilter is
 * dezelfde als op de homepage en de kalender, zodat wie zijn agenda toespitst
 * hier niet plots alles terugkrijgt.
 */
export const loadWerkingEvents = cache(async (groupId: string): Promise<WerkingEvent[]> => {
  const audience = await viewerAudienceFilter();
  return prisma.calendarEvent.findMany({
    where: {
      groupId,
      publishedAt: { not: null },
      end: { gte: new Date() },
      ...audience,
    },
    orderBy: { start: "asc" },
    take: MAX_EVENTS,
    select: {
      id: true,
      slug: true,
      titleNl: true,
      titleEn: true,
      location: true,
      start: true,
      allDay: true,
      imageKey: true,
      imageFocusX: true,
      imageFocusY: true,
    },
  });
});

export type SiblingPage = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  excerptNl: string | null;
  excerptEn: string | null;
  imageKey: string | null;
  imageFocusX: number;
  imageFocusY: number;
};

/**
 * De andere pagina's onder dezelfde categorie, in de volgorde van de
 * categoriepagina. Dezelfde selectie als daar (`visibleOnCategoryPage`), zodat
 * een pagina die daar bewust niet staat hier ook niet opduikt.
 */
export const loadSiblingPages = cache(
  async (headerTabId: string, exceptPageId: string): Promise<SiblingPage[]> =>
    prisma.page.findMany({
      where: {
        headerTabId,
        id: { not: exceptPageId },
        visibleOnCategoryPage: true,
        publishedAt: { not: null },
      },
      orderBy: [{ order: "asc" }, { titleNl: "asc" }],
      take: MAX_SIBLINGS,
      select: {
        id: true,
        slug: true,
        titleNl: true,
        titleEn: true,
        excerptNl: true,
        excerptEn: true,
        imageKey: true,
        imageFocusX: true,
        imageFocusY: true,
      },
    }),
);
