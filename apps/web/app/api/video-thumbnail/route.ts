/**
 * Serveert de YouTube-thumbnail van een video via deze origin.
 *
 * De privacy-audit haalde `i.ytimg.com` terecht uit de `<img src>`: dan stuurt
 * elke bezoeker zijn IP en user-agent naar Google zonder ooit op play te
 * klikken. Zonder poster viel het aftermovie-rooster echter terug op een leeg
 * streepjespatroon. Deze route haalt het beeld server-side op en streamt het
 * terug, dus de browser praat enkel met ons; de embed zelf blijft achter de
 * klik zitten (zie `AftermovieGrid`).
 *
 * Enkel de 11-teken video-id wordt aanvaard, dus de route is geen open proxy.
 */

const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

// maxresdefault bestaat niet voor elke video; hqdefault altijd.
const VARIANTS = ["maxresdefault", "hqdefault"] as const;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !YOUTUBE_ID.test(id)) return new Response("Not found", { status: 404 });

  for (const variant of VARIANTS) {
    let upstream: Response;
    try {
      upstream = await fetch(`https://i.ytimg.com/vi/${id}/${variant}.jpg`, {
        // Een dag cachen op de server; thumbnails wijzigen zelden.
        next: { revalidate: 86400 },
      });
    } catch {
      return new Response("Bad gateway", { status: 502 });
    }
    if (!upstream.ok || !upstream.body) continue;

    return new Response(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  }

  return new Response("Not found", { status: 404 });
}
