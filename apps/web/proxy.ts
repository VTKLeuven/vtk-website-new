import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["nl", "en"] as const;
const DEFAULT_LOCALE = "nl";

// A request is a short-link request when its host is a short-link host. By
// convention that is any host whose first label is "on" — so it works in every
// environment without configuration: on.vtk.be (prod), on.main-dev.vtk.be
// (dev), etc. Set SHORTLINK_HOST to a comma-separated list to override the
// convention with an exact allowlist instead.
function isShortlinkHost(host: string): boolean {
  const configured = process.env.SHORTLINK_HOST?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
      .includes(host);
  }
  return host.split(".")[0] === "on";
}

// Where the bare short-link host (no slug) should land: the main site for this
// environment, derived by stripping the leading "on." label so it always
// matches the current host (on.main-dev.vtk.be -> https://main-dev.vtk.be).
function mainSiteUrl(host: string): string {
  return `https://${host.replace(/^on\./, "")}`;
}

// Rewrite (not redirect) paths without a locale prefix to /nl internally so
// Dutch URLs stay clean (no /nl prefix in the address bar) while English URLs
// live under /en/*.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (isShortlinkHost(host)) {
    const slug = pathname.replace(/^\/+/, "").split("/")[0];
    // Bare host with no slug -> send visitors to the main site.
    if (!slug) {
      return NextResponse.redirect(new URL(mainSiteUrl(host)));
    }
    const url = request.nextUrl.clone();
    url.pathname = `/api/go/${encodeURIComponent(slug)}`;
    url.search = "";
    return NextResponse.rewrite(url);
  }

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
