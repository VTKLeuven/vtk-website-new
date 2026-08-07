import "server-only";

import {
  MUNISENSE_TIMEOUT_MS,
  munisenseCredentials,
  munisenseLoginOrigin,
  munisenseSessionTtlMs,
} from "./config";
import { absorbSetCookies, cookieHeader, createCookieJar, readSetCookies } from "./cookieJar";
import { parseLoginForm } from "./loginForm";

/**
 * Inloggen op login.munisense.net met gebruikersnaam en wachtwoord, omdat we
 * geen API-sleutel hebben. De sessie leeft in het geheugen van dit proces en
 * wordt hergebruikt: enkel de worker (elke paar minuten) gebruikt hem, dus dat
 * zijn een handvol logins per dag.
 *
 * Foutmeldingen bevatten nooit de response-body of de credentials: die zouden
 * anders in Sentry belanden.
 */

const USER_AGENT = "vtk.be barstatus (https://vtk.be)";
/** De cookie die bewijst dat we ingelogd zijn. */
const AUTH_COOKIE = "MuniToken";

export class MunisenseAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "MunisenseAuthError";
  }
}

/** Gegooid door de datalaag wanneer de sessie niet (meer) geldig is. */
export class MunisenseUnauthorizedError extends Error {
  constructor(readonly status: number) {
    super(`Munisense wees het verzoek af (${status})`);
    this.name = "MunisenseUnauthorizedError";
  }
}

type MuniSession = { cookie: string; obtainedAt: number };

let session: MuniSession | null = null;
let inflight: Promise<MuniSession> | null = null;

function expired(current: MuniSession, now: number): boolean {
  return now - current.obtainedAt >= munisenseSessionTtlMs();
}

async function login(): Promise<MuniSession> {
  const credentials = munisenseCredentials();
  if (!credentials) throw new MunisenseAuthError("MUNISENSE_USERNAME/PASSWORD ontbreken");

  const origin = munisenseLoginOrigin();
  const loginUrl = `${origin}/login`;
  const jar = createCookieJar();

  // Stap 1: de loginpagina halen. Levert de sessiecookie en het formulier met
  // het CSRF-token.
  const page = await fetch(loginUrl, {
    method: "GET",
    redirect: "manual",
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(MUNISENSE_TIMEOUT_MS),
  });
  absorbSetCookies(jar, readSetCookies(page.headers));
  if (!page.ok) throw new MunisenseAuthError("Loginpagina niet bereikbaar", page.status);
  const form = parseLoginForm(await page.text());

  // Stap 2: posten als multipart/form-data. De boundary laten we door undici
  // genereren; een handmatige content-type header breekt precies dat.
  const body = new FormData();
  for (const [name, value] of Object.entries(form.hidden)) body.set(name, value);
  body.set(form.userField, credentials.username);
  body.set(form.passField, credentials.password);

  const action = form.action ? new URL(form.action, loginUrl).toString() : loginUrl;
  const posted = await fetch(action, {
    method: "POST",
    body,
    redirect: "manual",
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      cookie: cookieHeader(jar),
      referer: loginUrl,
    },
    signal: AbortSignal.timeout(MUNISENSE_TIMEOUT_MS),
  });
  absorbSetCookies(jar, readSetCookies(posted.headers));

  // Stap 3: de 302 zelf afhandelen. `redirect: "manual"` houdt hem zichtbaar,
  // zodat we de cookies eruit halen; daarna volgen we hem één keer, want vaak
  // zet pas de bestemming het MuniToken.
  const location = posted.headers.get("location");
  if (location && posted.status >= 300 && posted.status < 400) {
    const followed = await fetch(new URL(location, action).toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        cookie: cookieHeader(jar),
      },
      signal: AbortSignal.timeout(MUNISENSE_TIMEOUT_MS),
    });
    absorbSetCookies(jar, readSetCookies(followed.headers));
  }

  if (!jar.has(AUTH_COOKIE)) {
    // Geen MuniToken betekent in de praktijk verkeerde credentials of een
    // gewijzigd formulier. De body loggen we niet.
    throw new MunisenseAuthError(
      `Login gaf geen ${AUTH_COOKIE}-cookie (velden: ${Object.keys(form.hidden).join(",") || "geen"})`,
      posted.status
    );
  }

  return { cookie: cookieHeader(jar), obtainedAt: Date.now() };
}

async function ensureSession(force = false): Promise<MuniSession> {
  const now = Date.now();
  if (!force && session && !expired(session, now)) return session;
  // Eén login tegelijk, ook wanneer twee cycli elkaar overlappen.
  if (!inflight) {
    inflight = login()
      .then((fresh) => {
        session = fresh;
        return fresh;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Draait `fn` met een geldige cookie-header. Wijst Munisense het verzoek af,
 * dan loggen we één keer opnieuw in en proberen we het nog eens; daarna niet
 * meer, zodat verkeerde credentials geen retry-storm worden.
 */
export async function withMuniSession<T>(fn: (cookie: string) => Promise<T>): Promise<T> {
  const current = await ensureSession();
  try {
    return await fn(current.cookie);
  } catch (error) {
    if (!(error instanceof MunisenseUnauthorizedError)) throw error;
    session = null;
    const refreshed = await ensureSession(true);
    return fn(refreshed.cookie);
  }
}

/** Enkel voor tests: vergeet de sessie in het geheugen. */
export function resetMuniSession(): void {
  session = null;
  inflight = null;
}
