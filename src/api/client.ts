import { clearCache, getPref, setPref } from '../storage';
import { APP_ERROR, type AppErrorBody } from './contract';

/**
 * De HTTP-laag naar vtk-website-new.
 *
 * **Waarom hier geen cookie-hantering staat.** De app logt in via de gewone
 * weblogin in een WebView (`app/inloggen.tsx`). Het better-auth sessiecookie
 * belandt daarmee in de cookie-opslag van het besturingssysteem, en `fetch` in
 * React Native gebruikt diezelfde opslag: op iOS `NSHTTPCookieStorage`, op
 * Android de `CookieManager` die ook onder de WebView zit. Het cookie reist dus
 * vanzelf mee, en er is geen tweede kopie die uit de pas kan lopen.
 *
 * Dat is ook de reden dat de app KU Leuven-logins gewoon aankan: we bouwen geen
 * eigen loginformulier na, we tonen dat van de site.
 *
 * Zelfde bestand als in vtk-scanner-app, op de app-API-paden na. Bewust een
 * kopie: twee losse repo's delen hier geen pakket voor.
 */

const BASE_URL_KEY = 'base-url';
const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_VTK_URL?.trim() || 'https://vtk.be';

export function baseUrl(): string {
  return (getPref(BASE_URL_KEY) ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function defaultBaseUrl(): string {
  return DEFAULT_BASE_URL;
}

/**
 * Lokaal testen tegen een cloudflared-tunnel, zonder rebuild.
 *
 * Gooit de leescache weg: die hoort bij één site, en inhoud van de ene server op
 * de andere tonen levert schermen op die iets beweren dat er niet is.
 */
export function setBaseUrl(value: string): void {
  const next = value.trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
  if (next === baseUrl()) return;
  setPref(BASE_URL_KEY, next);
  clearCache();
}

/** Een antwoord van de server dat de app zelf moet kunnen onderscheiden. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Sessie verlopen of nooit ingelogd: dit scherm vraagt een login. */
  get isUnauthenticated() {
    return this.status === 401 || this.code === APP_ERROR.unauthenticated;
  }

  /** Ingelogd, maar niet toegelaten. */
  get isForbidden() {
    return this.status === 403 || this.code === APP_ERROR.forbidden;
  }

  get isNotFound() {
    return this.status === 404 || this.code === APP_ERROR.notFound;
  }
}

/** Er kwam geen antwoord. Iets anders dan een fout van de server, en de app toont dat ook anders. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Geen verbinding');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Milliseconden voor de aanvraag opgegeven wordt. */
  timeout?: number;
  signal?: AbortSignal;
};

/**
 * Eén aanvraag naar de site.
 *
 * Gooit `NetworkError` wanneer er geen antwoord kwam en `ApiError` wanneer de
 * server wél antwoordde maar met een fout. De schermen behandelen die twee
 * verschillend: bij het eerste tonen ze wat er in de cache staat, bij het tweede
 * de melding van de server.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 12_000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new NetworkError(error);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }

  const payload = (await response.json().catch(() => null)) as (T & AppErrorBody) | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.message ?? payload?.error ?? `HTTP ${response.status}`,
      response.status,
      payload?.error,
    );
  }
  if (payload === null) throw new ApiError('Leeg antwoord', response.status);
  return payload;
}

/** Het pad van een app-API-endpoint, met de taal erin. Eén plek voor de versie. */
export function appApi(path: string, params?: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) search.set(key, value);
  }
  const query = search.toString();
  return `/api/app/v1${path}${query ? `?${query}` : ''}`;
}
