import { isMemberOfGroup, type SessionPayload } from "@vtk/auth";

/**
 * Beheerschermen die bij een post horen maar niet op deze site staan: de
 * uitleendienst, de career-site en de cursusdienst. Ze hangen in het accountmenu
 * naast /admin, want dat is waar iemand kijkt die "naar het beheer" wil, en niet
 * in de publieke navigatie: het zijn interne ingangen voor een handvol leden.
 *
 * De labels zijn de namen van de tools zelf en blijven daarom in beide talen
 * gelijk; ze lopen niet via de woordenboeken. Zie de schrijfconventies in
 * CLAUDE.md: een interne, technische ingang krijgt geen vertaling die niemand
 * gebruikt.
 */
export type PostAdminLink = {
  /** Stabiele sleutel voor de React-key; verandert niet mee met het label. */
  key: string;
  label: string;
  href: string;
};

/** Career en cudi zijn losstaande sites; ze hebben geen dev-variant. */
const CAREER_ADMIN_URL = "https://career.vtk.be/admin";
const CUDI_ADMIN_URL = "https://cudi.vtk.be/vtk/admin";

/**
 * De uitleendienst draait wél op een host die per omgeving verschilt
 * (`logistiek.dev.vtk.be` naast `logistiek.vtk.be`), dus komt hij uit dezelfde
 * omgevingsvariabele als de zoekresultaten (`lib/search-server.ts`). Staat die
 * niet ingesteld, dan tonen we het menu-item niet: een link naar een adres dat
 * we niet kennen is erger dan geen link.
 */
function logistiekBeheerUrl(): string | null {
  const base = process.env.LOGISTIEK_PUBLIC_URL?.trim();
  return base ? `${base.replace(/\/+$/, "")}/beheer` : null;
}

export function postAdminLinks(session: SessionPayload | null | undefined): PostAdminLink[] {
  if (!session) return [];
  const links: PostAdminLink[] = [];

  // Op het lidmaatschap van de post en niet op `logistiek.manage`, hoewel dat
  // laatste is wat /beheer daarginds controleert. Die permissie zit ook bij
  // superadmins en bij rollen buiten de post, en voor hen is dit een menu-item
  // dat ze nooit nodig hebben. Het menu is kort; wat er staat, moet ergens over
  // gaan.
  const logistiek = logistiekBeheerUrl();
  if (logistiek && isMemberOfGroup(session, "LOGISTIEK")) {
    links.push({ key: "logistiek", label: "Logistiek Beheer", href: logistiek });
  }

  // Career en cudi kunnen niet anders: die apps kennen onze permissies niet en
  // beslissen op hun eigen SSO-codes (zie docs/sso.md).
  if (isMemberOfGroup(session, "BEDRIJVENRELATIES")) {
    links.push({ key: "career", label: "Career Admin", href: CAREER_ADMIN_URL });
  }
  if (isMemberOfGroup(session, "CURSUSDIENST")) {
    links.push({ key: "cudi", label: "Cudi Admin", href: CUDI_ADMIN_URL });
  }

  return links;
}
