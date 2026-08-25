import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { generateTicketsPdf } from '@/lib/ticketing/pdf';

describe('ticket PDF', () => {
  /**
   * Ruimer dan de standaard vijf seconden. De test zelf loopt in minder dan een
   * seconde, maar hij tekent twee QR-codes en bouwt een echte PDF op, en dat is
   * genoeg rekenwerk om over de limiet te gaan wanneer de rest van de suite
   * naast hem draait. Dat viel twee keer om zonder dat er iets stuk was.
   */
  it('creates one page per ticket', async () => {
    const bytes = await generateTicketsPdf({
      orderNumber: 'VTK-27-TEST',
      currency: 'EUR',
      event: {
        title: 'Galabal 2027',
        startsAt: new Date('2027-03-20T19:00:00Z'),
        location: 'Brabanthal',
      },
      tickets: [
        { publicId: 'ticket_one', qrVersion: 1, attendeeName: 'Alex', typeName: 'Student', unitPriceCents: 5000 },
        { publicId: 'ticket_two', qrVersion: 1, attendeeName: 'Sam', typeName: 'Student', unitPriceCents: 5000 },
      ],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toContain('Galabal');
  }, 20_000);
});
