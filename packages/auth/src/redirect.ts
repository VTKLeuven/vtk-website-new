/**
 * Safe redirect helpers for authentication flows.
 *
 * Prevents open-redirect attacks by only allowing relative paths (/...)
 * or absolute URLs on trusted VTK domains (*.vtk.be, vtk.be) and localhost (dev).
 */

const TRUSTED_DOMAINS = ['vtk.be'];

/**
 * Checks whether a given target URL is safe to redirect to.
 */
export function isSafeRedirectUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Geen controletekens. De URL-parser van de browser gooit tab en newline
  // weg, dus `/<tab>/evil.com` kwam door de check hieronder (één `/`, geen
  // `\`) en werd daarna `//evil.com`: een redirect naar een andere site.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return false;

  // Relative paths: must start with a single '/' and not contain backslashes or protocol-relative '//'
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
    // Tweede slot: wat de parser er zelf van maakt, moet op dezelfde origin
    // blijven. Vangt elke variant die de regel hierboven niet voorzag.
    const base = 'https://redirect-check.invalid';
    try {
      return new URL(trimmed, base).origin === base;
    } catch {
      return false;
    }
  }

  // Absolute URLs
  try {
    const parsed = new URL(trimmed);

    // Hostname check
    const hostname = parsed.hostname.toLowerCase();

    // In dev / test, allow localhost
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev && (hostname === 'localhost' || hostname.endsWith('.localhost'))) {
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    }

    // Trusted VTK domains require HTTPS
    if (parsed.protocol !== 'https:') return false;

    return TRUSTED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * Sanitizes the next redirect URL, falling back to `fallback` (default '/') if unsafe.
 */
export function sanitizeNextUrl(url: string | null | undefined, fallback = '/'): string {
  if (isSafeRedirectUrl(url)) {
    return url!.trim();
  }
  return fallback;
}
