import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { generateTicketsPdf } from '@/lib/ticketing/pdf';

describe('ticket PDF', () => {
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
  });
});
