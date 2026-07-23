import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_BASE_PATH, currentWorkingYear } from '@vtk/auth';
import { getSession } from '@vtk/auth/server';
import {
  AUTHORIZATION_PREVIEW_COOKIE,
  blocksAuthorizationPreviewMutation,
} from '@/lib/authorization-preview-constants';

// RFC 8414 par. 3.1 schuift het well-known-segment tussen host en pad. Die vorm
// valt buiten de catch-all van `app/api/auth/[...all]`, dus rewriten we hem naar
// het endpoint dat de plugin al bedient; zo blijft er één handler. De
// OIDC-variant zit al onder basePath en heeft dit niet nodig.
const RFC8414_METADATA_PATH = '/.well-known/oauth-authorization-server';

const LOCALES = ['nl', 'en'] as const;
const DEFAULT_LOCALE = 'nl';

function protectTicketResponse(response: NextResponse, pathname: string): NextResponse {
  const localizedPath = pathname.replace(/^\/(?:nl|en)(?=\/|$)/, '');
  const isOrderPage = localizedPath.startsWith('/tickets/bestelling/');
  const isAccountPage = localizedPath === '/account';

  if (isOrderPage || isAccountPage) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Referrer-Policy', 'no-referrer');
  }

  return response;
}

// A request is a short-link request when its host is a short-link host. By
// convention that is any host whose first label is "on", so it works in every
// environment without configuration: on.vtk.be (prod), on.main-dev.vtk.be
// (dev), etc. Set SHORTLINK_HOST to a comma-separated list to override the
// convention with an exact allowlist instead.
function isShortlinkHost(host: string): boolean {
  const configured = process.env.SHORTLINK_HOST?.trim();
  if (configured) {
    return configured
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
      .includes(host);
  }
  return host.split('.')[0] === 'on';
}

// Where the bare short-link host (no slug) should land: the main site for this
// environment, derived by stripping the leading "on." label so it always
// matches the current host (on.main-dev.vtk.be -> https://main-dev.vtk.be).
function mainSiteUrl(host: string): string {
  return `https://${host.replace(/^on\./, '')}`;
}

/**
 * Onboarding/studiebevestiging-gate.
 *
 * Deze redirect leeft BEWUST in de proxy en niet in `[locale]/layout.tsx`. Een
 * `redirect()` vanuit een gedeelde layout tijdens een client-side (RSC) navigatie
 * zet de App Router-cache in een oneindige refetch-lus: na login redirect de
 * server-action naar `/`, de layout van `/` redirect naar `/studie-bevestigen`,
 * en de router blijft dat pagina-segment herophalen (~1/s) zonder ooit te
 * settelen. Next waarschuwt hier expliciet voor (auth-checks horen niet in
 * layouts, want die her-renderen niet op navigatie). Een redirect op de
 * netwerkgrens is daarentegen een gewone 307 die de router netjes volgt.
 *
 * Draait op de Node.js-runtime (de default voor proxy in Next 16), dus
 * `getSession` (Prisma) werkt hier.
 *
 * @returns een redirect-response wanneer de gate moet ingrijpen, anders `null`.
 */
async function gateRedirect(request: NextRequest, internalPath: string): Promise<NextResponse | null> {
  // Prefetch-requests niet gaten: Next prefetcht elke <Link>, en een prefetch
  // omleiden naar de gate-pagina laat de router die redirect volgen in een lus.
  // De echte navigatie (zonder deze header) wordt wel gegated.
  if (request.headers.get('next-router-prefetch') === '1') return null;

  const [, locale, segment] = internalPath.split('/');

  // Goedkope short-circuit: geen sessie -> anoniem -> geen gate. `getSession`
  // geeft zonder geldige sessiecookie snel `null` terug (geen zware queries).
  const session = await getSession(request.headers);
  if (!session) return null;

  const enPrefix = locale === 'en' ? '/en' : '';

  // 1. Onboarding: profiel nog niet ingevuld -> eerst dat afwerken.
  if (!session.user.onboarded) {
    if (segment !== 'onboarding') {
      return NextResponse.redirect(new URL(`${enPrefix}/onboarding`, request.url));
    }
    return null;
  }

  // 2. Studiebevestiging: bij elk nieuw werkingsjaar declareert het lid opnieuw
  //    wat het studeert (vervangt het jaarlijkse cursusdienst-signaal en houdt
  //    de mailinglijsten beperkt tot wie effectief nog studeert).
  if (session.user.studyConfirmedYear !== currentWorkingYear()) {
    if (segment !== 'studie-bevestigen') {
      return NextResponse.redirect(new URL(`${enPrefix}/studie-bevestigen`, request.url));
    }
  }

  return null;
}

