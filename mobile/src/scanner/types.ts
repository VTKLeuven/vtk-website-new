/**
 * De wiretypes van de scanner-API (`/api/tickets/...`).
 *
 * Overgenomen uit `apps/web/components/ticketing/scanner/types.ts`, plus de
 * types van het scannerspaneel. Dit is niet het app-contract
 * (`src/api/contract.ts`): de scanner praat met de routes van de webscanner, net
 * zoals de webscanner zelf. Wijzigt het contract daar, dan wijzigt het hier mee.
 */

export type TicketColorKey = 'navy' | 'blue' | 'amber' | 'violet' | 'green' | 'rose' | 'slate';

export type ScannerGate = { id: string; name: string };

/** Eén geldig ticket zoals het in het offline-manifest staat. */
export type ScannerManifestEntry = {
  code: string;
  version: number;
  checkedIn: boolean;
  name: string;
  type: string;
  typeColor: TicketColorKey;
};

export type ScannerManifest = {
  /**
   * False wanneer het event te groot is voor een manifest (boven 5000 tickets).
   * Het toestel scant dan enkel online, in plaats van met een halve lijst
   * geldige tickets te weigeren.
   */
  complete: boolean;
  generatedAt: string;
  ticketCount: number;
  tickets: ScannerManifestEntry[];
  cardSalt?: string;
  cards?: Record<string, string>;
};

/** Een scan die nog naar de server moet; `clientScanId` maakt opnieuw sturen veilig. */
export type QueuedScan = {
  clientScanId: string;
  credential: string;
  gateId: string | null;
  deviceId: string;
  clientScannedAt: string;
  /** Wat het toestel offline besliste, om een conflict achteraf te kunnen tonen. */
  offlineKind: 'accepted' | 'duplicate' | 'rejected';
  code: string;
  attendeeName?: string;
  typeName?: string;
  typeColor?: TicketColorKey;
};

export type ScannerBootstrap = {
  event: {
    id: string;
    title: string;
    startsAt?: string;
    location?: string | null;
    cardCheckIn?: boolean;
    /** Mag elke praesidiumpost dit event scannen, of enkel wie een grant heeft? */
    openScanning?: boolean;
  };
  /** Mag deze gebruiker scanners toevoegen en weghalen (`MANAGE_SCANNERS`)? */
  canManageScanners?: boolean;
  gates: ScannerGate[];
  stats?: { checkedIn?: number; total?: number };
  manifest?: ScannerManifest;
};

export type ScanBatchResponse = {
  results: {
    clientScanId: string;
    result: string;
    ticket?: { publicId?: string; attendeeName?: string; typeName?: string; typeColor?: string };
    error?: string;
  }[];
  stats?: { checkedIn?: number; total?: number };
};

export type ScanApiResponse = {
  scanId?: string;
  status?: string;
  result?: string;
  message?: string;
  ticket?: {
    publicId?: string;
    attendeeName?: string;
    typeName?: string;
    ticketTypeName?: string;
    typeColor?: string;
    checkedInAt?: string | null;
  };
  attendeeName?: string;
  typeName?: string;
  typeColor?: string;
  checkedInAt?: string | null;
  /** Waarom een kaartscan niets opleverde; enkel op het kaart-endpoint. */
  reason?: string;
  stats?: { checkedIn?: number; total?: number };
};

export type ScanKind = 'accepted' | 'duplicate' | 'rejected' | 'reversed' | 'error';

export type ScanHistoryItem = {
  id: string;
  scannedAt: string;
  kind: ScanKind;
  code: string;
  attendeeName?: string;
  typeName?: string;
  typeColor?: TicketColorKey;
  message: string;
  scanId?: string;
  /** Offline beslist en nog niet door de server bevestigd. */
  pending?: boolean;
};

/** Een scan die offline werd aanvaard maar door de server alsnog geweigerd is. */
export type ScanConflict = {
  clientScanId: string;
  code: string;
  attendeeName?: string;
  result: string;
  scannedAt: string;
};

/** Iemand die als scanner toegevoegd is, los van de standaardregel. */
export type EventScanner = {
  grantId: string;
  userId: string;
  name: string;
  email: string;
  rNumber: string | null;
  addedAt: string;
};

export type EventScannersResponse = {
  openScanning: boolean;
  scanners: EventScanner[];
};

/** Een zoekresultaat uit `/api/tickets/events/<id>/users/search`. */
export type ScannerCandidate = {
  id: string;
  name: string;
  email: string;
  rNumber: string | null;
};
