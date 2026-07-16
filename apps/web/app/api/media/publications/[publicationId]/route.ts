import { getMediaContent, type MediaPublication } from "@/lib/media-content";
import { publicUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

const EXTERNAL_PDF_HOSTS = new Set(["vtk.be", "www.vtk.be"]);
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type PublicationSource = {
  url: URL;
  allowsRedirect: (url: URL) => boolean;
};

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function isAllowedExternalPdf(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443") &&
    EXTERNAL_PDF_HOSTS.has(url.hostname)
  );
}

function publicationSource(publication: MediaPublication): PublicationSource | null {
  if (publication.storageKey) {
    const resolved = publicUrl(publication.storageKey);
    const url = resolved ? parseHttpUrl(resolved) : null;
    if (url) {
      const origin = url.origin;
      return {
        url,
        allowsRedirect: (candidate) =>
          HTTP_PROTOCOLS.has(candidate.protocol) &&
          !candidate.username &&
          !candidate.password &&
          candidate.origin === origin,
      };
    }
  }

  if (publication.pdfUrl) {
    const url = parseHttpUrl(publication.pdfUrl);
    if (url && isAllowedExternalPdf(url)) {
      return { url, allowsRedirect: isAllowedExternalPdf };
    }
  }

  return null;
}

async function fetchOnce(url: URL, headers: Headers): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublication(source: PublicationSource, request: Request): Promise<Response> {
  const headers = new Headers({
    accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
    "accept-encoding": "identity",
  });
  const range = request.headers.get("range");
  const ifRange = request.headers.get("if-range");
  if (range) headers.set("range", range);
  if (ifRange) headers.set("if-range", ifRange);

  let url = source.url;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetchOnce(url, headers);
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location || redirectCount === 3) throw new Error("Publication redirect failed");
    const nextUrl = new URL(location, url);
    if (!source.allowsRedirect(nextUrl)) throw new Error("Publication redirect was not allowed");
    if (response.body) await response.body.cancel().catch(() => undefined);
    url = nextUrl;
  }

  throw new Error("Too many publication redirects");
}

function responseHeaders(upstream: Response, publicationId: string): Headers {
  const headers = new Headers({
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="${publicationId}.pdf"`,
    "x-content-type-options": "nosniff",
  });

  for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}

function errorResponse(status: 404 | 502): Response {
  return new Response(null, {
    status,
    headers: { "x-content-type-options": "nosniff" },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  let publications: MediaPublication[];
  try {
    ({ publications } = await getMediaContent());
  } catch {
    return errorResponse(502);
  }

  const { publicationId } = await context.params;
  const publication = publications.find((item) => item.id === publicationId);
  if (!publication) return errorResponse(404);

  const source = publicationSource(publication);
  if (!source) return errorResponse(502);

  try {
    const upstream = await fetchPublication(source, request);
    const headers = responseHeaders(upstream, publication.id);
    if (upstream.status === 416) return new Response(null, { status: 416, headers });
    if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body) {
      if (upstream.body) await upstream.body.cancel().catch(() => undefined);
      return errorResponse(502);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return errorResponse(502);
  }
}
