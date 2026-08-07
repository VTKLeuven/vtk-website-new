/** Shared input for both wallet generators: enough to render a ticket without
 * a second database round trip once the caller already has it. */
export type WalletTicketInput = {
  ticketId: string;
  publicId: string;
  qrVersion: number;
  attendeeName: string;
  typeName: string;
  unitPriceCents: number;
  status?: string;
  designSnapshot?: unknown;
  event: {
    id?: string;
    title: string;
    startsAt: Date;
    location: string | null;
  };
  orderNumber: string;
  currency: string;
};
