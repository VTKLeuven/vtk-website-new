import { describe, expect, it } from 'vitest';
import {
  missingTranslations,
  type TranslatableField,
  type TranslatableForm,
} from '@/lib/forms/translation';

function form(overrides: Partial<TranslatableForm> = {}): TranslatableForm {
  return {
    localeMode: 'BOTH',
    titleEn: 'Gala sign-up',
    introNl: null,
    introEn: null,
    thankYouNl: null,
    thankYouEn: null,
    requireConsent: false,
    consentTextNl: null,
    consentTextEn: null,
    confirmationEnabled: false,
    confirmationSubjectNl: null,
    confirmationSubjectEn: null,
    confirmationBodyNl: null,
    confirmationBodyEn: null,
    ...overrides,
  };
}

function field(overrides: Partial<TranslatableField> = {}): TranslatableField {
  return {
    code: 'naam',
    labelNl: 'Wat is je naam?',
    labelEn: 'What is your name?',
    helpNl: null,
    helpEn: null,
    ...overrides,
  };
}

describe('ontbrekende vertalingen', () => {
  it('zwijgt wanneer alles vertaald is', () => {
    expect(missingTranslations(form(), [field()])).toEqual([]);
  });

  it('zwijgt wanneer het formulier bewust maar één taal aanbiedt', () => {
    // Enkel Nederlands is een keuze, geen vergetelheid.
    const gaps = missingTranslations(
      form({ localeMode: 'NL_ONLY', titleEn: null }),
      [field({ labelEn: null })]
    );
    expect(gaps).toEqual([]);
  });

  it('meldt een vraag zonder Engelse tekst met haar eigen naam erbij', () => {
    const gaps = missingTranslations(form(), [
      field({ labelNl: 'Kom je?', labelEn: null }),
    ]);
    expect(gaps).toEqual([{ what: 'Vraag "Kom je?"', where: 'field' }]);
  });

  it('telt een lege string als ontbrekend', () => {
    expect(missingTranslations(form({ titleEn: '   ' }), [field()])).toContainEqual({
      what: 'Titel',
      where: 'settings',
    });
  });

  it('vraagt geen vertaling voor een tekst die in het Nederlands ook leeg is', () => {
    // Geen introductie is geen ontbrekende vertaling.
    expect(missingTranslations(form({ introNl: null, introEn: null }), [field()])).toEqual([]);
    expect(
      missingTranslations(form({ introNl: 'Welkom', introEn: null }), [field()])
    ).toContainEqual({ what: 'Introductie', where: 'settings' });
  });

  it('slaat gearchiveerde velden en opties over', () => {
    const gaps = missingTranslations(form(), [
      field({ labelNl: 'Oude vraag', labelEn: null, archivedAt: new Date() }),
      field({
        labelNl: 'Shift',
        labelEn: 'Shift',
        options: [
          { code: 'a', labelNl: 'Vroeg', labelEn: null, archivedAt: new Date() },
          { code: 'b', labelNl: 'Laat', labelEn: null },
        ],
      }),
    ]);
    expect(gaps).toEqual([{ what: 'Optie "Laat" bij "Shift"', where: 'option' }]);
  });

  it('kijkt enkel naar de bevestigingsmail wanneer die aanstaat', () => {
    const uit = form({ confirmationBodyNl: 'Bedankt', confirmationBodyEn: null });
    expect(missingTranslations(uit, [field()])).toEqual([]);

    const aan = form({
      confirmationEnabled: true,
      confirmationBodyNl: 'Bedankt',
      confirmationBodyEn: null,
    });
    expect(missingTranslations(aan, [field()])).toContainEqual({
      what: 'Tekst bevestigingsmail',
      where: 'settings',
    });
  });

  it('kijkt enkel naar de toestemmingstekst wanneer die gevraagd wordt', () => {
    const aan = form({
      requireConsent: true,
      consentTextNl: 'Ik ga akkoord',
      consentTextEn: null,
    });
    expect(missingTranslations(aan, [field()])).toContainEqual({
      what: 'Toestemmingstekst',
      where: 'settings',
    });
  });

  it('meldt een sectie zonder Engelse titel', () => {
    const gaps = missingTranslations(form(), [field()], [
      { titleNl: 'Praktisch', titleEn: null },
    ]);
    expect(gaps).toEqual([{ what: 'Sectie "Praktisch"', where: 'section' }]);
  });
});
