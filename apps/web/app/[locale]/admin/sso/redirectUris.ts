/**
 * Dezelfde regels als `SafeUrlSchema` in de OAuth-plugin, zodat een fout hier
 * al opvalt en niet pas als een afgekeurde aanvraag terugkomt.
 *
 * Gedeeld door de wizard (voor je verder klikt) en de bewerkactie (server-side,
 * want een client kan het formulier omzeilen).
 */
export type RedirectUriProblem = {
  code: 'INVALID_URL' | 'FRAGMENT' | 'NOT_HTTPS';
  uri: string;
};

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

/** @returns het eerste probleem, of `null` wanneer alles in orde is. */
export function checkRedirectUris(uris: string[]): RedirectUriProblem | null {
  for (const uri of uris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return { code: 'INVALID_URL', uri };
    }
    // Een fragment mag niet (RFC 6749 par. 3.1.2).
    if (uri.includes('#')) return { code: 'FRAGMENT', uri };
    // http stuurt de autorisatiecode leesbaar over de lijn; op loopback is er
    // geen netwerk en is het dus onschadelijk.
    if (parsed.protocol === 'http:' && !isLoopback(parsed.hostname)) {
      return { code: 'NOT_HTTPS', uri };
    }
  }
  return null;
}

export function describeRedirectUriProblem(problem: RedirectUriProblem, nl: boolean): string {
  const { code, uri } = problem;
  if (code === 'INVALID_URL') {
    return nl
      ? `"${uri}" is geen volledige URL. Gebruik bv. https://app.vtk.be/callback.`
      : `"${uri}" is not a full URL. Use e.g. https://app.vtk.be/callback.`;
  }
  if (code === 'FRAGMENT') {
    return nl
      ? `"${uri}" bevat een fragment (#...). Dat is niet toegelaten in een redirect-URI.`
      : `"${uri}" contains a fragment (#...), which is not allowed in a redirect URI.`;
  }
  return nl
    ? `"${uri}" moet https gebruiken. Alleen localhost mag over http, want daar gaat er niets over het netwerk.`
    : `"${uri}" must use https. Only localhost may use http, since nothing travels over the network there.`;
}
