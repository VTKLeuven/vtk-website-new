import "server-only";

import type { GoogleConfig } from "./config";
import { type GoogleUser, listUsers } from "./client";

/**
 * De accounts van het domein, vijf minuten per proces bewaard. Voor de
 * zoekvelden die bij elke toets zoeken: de hele directory ophalen kost een paar
 * aanroepen naar Google, en dat hoort niet per letter te gebeuren.
 */
const TTL_MS = 5 * 60_000;
let cache: { key: string; at: number; users: GoogleUser[] } | null = null;

export async function cachedDirectory(cfg: GoogleConfig): Promise<GoogleUser[]> {
  const key = `${cfg.domain}|${cfg.subject}`;
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.users;
  const users = await listUsers(cfg);
  cache = { key, at: Date.now(), users };
  return users;
}
