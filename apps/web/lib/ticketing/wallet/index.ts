import "server-only";

import {
  generateAppleWalletPass as generateDirectApplePass,
  isAppleWalletAvailable as isDirectAppleConfigured,
} from "./apple";
import {
  generateGoogleWalletSaveUrl as generateDirectGoogleSaveUrl,
  isGoogleWalletAvailable as isDirectGoogleConfigured,
} from "./google";
import { generateViaWalletWallet, isWalletWalletConfigured } from "./walletwallet";
import type { WalletTicketInput } from "./types";

export type { WalletTicketInput } from "./types";

export function isAppleWalletAvailable(): boolean {
  return isDirectAppleConfigured() || isWalletWalletConfigured();
}

export function isGoogleWalletAvailable(): boolean {
  return isDirectGoogleConfigured() || isWalletWalletConfigured();
}

/** VTK's own Apple Developer certificate wins when both are configured: it's
 * the path VTK fully owns, with walletwallet.dev as the fallback for when
 * that $99/year account isn't (yet) worth it. */
export async function getAppleWalletPass(input: WalletTicketInput): Promise<Buffer> {
  if (isDirectAppleConfigured()) return generateDirectApplePass(input);
  return (await generateViaWalletWallet(input)).applePassBuffer;
}

export async function getGoogleWalletSaveUrl(input: WalletTicketInput): Promise<string> {
  if (isDirectGoogleConfigured()) return generateDirectGoogleSaveUrl(input);
  return (await generateViaWalletWallet(input)).googleSaveUrl;
}
