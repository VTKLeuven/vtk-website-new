import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["nl", "en"] as const;
const DEFAULT_LOCALE = "nl";

function protectTicketResponse(response: NextResponse, pathname: string): NextResponse {
  const localizedPath = pathname.replace(/^\/(?:nl|en)(?=\/|$)/, "");
  const isOrderPage = localizedPath.startsWith("/tickets/bestelling/");
  const isAccountPage =
    localizedPath === "/mijn-tickets" || localizedPath.startsWith("/mijn-tickets/");

  if (isOrderPage || isAccountPage) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Referrer-Policy", "no-referrer");
  }

  return response;
}

// Rewrite (not redirect) paths without a locale prefix to /nl internally so
// Dutch URLs stay clean (no /nl prefix in the address bar) while English URLs
// live under /en/*.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The scanner has its own full-screen route group and must not receive a
  // locale rewrite to /nl/scan.
  if (pathname === "/scan" || pathname.startsWith("/scan/")) {
    return NextResponse.next();
  }

  const segments = pathname.split("/");
  const first = segments[1];

  if (first && (LOCALES as readonly string[]).includes(first)) {
    return protectTicketResponse(NextResponse.next(), pathname);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return protectTicketResponse(NextResponse.rewrite(url), pathname);
}

export const config = {
  matcher: [
    // Exclude Next internals, API routes, static assets.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
