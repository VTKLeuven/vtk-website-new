import "server-only";

// Dun compatibiliteitslaagje, net als bij Mollie: de implementatie leeft in
// @vtk/payments, de call sites (de webhook-route) importeren van hier.
import type { BancontactPayment } from "@vtk/payments";
import { newBancontactGateway } from "./index";

export {
  BancontactApiError,
  BancontactRefundUnsupportedError,
  mapBancontactStatus,
  type BancontactPayment,
} from "@vtk/payments";

export async function fetchBancontactPayment(id: string): Promise<BancontactPayment> {
  return newBancontactGateway().fetchPayment(id);
}
