/**
 * Helpers voor de schermen die midden in een OAuth2-autorisatie staan: de
 * loginpagina en het toestemmingsscherm. De ondertekende query in de URL draagt
 * de volledige flowstatus; er staat niets in een cookie.
 */
import { AUTH_BASE_PATH } from '@vtk/auth';

export const AUTHORIZE_PATH = `${AUTH_BASE_PATH}/oauth2/authorize`;

/** Zoals Next `searchParams` aanlevert: herhaalde sleutels worden een array. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** De plugin somt hierin op welke parameternamen mee ondertekend zijn. */
const SIGNED_NAMES_PARAM = 'ba_param';

function entries(searchParams: RawSearchParams): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const single of Array.isArray(value) ? value : [value]) out.push([key, single]);
  }
  return out;
}

/**
 * Bouwt de ondertekende query opnieuw op zodat hij terug kan naar
 * `/oauth2/consent`. Kopie van `buildSignedOAuthQuery`, dat de plugin niet
 * exporteert. Volgorde maakt niet uit (de plugin sorteert voor ze tekent en
 * verifieert); exact de ondertekende sleutels meenemen wel.
 */
export function signedOAuthQuery(searchParams: RawSearchParams): string | null {
  const all = entries(searchParams);
  const signedNames = new Set(all.filter(([k]) => k === SIGNED_NAMES_PARAM).map(([, v]) => v));
  if (!signedNames.size) return null;
  if (!all.some(([k]) => k === 'sig')) return null;

  const signed = new URLSearchParams();
  for (const [key, value] of all) {
    if (key === 'sig' || key === SIGNED_NAMES_PARAM || signedNames.has(key)) {
      signed.append(key, value);
    }
  }
  return signed.toString();
}

export function isOAuthRequest(searchParams: RawSearchParams): boolean {
  return signedOAuthQuery(searchParams) !== null;
}

/** `prompt` is spatie-gescheiden. */
export function hasPrompt(searchParams: RawSearchParams, prompt: string): boolean {
  const raw = searchParams.prompt;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return !!value && value.split(' ').includes(prompt);
}

/**
 * URL om de autorisatie te hervatten na een geslaagde login. `prompt=login`
 * moet eruit, anders stuurt authorize meteen terug naar de loginpagina en hangt
 * de gebruiker in een lus. Roep dit dus enkel aan waar effectief net ingelogd
 * is. De handtekening wordt hier niet gecontroleerd, dus aanpassen mag.
 */
export function resumeAuthorizeUrl(searchParams: RawSearchParams): string {
  const params = new URLSearchParams(entries(searchParams));

  const prompts = params
    .get('prompt')
    ?.split(' ')
    .filter((p) => p && p !== 'login');
  if (prompts?.length) params.set('prompt', prompts.join(' '));
  else params.delete('prompt');

  return `${AUTHORIZE_PATH}?${params.toString()}`;
}
