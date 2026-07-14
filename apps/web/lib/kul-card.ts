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
 */

const DEFAULT_AUTH_ENDPOINT =
  "https://idp.kuleuven.be/auth/realms/kuleuven/protocol/openid-connect/token";
const DEFAULT_ID_ENDPOINT = "https://account.kuleuven.be/api/v1/idverification";

export type CardVerifyResult =
  | { ok: true; rNumber: string; firstName: string; lastName: string }
  | { ok: false; error: string };

/** Haalt het eerste veld op dat op een KU Leuven r-/u-nummer lijkt (rXXXXXXX). */
function extractRNumber(data: Record<string, unknown>): string {
  const direct = typeof data.userName === "string" ? data.userName : "";
  if (direct) return direct;
  for (const value of Object.values(data)) {
    if (typeof value === "string" && /^[ru]\d{7}$/i.test(value.trim())) return value;
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
  const [serial, cardAppId] = cleaned.split(";");

  const clientId = process.env.KUL_CARD_CLIENT_ID;
  const clientSecret = process.env.KUL_CARD_CLIENT_SECRET;
  const authEndpoint = process.env.KUL_CARD_AUTH_ENDPOINT || DEFAULT_AUTH_ENDPOINT;
  const idEndpoint = process.env.KUL_CARD_ID_ENDPOINT || DEFAULT_ID_ENDPOINT;

  if (!clientId || !clientSecret) {
    return { ok: false, error: "Kaartverificatie is niet geconfigureerd (KUL_CARD_CLIENT_ID/SECRET ontbreekt)." };
  }

  try {
    // 1) client_credentials → access token
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch(authEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    });
    if (!tokenRes.ok) return { ok: false, error: "Token-uitwisseling met KU Leuven mislukt." };
    const tokenJson = (await tokenRes.json().catch(() => null)) as { access_token?: unknown } | null;
    const accessToken = typeof tokenJson?.access_token === "string" ? tokenJson.access_token : null;
    if (!accessToken) return { ok: false, error: "Geen access_token ontvangen van KU Leuven." };

    // 2) idverification → { userName (r-nummer), firstName, lastName, ... }
    const verifyRes = await fetch(idEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cardAppId, serialNr: serial }),
    });
    const text = await verifyRes.text().catch(() => "");
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!verifyRes.ok) {
      return { ok: false, error: `KU Leuven-verificatie mislukt (${verifyRes.status}).` };
    }
    if (!json || typeof json !== "object") {
      return { ok: false, error: "Onverwachte respons van KU Leuven." };
    }

    const data = json as Record<string, unknown>;
    const rNumber = extractRNumber(data).trim().toLowerCase();
    if (!rNumber) return { ok: false, error: "Geen r-nummer in de KU Leuven-respons." };

    return {
      ok: true,
      rNumber,
      firstName: typeof data.firstName === "string" ? data.firstName : "",
      lastName: typeof data.lastName === "string" ? data.lastName : "",
    };
  } catch (err) {
    console.error("[theokot] kaartverificatie mislukt:", err);
    return { ok: false, error: "Kaartverificatie mislukt (netwerkfout)." };
  }
}
