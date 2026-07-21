import { describe, expect, it } from 'vitest';
import {
  createOrderAccessToken,
  createPublicTicketId,
  createTicketCredential,
  extractTicketCredential,
  verifyOrderAccessToken,
  verifyTicketCredential,
} from '@/lib/ticketing/crypto';

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
