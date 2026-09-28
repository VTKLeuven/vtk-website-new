/**
 * Langs waar kwam een koper op de ticketpagina?
 *
 * Puur en zonder `server-only`: de shop leidt de herkomst af in de browser, de
 * checkout schoont ze opnieuw op voor ze in `TicketOrder.source` gaat, en de
 * statistieken zetten de sleutel om in een naam. Zo is het één regel en is ze
 * zonder browser te testen.
 *
 * Drie bronnen, in deze volgorde:
 *
 * 1. **Een parameter in de link.** `?via=` zetten we zelf op de links naar een
 *    ticketpagina (kalender, homepage, nieuws), en de deelbare links uit het
 *    beheer dragen ze ook (`?via=facebook&c=affiche`). `utm_source` en
 *    `utm_campaign` tellen evengoed, voor wie die gewoonte al heeft.
 * 2. **Een klik-id** van een sociaal netwerk (`fbclid`): Facebook plakt die aan
 *    elke uitgaande link, ook wanneer de referrer ontbreekt.
 * 3. **De referrer**, enkel als host of als grove plek op onze eigen site. Nooit
 *    de volledige URL: daar kan een zoekopdracht of een bestelnummer in staan.
 *
 * Niets hiervan belandt in een cookie of in localStorage. De shop houdt de
 * herkomst in zijn state en geeft ze mee aan de login-link, zodat een koper die
 * eerst moet inloggen niet als "direct" terugkomt.
 */

/** De parameter die we zelf op links zetten. */
export const SOURCE_PARAM = "via";
/** De campagne naast `via`, bv. `affiche` of `story`. */
export const CAMPAIGN_PARAM = "c";

/** Parameters die na het uitlezen uit de adresbalk mogen. */
export const SOURCE_URL_PARAMS = [
  SOURCE_PARAM,
  CAMPAIGN_PARAM,
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "igshid",
] as const;

export type TicketSource = { source: string; campaign: string | null };

const MAX_LENGTH = 40;

/**
 * Een vrije waarde uit een URL tot een sleutel: kleine letters, enkel letters,
 * cijfers, punt, streepje en underscore, hoogstens 40 tekens. Null wanneer er
 * niets overblijft. De checkout doet dit opnieuw: wat de browser stuurt, is
 * invoer.
 */
export function sanitizeSourceKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_LENGTH);
  return key.length > 0 ? key : null;
}

/** Hosts van bekende kanalen, op de laatste twee labels van de host. */
const HOST_SOURCES: Record<string, string> = {
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "fb.me": "facebook",
  "messenger.com": "facebook",
  "instagram.com": "instagram",
  "whatsapp.com": "whatsapp",
  "wa.me": "whatsapp",
  "t.co": "x",
  "twitter.com": "x",
  "x.com": "x",
  "linkedin.com": "linkedin",
  "lnkd.in": "linkedin",
  "tiktok.com": "tiktok",
  "snapchat.com": "snapchat",
  "reddit.com": "reddit",
  "discord.com": "discord",
  "discord.gg": "discord",
  "bing.com": "zoekmachine",
  "duckduckgo.com": "zoekmachine",
  "ecosia.org": "zoekmachine",
  "yahoo.com": "zoekmachine",
  "live.com": "mail",
  "office.com": "mail",
  "outlook.com": "mail",
  "kuleuven.be": "kuleuven",
};

function hostSource(host: string): string {
  const clean = host.toLowerCase().replace(/^www\./, "");
  const labels = clean.split(".");
  // google.be, google.com, google.co.uk: allemaal dezelfde zoekmachine.
  if (labels.includes("google")) return clean.startsWith("mail.") ? "mail" : "zoekmachine";
  const lastTwo = labels.slice(-2).join(".");
  return HOST_SOURCES[lastTwo] ?? sanitizeSourceKey(lastTwo) ?? "extern";
}

/**
 * Een pad op onze eigen site tot een plek. Grof met opzet: wie van een
 * eventpagina komt, komt van de kalender, welke dag dat ook was.
 */
function internalSource(pathname: string): string {
  const path = pathname.replace(/^\/(nl|en)(?=\/|$)/, "") || "/";
  if (path === "/") return "home";
  if (path === "/tickets") return "tickets";
  if (path.startsWith("/tickets/bestelling")) return "bestelling";
  if (path.startsWith("/tickets/")) return "tickets";
  if (path.startsWith("/kalender/")) return "kalender-event";
  if (path.startsWith("/kalender")) return "kalender";
  if (path.startsWith("/nieuws")) return "nieuws";
  if (path.startsWith("/account")) return "account";
  // Terug van de login of de SSO: de echte herkomst reisde mee in `?via=`, en
  // zonder die parameter weten we het niet.
  if (path.startsWith("/inloggen") || path.startsWith("/api/auth")) return "direct";
  return "site";
}

/**
 * De herkomst van een bezoek aan de ticketpagina.
 *
 * @param search de querystring van de ticketpagina (`location.search`)
 * @param referrer `document.referrer`, leeg wanneer de browser niets meegeeft
 * @param origin de origin van onze eigen site, om interne verwijzingen te herkennen
 */
