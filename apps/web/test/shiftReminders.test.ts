import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REMINDER_LEADS,
  handledLeadFields,
  passedLeads,
  processDueShiftReminders,
  shiftReminderMail,
  windowFor,
} from '@/lib/shift/reminders';

vi.mock('@vtk/db', () => ({
  prisma: {
    shiftParticipant: {
      findMany: vi.fn(async () => {
        throw new Error('de database mag hier niet aangesproken worden');
      }),
      updateMany: vi.fn(),
    },
  },
}));

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-08-10T09:00:00Z');

const shift = {
  name: 'Bar Theokot',
  startTime: new Date('2026-08-11T17:00:00Z'),
  endTime: new Date('2026-08-11T20:00:00Z'),
  location: 'Alma 2',
  reward: 2,
};

describe('welke herinneringen nog zinvol zijn', () => {
  it('laat beide vensters open voor een shift van volgende week', () => {
    expect(passedLeads(new Date(now.getTime() + 200 * HOUR), now)).toEqual([]);
    expect(handledLeadFields(new Date(now.getTime() + 200 * HOUR), now)).toEqual({});
  });

  it('slaat de dag-vooraf over wie zich drie uur op voorhand inschrijft', () => {
    // Anders krijgt iemand die zich net inschreef meteen een mail die begint met
    // "morgen sta je ingepland".
    expect(passedLeads(new Date(now.getTime() + 3 * HOUR), now)).toEqual(['dayBefore']);
    expect(handledLeadFields(new Date(now.getTime() + 3 * HOUR), now)).toEqual({
      reminderDayBeforeAt: now,
    });
  });

  it('slaat allebei over vlak voor de start', () => {
    expect(passedLeads(new Date(now.getTime() + 30 * 60 * 1000), now)).toEqual([
      'dayBefore',
      'soon',
    ]);
  });

  it('telt het venster als voorbij wanneer de start er precies op valt', () => {
    expect(passedLeads(new Date(now.getTime() + 24 * HOUR), now)).toEqual(['dayBefore']);
  });
});

describe('zonder mailserver', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('slaat in productie alles over in plaats van iedereen af te vinken', async () => {
    // `sendMail` meldt zonder SMTP "gelukt", en de markering staat er dan al op.
    // Zonder deze grendel zouden alle herinneringen als verstuurd afgevinkt
    // worden terwijl er nooit iets aankwam, en niemand zou dat merken. Dat de
    // database hier niet eens aangesproken wordt, is het bewijs: de mock gooit.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', '');

    await expect(processDueShiftReminders(now)).resolves.toEqual({
      sent: 0,
      failed: 0,
      skipped: 'geen-smtp',
    });
  });

  it('blijft lokaal wel gewoon loggen', async () => {
    // Buiten productie is de console het doel; dan mag de gewone weg lopen.
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SMTP_HOST', '');

    await expect(processDueShiftReminders(now)).rejects.toThrow(
      'de database mag hier niet aangesproken worden',
    );
  });
});

describe('het venster waarin een herinnering vertrekt', () => {
  const dayBefore = REMINDER_LEADS.find((lead) => lead.key === 'dayBefore')!;
  const soon = REMINDER_LEADS.find((lead) => lead.key === 'soon')!;

  it('laat de dag-vooraf-mail pas vanaf twee uur voor de start meetellen', () => {
    // Zonder deze ondergrens vertrekt een mail die met "morgen" begint voor een
    // shift die over anderhalf uur start; dat gebeurde in de praktijk toen een
    // deelnemer buiten de inschrijfroute in de tabel belandde.
    const { after, until } = windowFor(dayBefore, now);
    expect(after).toEqual(new Date(now.getTime() + 2 * HOUR));
    expect(until).toEqual(new Date(now.getTime() + 24 * HOUR));
  });

  it('laat de twee-uur-mail tot aan de start lopen', () => {
    const { after, until } = windowFor(soon, now);
    expect(after).toEqual(now);
    expect(until).toEqual(new Date(now.getTime() + 2 * HOUR));
  });
});

describe('de mail zelf', () => {
  it('zegt een dag vooraf dat uitschrijven niet meer kan', () => {
    const mail = shiftReminderMail('dayBefore', { name: 'Jonas', locale: 'NL' }, shift);
    expect(mail.subject).toBe('Morgen: Bar Theokot');
    expect(mail.text).toContain('Dag Jonas');
    expect(mail.text).toContain('Uitschrijven kan vanaf nu niet meer');
    expect(mail.text).toContain('Alma 2');
    expect(mail.text).toContain('2 bonnetjes');
  });

  it('zegt dat twee uur vooraf niet', () => {
    const mail = shiftReminderMail('soon', { name: 'Jonas', locale: 'NL' }, shift);
    expect(mail.subject).toBe('Straks: Bar Theokot');
    expect(mail.text).not.toContain('Uitschrijven kan vanaf nu niet meer');
  });

  it('schrijft in het Engels voor een Engelstalig lid', () => {
    const mail = shiftReminderMail('dayBefore', { name: 'Mira', locale: 'EN' }, shift);
    expect(mail.subject).toBe('Tomorrow: Bar Theokot');
    expect(mail.text).toContain('Hi Mira');
    expect(mail.text).toContain('Where: Alma 2');
  });

  it('toont de tijd in Brusselse tijd, niet in UTC', () => {
    // De shift begint om 17:00 UTC, dus 19:00 bij ons in de zomer. Een mail met
    // het verkeerde uur is erger dan geen mail.
    const mail = shiftReminderMail('dayBefore', { name: 'Jonas', locale: 'NL' }, shift);
    expect(mail.text).toContain('19:00');
    expect(mail.text).toContain('22:00');
  });

  it('laat de bonnetjesregel weg wanneer er niets te verdienen valt', () => {
    const mail = shiftReminderMail('soon', { name: 'Jonas', locale: 'NL' }, { ...shift, reward: 0 });
    expect(mail.text).not.toContain('bonnetje');
  });

  it('schrijft één bonnetje in het enkelvoud', () => {
    const mail = shiftReminderMail('soon', { name: 'Jonas', locale: 'NL' }, { ...shift, reward: 1 });
    expect(mail.text).toContain('1 bonnetje ');
  });
});
