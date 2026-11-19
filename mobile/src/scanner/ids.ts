import * as Crypto from 'expo-crypto';

import { getPref, setPref } from '../storage';

/**
 * De ids van de scanner.
 *
 * Apart van `storage.ts` omdat `expo-crypto` een native module is die pas met
 * de scanner in de build kwam. Enkel het scanscherm laadt dit bestand; zo kan
 * een oudere APK die een update krijgt, hooguit het scanscherm niet openen in
 * plaats van de hele app niet te starten.
 */

/** Een nieuwe `clientScanId`: de idempotentiesleutel van elke scan. */
export function createId(): string {
  return Crypto.randomUUID();
}

/**
 * De id van dit toestel voor dit event.
 *
 * De server maakt er een `TicketScanDevice` van en gebruikt ze als
 * kill-switch (`revokedAt`); ze is dus geen geheim maar moet wel stabiel zijn,
 * anders staat er na elke herstart een nieuw toestel in het overzicht.
 */
export function deviceIdFor(eventId: string): string {
  const key = `scan-device-id:${eventId}`;
  const existing = getPref(key);
  if (existing) return existing;
  const fresh = createId();
  setPref(key, fresh);
  return fresh;
}
