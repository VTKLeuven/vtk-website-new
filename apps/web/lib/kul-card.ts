/**
 * KU Leuven studentenkaart-verificatie voor de Theokot-afhaalbalie.
 *
 * De kaartlezer gedraagt zich als een toetsenbord en "typt" `serial;cardAppId`
 * gevolgd door Enter. Deze helper wisselt de client-credentials in voor een token
 * en roept de KU Leuven `idverification`-endpoint aan; de respons bevat het
 * r-nummer (`userName`) waarmee we de reservatie opzoeken.
 *
 * Server-only (gebruikt geheime credentials uit env). Enkel aanroepen vanuit een
 * server action / route. Credentials: zie README ("Theokot kaartscanner").
 *
 * KU Leuven dropt verkeer van ons server-adres naar hun net, dus op productie
 * kunnen beide oproepen via de relay van de cursusdienst lopen (zie
 * {@link getKulCardRelayConfig}). Die relay spreekt dezelfde twee endpoints aan;
 * de stappen en de foutafhandeling hieronder blijven dus gelijk.
 */

const DEFAULT_AUTH_ENDPOINT =
  "https://idp.kuleuven.be/auth/realms/kuleuven/protocol/openid-connect/token";
const DEFAULT_ID_ENDPOINT = "https://account.kuleuven.be/api/v1/idverification";

/**
 * Hoe lang we op KU Leuven wachten. Iemand staat met zijn kaart aan de lezer;
 * na tien seconden zeggen dat het niet lukt, is beter dan blijven draaien.
 */
const KUL_TIMEOUT_MS = 10_000;
/**
 * Via de relay iets ruimer dan diens eigen upstream-timeout (15 s), zodat zijn
 * 502 met uitleg eerst binnenkomt in plaats van onze eigen abort.
 */
const RELAY_TIMEOUT_MS = 20_000;

/**
 * De relay gebruikt `Authorization` voor zijn eigen secret; onze KU
 * Leuven-credentials reizen in deze header mee en worden daar weer
 * `Authorization`. De relay bewaart ze zelf niet.
 */
const RELAY_UPSTREAM_AUTHORIZATION_HEADER = "X-Kul-Authorization";
/** Zet de relay op elk antwoord dat echt van KU Leuven komt. */
const RELAY_UPSTREAM_RESPONSE_HEADER = "X-Kul-Relay-Upstream";

export type CardVerifyResult =
  | { ok: true; rNumber: string; firstName: string; lastName: string }
  | { ok: false; error: string };

export type KulCardRelayConfig = { origin: string; secret: string };

let warnedAboutHalfConfiguredRelay = false;
let warnedAboutIgnoredEndpointOverrides = false;

/**
 * De relay naar KU Leuven, of null om rechtstreeks te gaan.
 *
 * Dezelfde relay als die van de cursusdienst (`scripts/kul-education-relay.mjs`
 * daar), met hetzelfde protocol: zet `KUL_CARD_RELAY_SECRET` op dezelfde waarde
 * als hun `KUL_EDUCATION_RELAY_SECRET`. Bij elke oproep gelezen, zodat een
 * herstart van de container volstaat om hem aan of uit te zetten.
 */
export function getKulCardRelayConfig(): KulCardRelayConfig | null {
  const origin = process.env.KUL_CARD_RELAY_URL?.trim();
  const secret = process.env.KUL_CARD_RELAY_SECRET?.trim();
  if (origin && secret) return { origin: origin.replace(/\/+$/, ""), secret };

  // Eén van de twee invullen laat de relay uit. Dat zeggen we, anders valt de
  // scanner stil terug op de rechtstreekse oproep die dan in een timeout loopt.
  if ((origin || secret) && !warnedAboutHalfConfiguredRelay) {
    warnedAboutHalfConfiguredRelay = true;
    console.warn(
      "[kul-card] KUL_CARD_RELAY_URL en KUL_CARD_RELAY_SECRET horen samen; " +
        "nu is er maar één ingevuld, dus de kaartcontrole gaat rechtstreeks naar KU Leuven.",
    );
  }
  return null;
}

type CardEndpoints = { tokenUrl: string; idUrl: string; relay: KulCardRelayConfig | null };

/**
 * Staat de relay aan, dan kiest die de KU Leuven-endpoints: hij spreekt enkel
 * vaste upstreams aan, dus `KUL_CARD_AUTH_ENDPOINT` / `KUL_CARD_ID_ENDPOINT`
 * gelden dan niet.
 */
function resolveEndpoints(): CardEndpoints {
  const relay = getKulCardRelayConfig();
  const authOverride = process.env.KUL_CARD_AUTH_ENDPOINT?.trim();
  const idOverride = process.env.KUL_CARD_ID_ENDPOINT?.trim();
  if (!relay) {
    return {
      tokenUrl: authOverride || DEFAULT_AUTH_ENDPOINT,
      idUrl: idOverride || DEFAULT_ID_ENDPOINT,
      relay: null,
    };
  }

  const overridden =
    (authOverride && authOverride !== DEFAULT_AUTH_ENDPOINT) ||
    (idOverride && idOverride !== DEFAULT_ID_ENDPOINT);
  if (overridden && !warnedAboutIgnoredEndpointOverrides) {
    warnedAboutIgnoredEndpointOverrides = true;
    console.warn(
      "[kul-card] De KU Leuven-relay staat aan, dus KUL_CARD_AUTH_ENDPOINT en KUL_CARD_ID_ENDPOINT worden genegeerd.",
    );
  }
  return {
    tokenUrl: `${relay.origin}/student-card/token`,
    idUrl: `${relay.origin}/student-card/idverification`,
    relay,
  };
}

