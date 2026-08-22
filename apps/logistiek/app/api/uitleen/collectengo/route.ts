import { maintenanceSecret } from '@/lib/payments';
import { collectEnGoImapConfig, pollCollectEnGoMailbox } from '@/lib/collectengo/imap';

export const runtime = 'nodejs';

/**
 * Haalt de nieuwe Collect&Go-mails op. Wordt periodiek aangeroepen door de
 * `collectengo-worker` (curl-loop in infra/docker-compose.yml).
 *
 * Bewust een eigen endpoint naast `api/uitleen/maintenance`: die draait elke
 * minuut voor de betalingen, en een IMAP-verbinding die blijft hangen mag die
 * reconciliatie niet meesleuren.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = maintenanceSecret();
  if (!secret) return new Response('maintenance disabled', { status: 503 });
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) return new Response('forbidden', { status: 403 });
  if (!collectEnGoImapConfig()) return new Response('collectengo imap not configured', { status: 503 });

  const result = await pollCollectEnGoMailbox();
  return Response.json(result);
}
