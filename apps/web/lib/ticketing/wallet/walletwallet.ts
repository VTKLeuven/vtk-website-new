import "server-only";

import { createTicketCredential } from "../crypto";
import { formatMoney } from "../money";
import { ticketDesignSnapshot } from "../design";
import { absoluteArtworkUrl, absoluteLogoUrl } from "./assets";
import { walletWalletConfig } from "./config";
import type { WalletTicketInput } from "./types";

const API_BASE = "https://api.walletwallet.dev";
const CACHE_TTL_MS = 10 * 60_000;

type WalletWalletResult = { applePassBuffer: Buffer; googleSaveUrl: string };
type CacheEntry = WalletWalletResult & { expiresAt: number };

// walletwallet.dev counts every create call against a monthly quota (free
// tier: 1000/month). The Apple and Google buttons hit this on independent
// requests, so a short in-memory cache stops a visitor who clicks both (or
// reloads the page) from spending quota twice on an identical pass. Resets
// on redeploy; that's fine, it's a rate-limit smoothing cache, not storage.
const cache = new Map<string, CacheEntry>();

export function isWalletWalletConfigured(): boolean {
  return walletWalletConfig() !== null;
}

export async function generateViaWalletWallet(input: WalletTicketInput): Promise<WalletWalletResult> {
  const config = walletWalletConfig();
  if (!config) throw new Error("WALLETWALLET_NOT_CONFIGURED");

  const design = ticketDesignSnapshot(input.designSnapshot, input.event.id ?? "legacy");
  const cacheKey = `${input.ticketId}:${design.revision}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const date = new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  }).format(input.event.startsAt);
  const daysUntilEvent = Math.ceil((input.event.startsAt.getTime() - Date.now()) / 86_400_000);
  const expirationDays = Math.min(3650, Math.max(1, daysUntilEvent + 1));
  const footer = [design.footerNl, design.footerEn].filter(Boolean).join(" / ");
  const logoURL = absoluteLogoUrl(design);
  const stripURL = absoluteArtworkUrl(design);

  const response = await fetch(`${API_BASE}/api/passes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      barcodeValue: createTicketCredential(input.publicId, input.qrVersion),
      barcodeFormat: "QR",
      logoText: "VTK",
      description: `${input.event.title} - ${input.orderNumber}`,
      organizationName: "VTK Leuven",
      primaryFields: [{ label: "EVENT", value: input.event.title }],
      secondaryFields: [
        { label: "DATUM / DATE", value: date },
        { label: "LOCATIE / LOCATION", value: input.event.location || "Locatie wordt nog bevestigd" },
      ],
      headerFields: [{ label: "TYPE", value: input.typeName }],
      backFields: [
        { label: "DEELNEMER / ATTENDEE", value: input.attendeeName },
        { label: "BESTELNUMMER / ORDER", value: input.orderNumber },
        { label: "PRIJS / PRICE", value: formatMoney(input.unitPriceCents, input.currency, "nl-BE") },
        { label: "TICKET-ID", value: input.publicId },
        ...(footer ? [{ label: "INFO", value: footer }] : []),
      ],
      // Free tier only accepts a preset; "dark" is the closest match to
      // VTK's default navy theme. `color`/`logoURL` are Pro-only extras: sent
      // best-effort so an upgraded account picks up real VTK branding
      // without a code change. The API fetches logoURL synchronously and
      // rejects the whole pass if it can't, so it's omitted rather than sent
      // as a dead localhost link.
      colorPreset: "dark",
      color: design.textColor,
      ...(logoURL ? { logoURL } : {}),
      ...(stripURL ? { stripURL } : {}),
      expirationDays,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[walletwallet] request failed", response.status, body);
    throw new Error(`WALLETWALLET_REQUEST_FAILED_${response.status}`);
  }
  const data = (await response.json()) as { applePass: string; googleSaveUrl: string };
  const result: CacheEntry = {
    applePassBuffer: Buffer.from(data.applePass, "base64"),
    googleSaveUrl: data.googleSaveUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  cache.set(cacheKey, result);
  return result;
}