// Rewrite (not redirect) paths without a locale prefix to /nl internally so
// Dutch URLs stay clean (no /nl prefix in the address bar) while English URLs
// live under /en/*.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Authorization preview is deliberately read-only. Block every mutation at
  // the network boundary, including Server Actions and API routes. The single
  // stop endpoint is the escape hatch that clears the HttpOnly cookie.
  const previewMutation = blocksAuthorizationPreviewMutation(
    request.cookies.has(AUTHORIZATION_PREVIEW_COOKIE),
    request.method,
    pathname,
  );
  if (previewMutation && (await getSession(request.headers))?.user.isSuperAdmin) {
    return NextResponse.json(
      { error: 'AUTHORIZATION_PREVIEW_READ_ONLY' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  // API routes need the preview mutation guard above, but never locale
  // rewriting or the profile-completion gate below.
  if (pathname.startsWith('/api/')) return NextResponse.next();

  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (isShortlinkHost(host)) {
    const slug = pathname.replace(/^\/+/, '').split('/')[0];
    // Bare host with no slug -> send visitors to the main site.
    if (!slug) {
      return NextResponse.redirect(new URL(mainSiteUrl(host)));
    }
    const url = request.nextUrl.clone();
    url.pathname = `/api/go/${encodeURIComponent(slug)}`;
    url.search = '';
    return NextResponse.rewrite(url);
  }

  // RFC 8414-vorm van de discovery-metadata (zie RFC8414_METADATA_PATH).
  if (pathname === `${RFC8414_METADATA_PATH}${AUTH_BASE_PATH}`) {
    const url = request.nextUrl.clone();
    url.pathname = `${AUTH_BASE_PATH}${RFC8414_METADATA_PATH}`;
    return NextResponse.rewrite(url);
  }

  // The scanner has its own full-screen route group and must not receive a
  // locale rewrite to /nl/scan.
  if (pathname === '/scan' || pathname.startsWith('/scan/')) {
    return NextResponse.next();
  }

  const segments = pathname.split('/');
  const first = segments[1];

  // Expose the resolved, locale-prefixed path to server components. Request
  // headers are the supported channel for passing proxy -> app data (see
  // proxy.md).
  const internalPath =
    first && (LOCALES as readonly string[]).includes(first)
      ? pathname
      : `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`;

  // Onboarding/studiebevestiging-gate op de netwerkgrens (zie gateRedirect).
  const gate = await gateRedirect(request, internalPath);
  if (gate) return gate;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', internalPath);

  if (first && (LOCALES as readonly string[]).includes(first)) {
    return protectTicketResponse(NextResponse.next({ request: { headers: requestHeaders } }), pathname);
  }

  const url = request.nextUrl.clone();
  url.pathname = internalPath;
  url.search = search;
  return protectTicketResponse(NextResponse.rewrite(url, { request: { headers: requestHeaders } }), pathname);
}

export const config = {
  matcher: [
    // API routes participate only in the read-only preview guard.
    '/api/:path*',
    // Exclude Next internals, API routes, static assets.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
    // Bovenstaande sluit elk pad met een punt erin uit (statische assets), dus
    // ook /.well-known/*. Deze entry haalt enkel de OAuth-metadata terug binnen.
    // Moet een letterlijke string zijn: Next leest de matcher bij build-time,
    // dus AUTH_BASE_PATH kan hier niet geïnterpoleerd worden.
    '/.well-known/oauth-authorization-server/:path*',
  ],
};
