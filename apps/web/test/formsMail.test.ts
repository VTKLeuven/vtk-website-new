import { describe, expect, it } from 'vitest';
import {
  answersAsText,
  confirmationMail,
  draftReminderMail,
  fillPlaceholders,
  notificationMail,
} from '@/lib/forms/mail';

describe('plaatshouders', () => {
  it('vult bekende namen in', () => {
    expect(fillPlaceholders('Dag {{naam}}, bedankt!', { naam: 'Jan' })).toBe('Dag Jan, bedankt!');
    expect(fillPlaceholders('Hallo {{ naam }}', { naam: 'Jan' })).toBe('Hallo Jan');
    expect(fillPlaceholders('Hallo {{NAAM}}', { naam: 'Jan' })).toBe('Hallo Jan');
  });

  it('laat een onbekende plaatshouder staan zoals ze is', () => {
    // Stil leegmaken zou een tikfout onzichtbaar maken voor wie het sjabloon
    // schreef; nu ziet die het in het voorbeeld staan.
    expect(fillPlaceholders('Dag {{voornaam}}', { naam: 'Jan' })).toBe('Dag {{voornaam}}');
  });

  it('vult een lege waarde wel in', () => {
    expect(fillPlaceholders('Dag {{naam}}!', { naam: '' })).toBe('Dag !');
  });
});

describe('bevestigingsmail', () => {
  const base = {
    locale: 'nl' as const,
    formTitle: 'Inschrijving galabal',
    slug: 'galabal',
    recipient: 'jan@example.test',
    recipientName: 'Jan',
    subject: null,
    body: null,
    answers: [
      { label: 'Kom je?', value: 'Ja, met partner' },
      { label: 'Naam partner', value: 'Marie' },
    ],
    includeAnswers: true,
  };

  it('valt terug op een eigen onderwerp en tekst', () => {
    const mail = confirmationMail(base);
    expect(mail.subject).toBe('Bevestiging: Inschrijving galabal');
    expect(mail.text).toContain('Dag Jan,');
    expect(mail.text).toContain('Kom je?: Ja, met partner');
  });

  it('gebruikt de tekst van de beheerder, met plaatshouders ingevuld', () => {
    const mail = confirmationMail({
      ...base,
      subject: 'Tot op {{formulier}}',
      body: 'Dag {{naam}}, je plaats staat vast.',
    });
    expect(mail.subject).toBe('Tot op Inschrijving galabal');
    expect(mail.text).toContain('Dag Jan, je plaats staat vast.');
  });

  it('laat de antwoorden weg wanneer dat uitstaat', () => {
    const mail = confirmationMail({ ...base, includeAnswers: false, answers: [] });
    expect(mail.text).not.toContain('Kom je?');
  });

  it('steekt er een agenda-item bij wanneer er een evenement aan hangt', () => {
    const mail = confirmationMail({
      ...base,
      event: {
        id: 'event-1',
        title: 'Galabal 2027',
        start: new Date('2027-03-01T19:00:00Z'),
        end: new Date('2027-03-02T02:00:00Z'),
        location: 'Aula',
      },
    });
    expect(mail.attachments).toHaveLength(1);
    const ics = mail.attachments?.[0].content.toString('utf8') ?? '';
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Galabal 2027');
    expect(ics).toContain('LOCATION:Aula');
  });

  it('spreekt Engels wanneer de inzending dat was', () => {
    const mail = confirmationMail({ ...base, locale: 'en' });
    expect(mail.subject).toBe('Confirmation: Inschrijving galabal');
    expect(mail.text).toContain('Hi Jan,');
  });
});

describe('overige mails', () => {
  it('zet de antwoorden in de melding aan de organisatoren', () => {
    const mail = notificationMail({
      formTitle: 'Inschrijving galabal',
      slug: 'galabal',
      recipients: ['activiteiten@vtk.be', 'praeses@vtk.be'],
      submitterName: 'Jan',
      submitterEmail: 'jan@example.test',
      answers: [{ label: 'Kom je?', value: 'Ja' }],
      entryCount: 12,
    });
    expect(mail.to).toBe('activiteiten@vtk.be, praeses@vtk.be');
    expect(mail.subject).toContain('Nieuwe inzending');
    expect(mail.text).toContain('Kom je?: Ja');
  });

  it('noemt de deadline in de herinnering', () => {
    const mail = draftReminderMail({
      locale: 'nl',
      formTitle: 'Inschrijving galabal',
      slug: 'galabal',
      recipient: 'jan@example.test',
      recipientName: 'Jan',
      closesAt: new Date('2027-02-28T22:00:00Z'),
    });
    expect(mail.subject).toContain('nog niet verstuurd');
    // Brussel is in februari UTC+1, dus 23:00 lokaal.
    expect(mail.text).toContain('23:00');
  });

  it('zet antwoorden om naar leesbare regels', () => {
    expect(answersAsText([{ label: 'A', value: '1' }, { label: 'B', value: '2' }])).toBe(
      'A: 1\nB: 2'
    );
  });
});
