import { describe, expect, it } from 'vitest';
import {
  availableTicketCount,
  formatTicketOrderStatus,
  maximumSelectableForLine,
  maximumSelectableForType,
  nextTicketQuantity,
  ticketLinesForType,
  type PublicTicketType,
} from '@/components/ticketing/public/types';

function ticketType(id: string, inventoryPoolId: string, available: number): PublicTicketType {
  return {
    id,
    inventoryPoolId,
    name: id,
    priceCents: 1_000,
    available,
    active: true,
  };
}

describe('public ticket inventory presentation', () => {
  it('counts a shared inventory pool only once', () => {
    const types = [
      ticketType('student', 'general', 5),
      ticketType('regular', 'general', 5),
      ticketType('vip', 'vip', 3),
    ];
    expect(availableTicketCount(types)).toBe(8);
  });

  it('subtracts other ticket types selected from the same pool', () => {
    const student = ticketType('student', 'general', 5);
    const regular = ticketType('regular', 'general', 5);
    expect(
      maximumSelectableForType({
        type: regular,
        ticketTypes: [student, regular],
        quantities: { student: 4 },
        maxTicketsPerOrder: 8,
      })
    ).toBe(1);
  });

  it('steps between zero and a ticket type minimum without trapping the selection', () => {
    expect(
      nextTicketQuantity({
        current: 0,
        direction: 'increase',
        minimum: 2,
        maximum: 5,
      })
    ).toBe(2);
    expect(
      nextTicketQuantity({
        current: 2,
        direction: 'decrease',
        minimum: 2,
        maximum: 5,
      })
    ).toBe(0);
  });
});

describe('member prices', () => {
  it('splits a ticket type with a member price into two lines, member first', () => {
    const beer = { ...ticketType('beer', 'beer', 10), memberPriceCents: 800 };
    expect(ticketLinesForType(beer).map((line) => [line.key, line.priceCents])).toEqual([
      ['beer:member', 800],
      ['beer', 1_000],
    ]);
    expect(ticketLinesForType(ticketType('water', 'water', 10))).toHaveLength(1);
  });

  it('lets both prices of one type share its per-order maximum and stock', () => {
    const beer = { ...ticketType('beer', 'beer', 3), memberPriceCents: 800, maxPerOrder: 4 };
    const lines = ticketLinesForType(beer);
    const [member, standard] = lines;
    // Voorraad 3, waarvan 2 al aan de ledenprijs: er blijft er 1 over.
    expect(
      maximumSelectableForLine({ line: standard, lines, quantities: { 'beer:member': 2 }, maxTicketsPerOrder: 8 })
    ).toBe(1);
    expect(
      maximumSelectableForLine({ line: member, lines, quantities: { 'beer:member': 2 }, maxTicketsPerOrder: 8 })
    ).toBe(3);
  });
});

describe('public order status labels', () => {
  it('localizes every customer-facing order status', () => {
    expect(formatTicketOrderStatus('PAID', 'nl')).toBe('Betaald');
    expect(formatTicketOrderStatus('PARTIALLY_REFUNDED', 'nl')).toBe('Deels terugbetaald');
    expect(formatTicketOrderStatus('PAYMENT_FAILED', 'en')).toBe('Payment failed');
  });
});
