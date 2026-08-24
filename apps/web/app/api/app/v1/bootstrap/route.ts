import { currentWorkingYear } from "@vtk/auth";
import { pick } from "@vtk/i18n";

import { getCurrentAnnouncement, announcementFits } from "@/lib/announcements";
import { getVisibleHeaderTabsForNav } from "@/lib/headerTabs";
import { getCurrentSession } from "@/lib/session";
import { corsPreflight } from "@/lib/cors";
import {
  APP_API_VERSION,
  appLocaleFrom,
  type AppBootstrap,
  type AppNavTab,
  type AppViewer,
} from "@/lib/app-api/contract";
import { absoluteMediaUrl, absoluteUrl, requestOrigin } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";
import { minimumAppVersion } from "@/lib/app-api/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wat de VTK-app bij elke start ophaalt.
 *
 * Eén aanvraag met alles wat de schil nodig heeft om zichzelf te tekenen: wie er
 * ingelogd is, de tabs uit het CMS, de aankondiging van dit moment en de
 * ondergrens op de appversie. De schermen zelf halen daarna hun eigen inhoud op.
 *
 * De route werkt bewust ook zonder sessie: de app is publiek bruikbaar en vraagt
 * pas een login op het moment dat een scherm er een nodig heeft.
 */
export async function GET(request: Request) {
  try {
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));

    const [session, tabs, announcement] = await Promise.all([
      getCurrentSession(),
      getVisibleHeaderTabsForNav(locale),
      getCurrentAnnouncement(),
    ]);

    const viewer: AppViewer | null = session
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          avatarUrl: absoluteMediaUrl(request, session.user.avatarKey),
          // `AuthUser.locale` is "NL"/"EN"; het contract gebruikt de kleine variant
          // die ook in de URL staat.
          locale: session.user.locale === "EN" ? "en" : "nl",
          groups: session.groups.map((group) => ({
            id: group.id,
            code: group.code,
            slug: group.slug,
            name: pick(group.nameNl, group.nameEn, locale),
            type: group.type,
            role: group.role,
          })),
          needsOnboarding: !session.user.onboarded,
          // Zelfde volgorde als de gate in `proxy.ts`: eerst onboarden, dan pas
          // de studie bevestigen. Anders stuurt de app iemand naar het tweede
          // scherm terwijl de website hem op het eerste zou houden.
          needsStudyConfirmation:
            session.user.onboarded && session.user.studyConfirmedYear !== currentWorkingYear(),
        }
      : null;

    const navTabs: AppNavTab[] = tabs.map((tab) => ({
      id: tab.id,
      slug: tab.slug,
      label: pick(tab.labelNl, tab.labelEn, locale),
      imageUrl: absoluteMediaUrl(request, tab.imageKey),
      externalUrl: tab.externalUrl,
      children: tab.children.map((child) => ({
        id: child.id,
        label: pick(child.labelNl, child.labelEn, locale),
        href: child.href,
        external: child.external,
      })),
    }));

    // De app heeft geen pad zoals de website, dus de vraag "mag ze hier?" wordt
    // beantwoord alsof ze op de homepage staat: HOME en SITE passen allebei.
    const showAnnouncement = announcement && announcementFits(announcement.scope, "/");

    const payload: AppBootstrap = {
      apiVersion: APP_API_VERSION,
      locale,
      viewer,
      tabs: navTabs,
      announcement: showAnnouncement
        ? {
            id: announcement.id,
            title: pick(announcement.titleNl, announcement.titleEn, locale),
            body: pick(announcement.bodyNl, announcement.bodyEn, locale),
            ctaLabel: pick(announcement.ctaLabelNl, announcement.ctaLabelEn, locale) ?? null,
            ctaUrl: absoluteUrl(request, announcement.ctaUrl),
          }
        : null,
      minimumAppVersion: minimumAppVersion(),
      webBaseUrl: requestOrigin(request),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/** Preflight, zodat een webversie van hetzelfde scherm er ook bij kan. */
export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
