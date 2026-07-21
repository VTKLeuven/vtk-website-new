import { describe, expect, it } from 'vitest';
import { hasPrompt, isOAuthRequest, resumeAuthorizeUrl, signedOAuthQuery, type RawSearchParams } from '@/lib/oauthFlow';

/**
 * Zoals Next `searchParams` aanlevert: herhaalde sleutels worden een array.
 * De plugin gebruikt `ba_param` meerdere keren, dus dat is hier de regel en
 * niet de uitzondering.
 */
function asSearchParams(query: string): RawSearchParams {
  const params = new URLSearchParams(query);
  const out: RawSearchParams = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    out[key] = values.length === 1 ? values[0] : values;
  }
  return out;
}

/** Een realistische ondertekende autorisatie-query zoals de plugin ze bouwt. */
const SIGNED_QUERY = [
  'response_type=code',
  'client_id=demo',
  'redirect_uri=https%3A%2F%2Fapp.vtk.be%2Fcallback',
  'scope=openid+profile+email',
  'state=abc123',
  'exp=9999999999',
  'ba_iat=1784580740251',
  'ba_param=ba_iat',
  'ba_param=ba_param',
  'ba_param=client_id',
  'ba_param=exp',
  'ba_param=redirect_uri',
  'ba_param=response_type',
  'ba_param=scope',
  'ba_param=state',
  'sig=Zm9vYmFy',
].join('&');

describe('signedOAuthQuery', () => {
  it('rebuilds the signed query from Next searchParams', () => {
    const rebuilt = signedOAuthQuery(asSearchParams(SIGNED_QUERY));
    expect(rebuilt).not.toBeNull();

    // Volgorde doet er niet toe (de plugin sorteert voor ze tekent), de inhoud wel.
    expect(new URLSearchParams(rebuilt!).getAll('ba_param').sort()).toEqual(
      new URLSearchParams(SIGNED_QUERY).getAll('ba_param').sort()
    );
    expect(new URLSearchParams(rebuilt!).get('sig')).toBe('Zm9vYmFy');
    expect(new URLSearchParams(rebuilt!).get('state')).toBe('abc123');
  });

  it('drops parameters that were not signed, so extra query junk cannot break the signature', () => {
    const polluted = { ...asSearchParams(SIGNED_QUERY), utm_source: 'nieuwsbrief', next: '/ergens' };
    const rebuilt = signedOAuthQuery(polluted);
    const params = new URLSearchParams(rebuilt!);

    expect(params.get('utm_source')).toBeNull();
    expect(params.get('next')).toBeNull();
    expect(params.get('client_id')).toBe('demo');
  });

  it('keeps every value of a repeated signed parameter', () => {
    const query = 'a=1&a=2&sig=x&ba_param=a&ba_param=sig&ba_param=ba_param';
    const rebuilt = signedOAuthQuery(asSearchParams(query));
    expect(new URLSearchParams(rebuilt!).getAll('a')).toEqual(['1', '2']);
  });

  it('survives values containing spaces and reserved characters', () => {
    // Het ontwerpdocument noemt dit expliciet als het meest waarschijnlijke bug.
    const query = new URLSearchParams({
      scope: 'openid profile vtk:study_programme',
      state: 'a b&c=d#e',
      sig: 'x',
    });
    for (const name of ['scope', 'state', 'sig', 'ba_param']) query.append('ba_param', name);

    const rebuilt = signedOAuthQuery(asSearchParams(query.toString()));
    const params = new URLSearchParams(rebuilt!);
    expect(params.get('scope')).toBe('openid profile vtk:study_programme');
    expect(params.get('state')).toBe('a b&c=d#e');
  });

  it('returns null when there is no signature or no signed-name list', () => {
    expect(signedOAuthQuery(asSearchParams('client_id=demo'))).toBeNull();
    expect(signedOAuthQuery(asSearchParams('client_id=demo&sig=x'))).toBeNull();
    expect(isOAuthRequest(asSearchParams('next=/account'))).toBe(false);
    expect(isOAuthRequest(asSearchParams(SIGNED_QUERY))).toBe(true);
  });
});

describe('resumeAuthorizeUrl', () => {
  it('points back at the authorize endpoint with the original parameters', () => {
    const url = resumeAuthorizeUrl(asSearchParams(SIGNED_QUERY));
    expect(url.startsWith('/api/auth/better/oauth2/authorize?')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('client_id')).toBe('demo');
    expect(params.get('state')).toBe('abc123');
  });

  it('strips prompt=login so authorize does not bounce straight back to the login page', () => {
    const url = resumeAuthorizeUrl(asSearchParams(`${SIGNED_QUERY}&prompt=login`));
    expect(new URLSearchParams(url.split('?')[1]).get('prompt')).toBeNull();
  });

  it('keeps other prompt values while removing only login', () => {
    const url = resumeAuthorizeUrl(asSearchParams(`${SIGNED_QUERY}&prompt=login+consent`));
    expect(new URLSearchParams(url.split('?')[1]).get('prompt')).toBe('consent');
  });

  it('leaves a query without prompt untouched', () => {
    const url = resumeAuthorizeUrl(asSearchParams(SIGNED_QUERY));
    expect(new URLSearchParams(url.split('?')[1]).get('prompt')).toBeNull();
  });
});

describe('hasPrompt', () => {
  it('matches whole space-separated values only', () => {
    expect(hasPrompt(asSearchParams('prompt=login+consent'), 'login')).toBe(true);
    expect(hasPrompt(asSearchParams('prompt=login+consent'), 'consent')).toBe(true);
    expect(hasPrompt(asSearchParams('prompt=select_account'), 'login')).toBe(false);
    expect(hasPrompt(asSearchParams('client_id=demo'), 'login')).toBe(false);
  });
});
