import { describe, expect, it } from 'vitest';
import {
  createOrderAccessToken,
  createPublicTicketId,
  createTicketLinkToken,
  createTicketCredential,
  extractTicketCredential,
  verifyOrderAccessToken,
  verifyTicketCredential,
  verifyTicketLinkToken,
} from '@/lib/ticketing/crypto';

describe('ondertekende downloadlink van een ticket', () => {
  const expiresAt = new Date('2030-01-01T00:00:00.000Z');
  const token = createTicketLinkToken('ticket_1', 2, expiresAt);

  it('geldt voor dit ticket en deze versie', () => {
    expect(verifyTicketLinkToken(token, 'ticket_1', 2)).toBe(true);
  });

  it('geldt niet voor een ander ticket, een vernieuwde QR of na de vervaldatum', () => {
    expect(verifyTicketLinkToken(token, 'ticket_2', 2)).toBe(false);
    expect(verifyTicketLinkToken(token, 'ticket_1', 3)).toBe(false);
    expect(verifyTicketLinkToken(token, 'ticket_1', 2, expiresAt)).toBe(false);
  });

  it('weigert een aangepast token', () => {
    expect(verifyTicketLinkToken(token.replace('.2.', '.3.'), 'ticket_1', 3)).toBe(false);
    expect(verifyTicketLinkToken(`${token}x`, 'ticket_1', 2)).toBe(false);
    expect(verifyTicketLinkToken(createOrderAccessToken('ticket_1', expiresAt), 'ticket_1', 2)).toBe(false);
  });
});

describe('ticket credentials', () => {
  it('round-trips an order capability and rejects tampering', () => {
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');
    const token = createOrderAccessToken('order_123', expiresAt);
    expect(verifyOrderAccessToken(token)).toBe('order_123');
    expect(verifyOrderAccessToken(token, 'other')).toBeNull();
    expect(verifyOrderAccessToken(`${token}x`)).toBeNull();
    expect(verifyOrderAccessToken(token, 'order_123', expiresAt)).toBeNull();
  });

  it('signs a PII-free ticket credential with a revocable version', () => {
    const credential = createTicketCredential('public_abc', 3);
    expect(verifyTicketCredential(credential)).toEqual({ publicId: 'public_abc', version: 3 });
    expect(verifyTicketCredential(credential.replace('.3.', '.4.'))).toBeNull();
    expect(credential).not.toContain('@');
  });

  it('extracts credentials from scanner URLs', () => {
    const credential = createTicketCredential('public_xyz', 1);
    expect(extractTicketCredential(`https://vtk.be/tickets/verify/${credential}?source=pdf`)).toBe(credential);
  });

  it('creates high-entropy public ticket ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createPublicTicketId()));
    expect(ids.size).toBe(100);
    expect([...ids].every((id) => id.length >= 16)).toBe(true);
  });
});
