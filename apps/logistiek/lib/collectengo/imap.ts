import 'server-only';

import { parseCollectEnGoMail } from './parse';
import { storeParsedOrder } from './store';

/**
 * De Collect&Go-mails uit een mailbox halen.
 *
 * Er is geen inkomende mail in deze apps: `@vtk/mail` stuurt enkel. Daarom leest
 * dit rechtstreeks IMAP, met dezelfde afspraak als bij SMTP: staat de config niet
 * in de omgeving, dan is de functie uit (en niet stuk). De beheerpagina zegt dat
 * dan, en het team plakt de mail zelf.
 *
 * We raken enkel mails van de Collect&Go-afzender aan. Een gedeelde mailbox
 * bevat ook gewone post; die mag niet ongelezen-af gemarkeerd worden door ons.
 */

export type CollectEnGoImapConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  /** Substring waarop de afzender herkend wordt, klein geschreven. */
  fromFilter: string;
  secure: boolean;
  /** Hoeveel mails er per ronde hoogstens verwerkt worden. */
  maxMessages: number;
};

export function collectEnGoImapConfig(): CollectEnGoImapConfig | null {
  const host = process.env.COLLECTENGO_IMAP_HOST?.trim();
  const user = process.env.COLLECTENGO_IMAP_USER?.trim();
  const password = process.env.COLLECTENGO_IMAP_PASSWORD;
  if (!host || !user || !password) return null;
  const port = Number.parseInt(process.env.COLLECTENGO_IMAP_PORT ?? '', 10) || 993;
  return {
    host,
    port,
    user,
    password,
    mailbox: process.env.COLLECTENGO_IMAP_MAILBOX?.trim() || 'INBOX',
    fromFilter: (process.env.COLLECTENGO_IMAP_FROM ?? 'collectandgo').trim().toLowerCase(),
    secure: process.env.COLLECTENGO_IMAP_SECURE !== 'false' && port !== 143,
    maxMessages: Number.parseInt(process.env.COLLECTENGO_IMAP_MAX ?? '', 10) || 20,
  };
}

export type PollResult = {
  /** Aantal mails van Collect&Go dat we bekeken hebben. */
  fetched: number;
  created: number;
  replaced: number;
  /** Al gekend (zelfde Message-ID) of al geïmporteerd. */
  skipped: number;
  errors: string[];
};

const EMPTY: PollResult = { fetched: 0, created: 0, replaced: 0, skipped: 0, errors: [] };

/**
 * Eén ronde: ongelezen mails van Collect&Go ophalen, parsen, bewaren en als
 * gelezen markeren. Gooit niet door; een kapotte mailbox mag het beheer niet
 * platleggen, en wat misging staat in `errors`.
 */
export async function pollCollectEnGoMailbox(): Promise<PollResult> {
  const config = collectEnGoImapConfig();
  if (!config) return { ...EMPTY, errors: ['IMAP is niet ingesteld.'] };

  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    // De standaardlogger schrijft elke IMAP-regel naar stdout; dat is per ronde
    // honderden regels in de containerlogs.
    logger: false,
  });

  const result: PollResult = { ...EMPTY, errors: [] };

  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return result;

      for (const uid of uids.slice(-config.maxMessages)) {
        const message = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
        if (!message || !message.source) continue;

        const from = message.envelope?.from?.[0]?.address?.toLowerCase() ?? '';
        // Alles wat niet van Collect&Go komt, laten we ongelezen liggen: het is
        // gewone post van iemand anders.
        if (config.fromFilter && !from.includes(config.fromFilter)) continue;
        result.fetched += 1;

        try {
          const mail = await simpleParser(message.source);
          const parsed = parseCollectEnGoMail({ text: mail.text, html: typeof mail.html === 'string' ? mail.html : null });
          if (!parsed.ok) {
            result.errors.push(`${mail.subject ?? `uid ${uid}`}: ${parsed.error}`);
            continue;
          }
          const stored = await storeParsedOrder(parsed.order, {
            source: 'IMAP',
            messageId: mail.messageId ?? null,
            receivedAt: mail.date ?? undefined,
          });
          if (stored.status === 'CREATED') result.created += 1;
          else if (stored.status === 'REPLACED') result.replaced += 1;
          else result.skipped += 1;

          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        } catch (error) {
          result.errors.push(`uid ${uid}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await client.logout().catch(() => undefined);
  }

  return result;
}
