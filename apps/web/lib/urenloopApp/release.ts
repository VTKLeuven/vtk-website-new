import "server-only";

import { getObjectBuffer } from "@vtk/storage";
import { RELEASE_KEY, type ReleaseManifest } from "./config";

/**
 * Leest het manifest dat de CI van 24urenloop-new naast de installatiebestanden
 * schrijft, zodat de downloadpagina kan zeggen welke versie er klaarstaat.
 *
 * Geeft null terug wanneer er nog nooit een build geweest is, of wanneer de
 * objectopslag niet bereikbaar is: de pagina toont dan de downloadknoppen zonder
 * versienummer, wat nog altijd bruikbaar is. Een lege pagina omdat één
 * hulpbestand ontbreekt zou erger zijn dan een pagina zonder versienummer.
 */
export async function readReleaseManifest(): Promise<ReleaseManifest | null> {
  try {
    const buffer = await getObjectBuffer(RELEASE_KEY);
    const parsed = JSON.parse(buffer.toString("utf8")) as ReleaseManifest;
    if (typeof parsed.version !== "string" || !parsed.version) return null;
    return {
      version: parsed.version,
      commit: typeof parsed.commit === "string" ? parsed.commit : "",
      builtAt: typeof parsed.builtAt === "string" ? parsed.builtAt : "",
      files: Array.isArray(parsed.files) ? parsed.files : [],
    };
  } catch {
    return null;
  }
}

/** Bytes -> "291 MB", voor naast een downloadknop. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
