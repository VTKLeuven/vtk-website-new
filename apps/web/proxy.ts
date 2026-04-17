import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["nl", "en"] as const;
const DEFAULT_LOCALE = "nl";

// Rewrite (not redirect) paths without a locale prefix to /nl internally so
// Dutch URLs stay clean (no /nl prefix in the address bar) while English URLs
// live under /en/*.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const segments = pathname.split("/");
  const first = segments[1];

  if (first && (LOCALES as readonly string[]).includes(first)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    // Exclude Next internals, API routes, static assets.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
