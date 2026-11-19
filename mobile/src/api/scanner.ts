import { apiFetch } from './client';
import type {
  EventScannersResponse,
  QueuedScan,
  ScanApiResponse,
  ScanBatchResponse,
  ScannerBootstrap,
  ScannerCandidate,
} from '../scanner/types';

/**
 * De endpoints van de scanner aan de deur.
 *
 * Bewust de routes van de webscanner (`/api/tickets/...`) en niet `/app/v1`,
 * om dezelfde reden als bij afrekenen: daar zit de hele beoordeling (geldig, al
 * gescand, verkeerd evenement, terugbetaald) plus het scanlogboek, en een wrapper
 * zou niets doen dan doorgeven of, erger, de helft vergeten. Enkel de lijst van
 * evenementen komt uit de app-API (`fetchScanEvents` in `endpoints.ts`), want die
 * draagt de stand per event al mee.
 *
 * Het contract staat in `docs/ticketing.md`. Eén regel draagt alles:
 * **`clientScanId` is de idempotentiesleutel**. `TicketScanLog.clientScanId` is
 * uniek, dus opnieuw versturen kan altijd; een synchronisatie die halverwege
 * afbreekt mag gewoon opnieuw beginnen.
 */

/** Hoeveel scans er per keer naar `scan/batch` mogen (`SCAN_BATCH_LIMIT`). */
export const SCAN_BATCH_LIMIT = 100;

export function fetchBootstrap(eventId: string): Promise<ScannerBootstrap> {
  return apiFetch<ScannerBootstrap>(`/api/tickets/events/${eventId}/scanner/bootstrap`);
}

export function postScan(
  eventId: string,
  body: {
    credential: string;
    clientScanId: string;
    gateId: string | null;
    deviceId: string;
    clientScannedAt?: string;
  },
): Promise<ScanApiResponse> {
  return apiFetch<ScanApiResponse>(`/api/tickets/events/${eventId}/scan`, {
    method: 'POST',
    body,
  });
}

export function postCardScan(
  eventId: string,
  body: { card: string; clientScanId: string; gateId: string | null; deviceId: string },
): Promise<ScanApiResponse> {
  return apiFetch<ScanApiResponse>(`/api/tickets/events/${eventId}/scan/card`, {
    method: 'POST',
    body,
  });
}

/** Een gequeuede scan omzetten naar wat het scan-endpoint verwacht. */
export function toScanRequest(item: QueuedScan) {
  return {
    credential: item.credential,
    clientScanId: item.clientScanId,
    gateId: item.gateId,
    deviceId: item.deviceId,
    clientScannedAt: item.clientScannedAt,
  };
}

export function postScanBatch(eventId: string, scans: QueuedScan[]): Promise<ScanBatchResponse> {
  return apiFetch<ScanBatchResponse>(`/api/tickets/events/${eventId}/scan/batch`, {
    method: 'POST',
    body: { scans: scans.map(toScanRequest) },
    // Honderd scans in één keer verwerkt de server sequentieel; geef die tijd.
    timeout: 30_000,
  });
}

export function postReverse(
  eventId: string,
  body: { scanId: string; clientScanId: string },
): Promise<ScanApiResponse> {
  return apiFetch<ScanApiResponse>(`/api/tickets/events/${eventId}/scan/reverse`, {
    method: 'POST',
    body,
  });
}

// ── Scanners beheren ────────────────────────────────────────────────────────
// Alleen voor wie `MANAGE_SCANNERS` heeft; de bootstrap zegt of dat zo is. Deze
// weg kan enkel de rol SCANNER geven en weghalen, dus ze kan nooit een OWNER
// degraderen; de server weigert dat expliciet met `GRANT_ROLE_CONFLICT`.

export function fetchEventScanners(eventId: string): Promise<EventScannersResponse> {
  return apiFetch<EventScannersResponse>(`/api/tickets/events/${eventId}/scanners`);
}

export function searchScannerCandidates(
  eventId: string,
  query: string,
): Promise<ScannerCandidate[]> {
  return apiFetch<ScannerCandidate[]>(
    `/api/tickets/events/${eventId}/users/search?q=${encodeURIComponent(query)}`,
  );
}

export function addEventScanner(eventId: string, userId: string): Promise<EventScannersResponse> {
  return apiFetch<EventScannersResponse>(`/api/tickets/events/${eventId}/scanners`, {
    method: 'POST',
    body: { userId },
  });
}

/**
 * Een verse uitnodigings-QR. Het paneel haalt er om de twintig seconden een op:
 * de vorige leeft er dertig, dus wat op het scherm staat is altijd vers en een
 * screenshot is tegen dat iemand hem doorstuurt al dood.
 */
export function fetchScannerInvite(
  eventId: string,
): Promise<{ url: string; expiresAt: string; refreshSeconds: number }> {
  return apiFetch(`/api/tickets/events/${eventId}/scanners/invite`);
}

export function removeEventScanner(
  eventId: string,
  grantId: string,
): Promise<EventScannersResponse> {
  return apiFetch<EventScannersResponse>(`/api/tickets/events/${eventId}/scanners`, {
    method: 'POST',
    body: { grantId },
  });
}
