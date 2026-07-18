import "server-only";

// Dun compatibiliteitslaagje: de eigenlijke Mollie-implementatie leeft in
// @vtk/payments (gedeeld met apps/logistiek). Bestaande call sites (o.a. de
// webhook-route) blijven van dit pad importeren.
import type { MolliePayment } from "@vtk/payments";
import { newMollieGateway } from "./index";

export {
  MollieApiError,
  mapPaymentStatus,
  mapRefundStatus,
  type MolliePayment,
  type MollieRefund,
} from "@vtk/payments";

export async function fetchMolliePayment(
  id: string,
  opts: { embedRefunds?: boolean } = {}
): Promise<MolliePayment> {
  return newMollieGateway().fetchPayment(id, opts);
}
