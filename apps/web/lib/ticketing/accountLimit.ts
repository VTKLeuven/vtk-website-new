/**
 * Hoeveel tickets deze koper in één bestelling mag nemen, uit wat de shop over
 * hem weet. Eén bron voor de webshop (`TicketShop`) en de app-API, zodat die
 * twee hetzelfde getal tonen als wat de checkout (`createTicketCheckout`)
 * daarna aanvaardt.
 *
 * - Heeft het account zijn ene ticket al (erelid met `honoraryOneTicket`, of
 *   een event met één ticket per account), dan nul.
 * - In de voorverkoop (`presaleSelfOnly`) of als erelid met `honoraryOneTicket`
 *   hoogstens één.
 * - Anders het maximum van het event.
 *
 * Het maximum per tickettype zit hier niet in; dat legt `orderLimit` in de shop
 * er nog bovenop.
 */
export function accountOrderMax(event: {
  maxTicketsPerOrder: number;
  presaleSelfOnly?: boolean;
  honoraryOneTicket?: { used: boolean } | null;
  oneTicketPerAccount?: { used: boolean } | null;
}): number {
  if (event.honoraryOneTicket?.used || event.oneTicketPerAccount?.used) return 0;
  if (event.presaleSelfOnly || event.honoraryOneTicket) return Math.min(event.maxTicketsPerOrder, 1);
  return event.maxTicketsPerOrder;
}
