import { requireManage } from '@/lib/session';
import { collectEnGoImapConfig } from '@/lib/collectengo/imap';
import { collectEnGoOrders } from '@/lib/collectengo/server';
import { CollectEnGoInbox } from './collectengo-inbox';

export default async function BeheerCollectEnGoPage() {
  await requireManage();
  const imap = collectEnGoImapConfig();
  const orders = await collectEnGoOrders();
  return (
    <CollectEnGoInbox
      orders={orders.map((order) => ({
        id: order.id,
        reservationNumber: order.reservationNumber,
        status: order.status,
        source: order.source,
        pickupFrom: order.pickupFrom,
        pickupPoint: order.pickupPoint,
        receivedAt: order.receivedAt,
        totalCents: order.totalCents,
        lineCount: order._count.lines,
        importedAt: order.importedAt,
        importedByName: order.importedBy?.name ?? null,
      }))}
      mailbox={imap ? { user: imap.user, mailbox: imap.mailbox } : null}
    />
  );
}
