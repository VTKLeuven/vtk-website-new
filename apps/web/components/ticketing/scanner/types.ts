export type ScannerGate = {
  id: string;
  name: string;
};

/** Eén geldig ticket zoals het in het offline-manifest staat. */
export type ScannerManifestEntry = {
  code: string;
  version: number;
  checkedIn: boolean;
  name: string;
  type: string;
};

export type ScannerManifest = {
  /**
   * False wanneer het event te groot is voor een manifest. Het toestel scant dan
   * enkel online, in plaats van met een halve lijst geldige tickets te weigeren.
   */
  complete: boolean;
  generatedAt: string;
  ticketCount: number;
  tickets: ScannerManifestEntry[];
};

/** Een scan die nog naar de server moet; `clientScanId` maakt opnieuw sturen veilig. */
export type QueuedScan = {
  clientScanId: string;
  credential: string;
  gateId: string | null;
  deviceId: string;
  clientScannedAt: string;
  /** Wat het toestel offline besliste, om een conflict achteraf te kunnen tonen. */
  offlineKind: "accepted" | "duplicate" | "rejected";
  code: string;
  attendeeName?: string;
  typeName?: string;
};

export type ScannerBootstrap = {
  event: {
    id: string;
    title: string;
    startsAt?: string;
    location?: string | null;
  };
  gates: ScannerGate[];
  stats?: {
    checkedIn?: number;
    total?: number;
  };
  manifest?: ScannerManifest;
};

export type ScanBatchResponse = {
  results: Array<{
    clientScanId: string;
    result: string;
    ticket?: { publicId?: string; attendeeName?: string; typeName?: string };
    error?: string;
  }>;
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
    checkedInAt?: string | null;
  };
  attendeeName?: string;
  typeName?: string;
  checkedInAt?: string | null;
  stats?: {
    checkedIn?: number;
    total?: number;
  };
};

export type ScanKind = "accepted" | "duplicate" | "rejected" | "reversed" | "error";

export type ScanHistoryItem = {
  id: string;
  scannedAt: string;
  kind: ScanKind;
  code: string;
  attendeeName?: string;
  typeName?: string;
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
