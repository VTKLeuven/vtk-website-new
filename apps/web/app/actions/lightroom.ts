"use server";

import { requirePermission } from "@/lib/session";
import {
  fetchLightroomStatus,
  requestLightroomStart,
  requestLightroomStop,
  type LightroomResult,
} from "@/lib/lightroom";

/**
 * De Lightroom-pc (/admin/lightroom). Alles achter `lightroom.use`: wie hem mag
 * starten, mag ook zien hoe hij ervoor staat en hem in slaapstand zetten.
 *
 * Niet in het adminlogboek: er verandert niets aan de data van de site. Wie
 * startte of stopte, staat in kenny's log (`/var/log/lightroom-vm.log`) en, zolang
 * hij draait, op de pagina zelf.
 */

export async function getLightroomStatusAction(): Promise<LightroomResult> {
  await requirePermission("lightroom.use");
  return fetchLightroomStatus();
}

export async function startLightroomAction(): Promise<LightroomResult> {
  const session = await requirePermission("lightroom.use");
  return requestLightroomStart(session.user.name);
}

export async function stopLightroomAction(): Promise<LightroomResult> {
  const session = await requirePermission("lightroom.use");
  return requestLightroomStop(session.user.name);
}