function authorizationHeaders(
  relay: KulCardRelayConfig | null,
  upstreamAuthorization: string,
): Record<string, string> {
  if (!relay) return { Authorization: upstreamAuthorization };
  return {
    Authorization: `Bearer ${relay.secret}`,
    [RELAY_UPSTREAM_AUTHORIZATION_HEADER]: upstreamAuthorization,
  };
}

/**
 * Eén POST naar KU Leuven of de relay. Een netwerkfout of een weigering door de
 * relay zelf (fout secret, verouderde relay) wordt meteen een foutmelding; een
 * antwoord van KU Leuven gaat terug naar de beller.
 */
async function postToKul(
  url: string,
  init: { headers: Record<string, string>; body: string },
  relay: KulCardRelayConfig | null,
): Promise<{ response: Response } | { failure: CardVerifyResult }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: init.headers,
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(relay ? RELAY_TIMEOUT_MS : KUL_TIMEOUT_MS),
    });
    if (relay && !response.ok && !response.headers.has(RELAY_UPSTREAM_RESPONSE_HEADER)) {
      // 401: KUL_CARD_RELAY_SECRET klopt niet. 404: de relay-host draait nog
      // een versie zonder kaartroutes.
      const detail = await response.text().catch(() => "");
      console.warn(
        `[kul-card] relay weigerde ${new URL(url).pathname} met HTTP ${response.status}: ${detail}`,
      );
      return {
        failure: { ok: false, error: `KU Leuven-relay weigerde de kaartcontrole (${response.status}).` },
      };
    }
    return { response };
  } catch (err) {
    console.error(`[kul-card] ${relay ? "relay" : "KU Leuven"} niet bereikbaar:`, err);
    return {
      failure: {
        ok: false,
        error: relay
          ? "KU Leuven-relay niet bereikbaar voor de kaartcontrole."
          : "KU Leuven niet bereikbaar voor de kaartcontrole.",
      },
    };
  }
}

const R_NUMBER_IN_TEXT = /\b([ru]\d{7})\b/i;

/**
 * Haalt het r- of u-nummer uit de KU Leuven-respons: eerst uit `userName`, anders
 * uit het eerste veld dat er een bevat. Het resultaat wordt in `StudentCard`
 * bewaard en nooit opnieuw nagevraagd, dus een waarde die er niet als een
 * nummer uitziet, nemen we niet over.
 */
export function extractRNumber(data: Record<string, unknown>): string {
  const values = [data.userName, ...Object.values(data)];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const match = value.match(R_NUMBER_IN_TEXT);
    if (match) return match[1].toLowerCase();
  }
  return "";
}

/**
 * Verifieert een gescande `serial;cardAppId`-string bij KU Leuven en geeft het
 * r-nummer + naam terug. Netwerk-/configuratiefouten komen als `{ ok: false }`.
 */
export async function verifyStudentCard(scanned: string): Promise<CardVerifyResult> {
  const cleaned = scanned.replace(/[\r\n]+/g, "").trim();
  if (!cleaned || !cleaned.includes(";")) {
    return { ok: false, error: "Ongeldige scan (verwacht serial;cardAppId)." };
  }
  const [serial, cardAppId] = cleaned.split(";").map((part) => part.trim());

  const clientId = process.env.KUL_CARD_CLIENT_ID;
  const clientSecret = process.env.KUL_CARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Kaartverificatie is niet geconfigureerd (KUL_CARD_CLIENT_ID/SECRET ontbreekt)." };
  }

  const { tokenUrl, idUrl, relay } = resolveEndpoints();
  const via = relay ? ", via relay" : "";

  // 1) client_credentials → access token
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const token = await postToKul(
    tokenUrl,
    {
      headers: {
        ...authorizationHeaders(relay, `Basic ${basic}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    },
    relay,
  );
  if ("failure" in token) return token.failure;
  if (!token.response.ok) {
    return { ok: false, error: `Token-uitwisseling met KU Leuven mislukt (${token.response.status}${via}).` };
  }
  const tokenJson = (await token.response.json().catch(() => null)) as { access_token?: unknown } | null;
  const accessToken = typeof tokenJson?.access_token === "string" ? tokenJson.access_token : null;
  if (!accessToken) return { ok: false, error: "Geen access_token ontvangen van KU Leuven." };

  // 2) idverification → { userName (r-nummer), firstName, lastName, ... }
  const verification = await postToKul(
    idUrl,
    {
      headers: {
        ...authorizationHeaders(relay, `Bearer ${accessToken}`),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cardAppId, serialNr: serial }),
    },
    relay,
  );
  if ("failure" in verification) return verification.failure;
  const verifyRes = verification.response;

  const text = await verifyRes.text().catch(() => "");
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!verifyRes.ok) {
    return { ok: false, error: `KU Leuven-verificatie mislukt (${verifyRes.status}${via}).` };
  }
  if (!json || typeof json !== "object") {
    return { ok: false, error: "Onverwachte respons van KU Leuven." };
  }

  const data = json as Record<string, unknown>;
  const rNumber = extractRNumber(data);
  if (!rNumber) return { ok: false, error: "Geen r-nummer in de KU Leuven-respons." };

  return {
    ok: true,
    rNumber,
    firstName: typeof data.firstName === "string" ? data.firstName : "",
    lastName: typeof data.lastName === "string" ? data.lastName : "",
  };
}