export function sourceFromLanding(search: string, referrer: string, origin: string): TicketSource {
  const params = new URLSearchParams(search);
  const campaign =
    sanitizeSourceKey(params.get(CAMPAIGN_PARAM)) ?? sanitizeSourceKey(params.get("utm_campaign"));

  const tagged = sanitizeSourceKey(params.get(SOURCE_PARAM)) ?? sanitizeSourceKey(params.get("utm_source"));
  if (tagged) return { source: tagged, campaign };
  if (params.has("fbclid")) return { source: "facebook", campaign };
  if (params.has("igshid")) return { source: "instagram", campaign };

  if (!referrer) return { source: "direct", campaign };
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return { source: "direct", campaign };
  }
  let own: string;
  try {
    own = new URL(origin).host;
  } catch {
    own = "";
  }
  // www.vtk.be en vtk.be zijn dezelfde site.
  const strip = (host: string) => host.replace(/^www\./, "");
  if (strip(url.host) === strip(own)) return { source: internalSource(url.pathname), campaign };
  return { source: hostSource(url.hostname), campaign };
}

/**
 * De querystring om de herkomst door te geven aan de volgende pagina (de
 * login, of de ticketpagina vanaf een eventpagina). Leeg voor "direct": daar
 * valt niets door te geven.
 */
export function sourceQuery(source: TicketSource | null): string {
  if (!source || source.source === "direct") return "";
  const params = new URLSearchParams({ [SOURCE_PARAM]: source.source });
  if (source.campaign) params.set(CAMPAIGN_PARAM, source.campaign);
  return `?${params.toString()}`;
}

/** Een link naar een pagina met een vaste `via`, voor onze eigen links. */
export function withSource(href: string, source: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${SOURCE_PARAM}=${encodeURIComponent(source)}`;
}

export type SourceKind = "site" | "extern" | "direct" | "unknown";

type SourceInfo = { nl: string; en: string; kind: SourceKind };

/**
 * De bekende sleutels met hun naam. Alles wat hier niet staat, is een kanaal
 * uit een deelbare link of een onbekende host, en wordt als zichzelf getoond.
 */
const SOURCES: Record<string, SourceInfo> = {
  "home-agenda": { nl: "Homepage: agenda bovenaan", en: "Homepage: agenda at the top", kind: "site" },
  "home-evenementen": { nl: "Homepage: aankomende evenementen", en: "Homepage: upcoming events", kind: "site" },
  home: { nl: "Homepage (elders)", en: "Homepage (elsewhere)", kind: "site" },
  nieuws: { nl: "Nieuws", en: "News", kind: "site" },
  kalender: { nl: "Kalender", en: "Calendar", kind: "site" },
  "kalender-event": { nl: "Eventpagina in de kalender", en: "Event page in the calendar", kind: "site" },
  tickets: { nl: "Ticketoverzicht (/tickets)", en: "Ticket overview (/tickets)", kind: "site" },
  bestelling: { nl: "Opnieuw bestellen", en: "Ordering again", kind: "site" },
  voorverkoop: { nl: "Voorverkooplink", en: "Presale link", kind: "site" },
  account: { nl: "Mijn VTK", en: "My VTK", kind: "site" },
  app: { nl: "VTK-app", en: "VTK app", kind: "site" },
  site: { nl: "Elders op vtk.be", en: "Elsewhere on vtk.be", kind: "site" },
  facebook: { nl: "Facebook", en: "Facebook", kind: "extern" },
  instagram: { nl: "Instagram", en: "Instagram", kind: "extern" },
  whatsapp: { nl: "WhatsApp", en: "WhatsApp", kind: "extern" },
  x: { nl: "X (Twitter)", en: "X (Twitter)", kind: "extern" },
  linkedin: { nl: "LinkedIn", en: "LinkedIn", kind: "extern" },
  tiktok: { nl: "TikTok", en: "TikTok", kind: "extern" },
  snapchat: { nl: "Snapchat", en: "Snapchat", kind: "extern" },
  reddit: { nl: "Reddit", en: "Reddit", kind: "extern" },
  discord: { nl: "Discord", en: "Discord", kind: "extern" },
  mail: { nl: "Mail", en: "Email", kind: "extern" },
  qr: { nl: "QR-code of affiche", en: "QR code or poster", kind: "extern" },
  zoekmachine: { nl: "Zoekmachine", en: "Search engine", kind: "extern" },
  kuleuven: { nl: "KU Leuven (Toledo, ...)", en: "KU Leuven (Toledo, ...)", kind: "extern" },
  extern: { nl: "Andere website", en: "Other website", kind: "extern" },
  direct: { nl: "Rechtstreeks of onbekend", en: "Direct or unknown", kind: "direct" },
};

/** Naam en soort van een opgeslagen `TicketOrder.source`; null = niet gemeten. */
export function describeSource(
  key: string | null,
  locale: "nl" | "en",
): { label: string; kind: SourceKind } {
  if (key === null) {
    return {
      label: locale === "nl" ? "Niet gemeten (oudere bestellingen)" : "Not measured (older orders)",
      kind: "unknown",
    };
  }
  const known = SOURCES[key];
  if (known) return { label: known[locale], kind: known.kind };
  return { label: key, kind: "extern" };
}

/**
 * De kanalen die het beheer aanbiedt voor een deelbare link. Een eigen waarde
 * kan ook; die wordt met {@link sanitizeSourceKey} een sleutel.
 */
export const SHAREABLE_SOURCES = [
  "facebook",
  "instagram",
  "whatsapp",
  "mail",
  "qr",
  "linkedin",
  "discord",
] as const;
