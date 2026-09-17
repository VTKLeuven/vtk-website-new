import { describe, expect, it } from 'vitest';
import {
  hasPresale,
  inPresaleAudience,
  isInPresaleNow,
  presaleStart,
  viewerSalesStart,
} from '@/lib/ticketing/presale';

const salesStartAt = new Date('2026-12-01T19:00:00.000Z');
const event = { salesStartAt, presaleLeadMinutes: 48 * 60, presalePraesidium: true };

const praesidiumMember = { groups: [{ id: 'group-it', type: 'PRAESIDIUM' }] };
const workingGroupMember = { groups: [{ id: 'group-revue', type: 'WERKGROEP' }] };

describe('ticket presale', () => {
  it('is nothing without a sales start: the sale is already open for everyone', () => {
    expect(hasPresale({ salesStartAt: null, presaleLeadMinutes: 120 })).toBe(false);
    expect(presaleStart({ salesStartAt: null, presaleLeadMinutes: 120 })).toBeNull();
    expect(viewerSalesStart({ salesStartAt: null, presaleLeadMinutes: 120 }, praesidiumMember)).toBeNull();
  });

  it('is nothing without a lead time', () => {
    expect(hasPresale({ salesStartAt, presaleLeadMinutes: null })).toBe(false);
    expect(hasPresale({ salesStartAt, presaleLeadMinutes: 0 })).toBe(false);
  });

  it('starts the lead time before the sales start', () => {
    expect(presaleStart(event)?.toISOString()).toBe('2026-11-29T19:00:00.000Z');
  });

  it('lets every praesidium post in by default', () => {
    expect(inPresaleAudience(praesidiumMember, event)).toBe(true);
    expect(inPresaleAudience(workingGroupMember, event)).toBe(true
      && false);
  });

  it('keeps a working group out unless it was picked', () => {
    expect(inPresaleAudience(workingGroupMember, event)).toBe(false);
    expect(
      inPresaleAudience(workingGroupMember, {
        ...event,
        presaleGroups: [{ groupId: 'group-revue' }],
      }),
    ).toBe(true);
  });

  it('can run a presale for a working group without the praesidium', () => {
    const own = { ...event, presalePraesidium: false, presaleGroups: [{ groupId: 'group-revue' }] };
    expect(inPresaleAudience(workingGroupMember, own)).toBe(true);
    expect(inPresaleAudience(praesidiumMember, own)).toBe(false);
  });

  it('never lets a logged-out visitor in: the presale hangs on a membership', () => {
    expect(inPresaleAudience(null, event)).toBe(false);
    expect(viewerSalesStart(event, null)?.toISOString()).toBe(salesStartAt.toISOString());
  });

  it('moves the sales start only for someone in the audience', () => {
    expect(viewerSalesStart(event, praesidiumMember)?.toISOString()).toBe('2026-11-29T19:00:00.000Z');
    expect(viewerSalesStart(event, workingGroupMember)?.toISOString()).toBe(salesStartAt.toISOString());
  });

  it('only calls it a presale between the early start and the public one', () => {
    expect(isInPresaleNow(event, praesidiumMember, new Date('2026-11-29T18:59:00.000Z'))).toBe(false);
    expect(isInPresaleNow(event, praesidiumMember, new Date('2026-11-30T12:00:00.000Z'))).toBe(true);
    expect(isInPresaleNow(event, praesidiumMember, new Date('2026-12-01T19:00:00.000Z'))).toBe(false);
    expect(isInPresaleNow(event, workingGroupMember, new Date('2026-11-30T12:00:00.000Z'))).toBe(false);
  });
});
