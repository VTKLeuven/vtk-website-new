import { describe, expect, it } from 'vitest';
import { readMailSource } from '@/lib/collectengo/eml';
import { parseCollectEnGoMail } from '@/lib/collectengo/parse';

/** Een minimale MIME-mail zoals een opgeslagen `.eml`, met quoted-printable body. */
const eml = [
  'From: Collect&Go <noreply@collectandgo.be>',
  'To: logistiek@vtk.be',
  'Subject: Bedankt voor je reservatie',
  'Message-ID: <abc123@collectandgo.be>',
  'Date: Thu, 9 Jul 2026 12:55:47 +0200',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Je reserveerde je boodschappen op 09-jul.-2026 12:55:47, reservatienummer 402=',
  '88042.',
  'Dit zetten we voor je klaar:',
  'Diepvries',
  '1 product',
  'BONI kebab voorgebakken 1kg',
  '=E2=82=AC 41,84',
  '4 stuk(s)=E2=82=AC 10,46/st',
  '',
].join('\r\n');

describe('readMailSource', () => {
  it('leest een .eml met quoted-printable en haalt het Message-ID eruit', async () => {
    const source = await readMailSource(eml);
    expect(source.messageId).toBe('<abc123@collectandgo.be>');
    expect(source.receivedAt?.toISOString()).toBe('2026-07-09T10:55:47.000Z');

    const parsed = parseCollectEnGoMail({ text: source.text, html: source.html });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.order.reservationNumber).toBe('40288042');
    expect(parsed.order.lines).toEqual([
      expect.objectContaining({ productName: 'BONI kebab voorgebakken 1kg', quantity: 4, totalPriceCents: 4184 }),
    ]);
  });

  it('herkent geplakte HTML en geplakte tekst zonder mailparser', async () => {
    const html = await readMailSource('<table><tr><td>BONI cola</td></tr></table>');
    expect(html.html).not.toBeNull();
    expect(html.text).toBeNull();

    const text = await readMailSource('reservatienummer 40288042');
    expect(text.text).toBe('reservatienummer 40288042');
    expect(text.html).toBeNull();
  });
});
