/**
 * Hoeveel tickets deze koper in één bestelling mag nemen, uit wat de shop over
 * hem weet. Eén bron voor de webshop (`TicketShop`) en de app-API, zodat die
 * twee hetzelfde getal tonen als wat de checkout (`createTicketCheckout`)
 * daarna aanvaardt.
 *
 * - Heeft het erelid zijn ene ticket al (`honoraryOneTicket.used`), dan nul.
 * - In de voorverkoop (`presaleSelfOnly`): hoogstens één ticket in totaal (dus
 *   nul zodra het account er al een heeft).
 * - Bij `honoraryOneTicket`: hoogstens één ticket.
 * - Bij een ingelogd account (`accountLimit`): het kleinste van wat er nog
 *   vrij is binnen `maxTicketsPerAccount` (`max - held`) en de grens per
 *   bestelling (`1` bij `oneTicketPerOrder`, anders `maxTicketsPerAccount`).
 * - Uitgelogd (`accountLimit` is `null`): `1` bij `oneTicketPerOrder`, anders
 *   `maxTicketsPerAccount`.
 *
 * Het maximum per tickettype zit hier niet in; dat legt `orderLimit` in de shop
 * er nog bovenop.
 */
export function accountOrderMax(event: {
  maxTicketsPerAccount: number;
  oneTicketPerOrder?: boolean;
  presaleSelfOnly?: boolean;
  honoraryOneTicket?: { used: boolean } | null;
  accountLimit?: { max: number; held: number } | null;
}): number {
  const perOrderCap = event.oneTicketPerOrder
    ? Math.min(event.maxTicketsPerAccount, 1)
    : event.maxTicketsPerAccount;
  if (event.honoraryOneTicket?.used) return 0;
  if (event.presaleSelfOnly) {
    if ((event.accountLimit?.held ?? 0) > 0) return 0;
    return Math.min(perOrderCap, 1);
  }
  if (event.honoraryOneTicket) return Math.min(perOrderCap, 1);
  if (event.accountLimit) {
    const remaining = Math.max(0, event.accountLimit.max - event.accountLimit.held);
    return Math.min(perOrderCap, remaining);
  }
  return perOrderCap;
}
