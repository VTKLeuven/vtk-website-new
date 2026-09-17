import { describe, expect, it } from 'vitest';
import {
  PRESALE_SHIFT_THRESHOLD,
  hasPresale,
  inPresaleAudience,
  isInPresaleNow,
  presaleStart,
  viewerSalesStart,
  viewerTypeSalesStart,
} from '@/lib/ticketing/presale';

const salesStartAt = new Date('2026-12-01T19:00:00.000Z');
const event = { salesStartAt, presaleLeadMinutes: 48 * 60, presalePraesidium: true };

const praesidiumMember = { groups: [{ id: 'group-it', type: 'PRAESIDIUM' }] };
const workingGroupMember = { groups: [{ id: 'group-revue', type: 'WERKGROEP' }] };
/** Zit in geen enkele post, maar stond dit werkingsjaar vijftien keer achter de toog. */
const regularHelper = { groups: [], completedShifts: PRESALE_SHIFT_THRESHOLD };

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

  it('lets a regular helper in on their shifts, without any post', () => {
    expect(inPresaleAudience(regularHelper, event)).toBe(true);
    expect(inPresaleAudience({ groups: [], completedShifts: PRESALE_SHIFT_THRESHOLD - 1 }, event)).toBe(
      false,
    );
    expect(inPresaleAudience({ groups: [] }, event)).toBe(false);
  });

  it('can run a presale without the helpers', () => {
    expect(inPresaleAudience(regularHelper, { ...event, presaleHelpers: false })).toBe(false);
    expect(inPresaleAudience(praesidiumMember, { ...event, presaleHelpers: false })).toBe(true);
  });

  // Dit was de bug: het eventvenster ging open voor de voorverkoop, maar elk
  // tickettype droeg zijn eigen start op net datzelfde moment en bleef dus op
  // "Binnenkort" staan. Wie voorverkoop had, kon niets bestellen.
  it('pulls a ticket type along when its own start is the public one', () => {
    const type = { salesStartAt };
    expect(viewerTypeSalesStart(event, type, praesidiumMember)?.toISOString()).toBe(
      '2026-11-29T19:00:00.000Z',
    );
    expect(viewerTypeSalesStart(event, { salesStartAt: null }, praesidiumMember)?.toISOString()).toBe(
      '2026-11-29T19:00:00.000Z',
    );
  });

  it('keeps a later start of its own: that is a separate decision', () => {
    const late = { salesStartAt: new Date('2026-12-05T19:00:00.000Z') };
    expect(viewerTypeSalesStart(event, late, praesidiumMember)?.toISOString()).toBe(
      '2026-12-05T19:00:00.000Z',
    );
  });

  it('changes nothing for someone outside the presale', () => {
    expect(viewerTypeSalesStart(event, { salesStartAt }, workingGroupMember)?.toISOString()).toBe(
      salesStartAt.toISOString(),
    );
    expect(viewerTypeSalesStart(event, { salesStartAt }, null)?.toISOString()).toBe(
      salesStartAt.toISOString(),
    );
  });
});
