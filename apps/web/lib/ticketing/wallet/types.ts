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
    /** Alleen gezet wanneer het adres van het event geocodeerd kon worden; dan
     * krijgt de pas een geofence en komt hij bij aankomst vanzelf op het
     * vergrendelscherm. */
    latitude?: number | null;
    longitude?: number | null;
  };
  orderNumber: string;
  currency: string;
};
