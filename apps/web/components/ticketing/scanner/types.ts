export type ScannerGate = {
  id: string;
  name: string;
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
};
