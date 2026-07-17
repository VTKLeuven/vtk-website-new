/**
 * Herkent een video-URL uit de admin en zet ze om naar een embed-URL plus een
 * posterbeeld.
 *
 * Stond eerst enkel in `AftermoviePlayer` (de /media-pagina). De homepage toont
 * dezelfde `media.aftermovies`-instelling in een eigen rooster; zonder gedeelde
 * helper zou een tweede kopie van deze regels naast de eerste gaan leven en
 * bijvoorbeeld wél youtu.be-links slikken maar geen /shorts.
 *
 * YouTube gaat bewust via `youtube-nocookie.com`, en de embed wordt pas geladen
 * na een klik (zie de bellers): anders zet een bezoek aan de homepage meteen
 * trackers van YouTube.
 */

const LOCAL_URL_BASE = "https://vtk.invalid";

export type SafeUrl = { href: string; parsed: URL };

export function safeUrl(value: string | null | undefined): SafeUrl | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return { href: raw, parsed: new URL(raw, LOCAL_URL_BASE) };
    }

    let candidate = raw;
    if (raw.startsWith("//")) {
      candidate = `https:${raw}`;
    } else if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(raw)) {
      candidate = `https://${raw}`;
    }

    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return { href: parsed.toString(), parsed };
  } catch {
    return null;
  }
}

export function youtubeVideoId(url: URL): string | null {
  const hostname = url.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
  let candidate: string | null = null;

  if (hostname === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (hostname === "youtube.com" || hostname === "youtube-nocookie.com") {
    if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    } else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
      candidate = match?.[1] ?? null;
    }
  }

  return candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

export function vimeoVideoId(url: URL): { id: string; hash: string | null } | null {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname !== "vimeo.com" && hostname !== "player.vimeo.com") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const idIndex = segments.findIndex((segment) => /^\d+$/.test(segment));
  if (idIndex === -1) return null;

  const pathHash = segments[idIndex + 1];
  const hash =
    url.searchParams.get("h") ?? (pathHash && /^[a-zA-Z0-9]+$/.test(pathHash) ? pathHash : null);
  return { id: segments[idIndex], hash };
}

export type VideoEmbed = {
  embedUrl: string;
  externalUrl: string;
  posterUrl: string | null;
};

/**
 * De embed voor een video-URL, of `null` wanneer het geen herkende video is.
 * Bedoeld voor oppervlakken die enkel embeds tonen (het homepage-rooster);
 * `AftermoviePlayer` heeft daarnaast nog losse mp4's en externe links nodig.
 */
export function videoEmbed(url: string, posterUrl?: string | null): VideoEmbed | null {
  const media = safeUrl(url);
  if (!media) return null;
  const suppliedPoster = safeUrl(posterUrl)?.href ?? null;

  const youtubeId = youtubeVideoId(media.parsed);
  if (youtubeId) {
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`,
      externalUrl: media.href,
      posterUrl: suppliedPoster ?? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  const vimeo = vimeoVideoId(media.parsed);
  if (vimeo) {
    const embedUrl = new URL(`https://player.vimeo.com/video/${vimeo.id}`);
    embedUrl.searchParams.set("dnt", "1");
    if (vimeo.hash) embedUrl.searchParams.set("h", vimeo.hash);
    return { embedUrl: embedUrl.toString(), externalUrl: media.href, posterUrl: suppliedPoster };
  }

  return null;
}
