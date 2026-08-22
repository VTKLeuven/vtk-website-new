import 'server-only';

/**
 * Ruwe invoer uit het beheer klaarmaken om te parsen.
 *
 * Er komen drie dingen binnen langs hetzelfde veld: een geplakte mailtekst, de
 * geplakte HTML-bron, en een `.eml`-bestand (de hele MIME-mail). Alleen die
 * laatste heeft mailparser nodig; de twee andere gaan er rechtstreeks door.
 */
export type MailSource = {
  text: string | null;
  html: string | null;
  messageId: string | null;
  receivedAt: Date | null;
};

function looksLikeMime(raw: string): boolean {
  const head = raw.slice(0, 2000);
  return /^(from|to|subject|date|message-id|mime-version|content-type):/im.test(head);
}

function looksLikeHtml(raw: string): boolean {
  return /<(html|table|td|div|body)\b/i.test(raw.slice(0, 4000));
}

export async function readMailSource(raw: string): Promise<MailSource> {
  const input = raw.trim();
  if (!input) return { text: null, html: null, messageId: null, receivedAt: null };

  if (looksLikeMime(input)) {
    const { simpleParser } = await import('mailparser');
    const mail = await simpleParser(input);
    return {
      text: mail.text ?? null,
      html: typeof mail.html === 'string' ? mail.html : null,
      messageId: mail.messageId ?? null,
      receivedAt: mail.date ?? null,
    };
  }

  if (looksLikeHtml(input)) return { text: null, html: input, messageId: null, receivedAt: null };
  return { text: input, html: null, messageId: null, receivedAt: null };
}
